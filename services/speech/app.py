"""
Open-source pronunciation scoring service.

    POST /assess   multipart: audio (16 kHz mono PCM WAV), reference_text, locale
    GET  /tts      ?text=...&locale=...  -> MP3 of a neural voice saying `text`
    GET  /health

Called only by the Next.js route handler (src/lib/assessment/mms.ts), never by
the browser. Run it with:

    uv run uvicorn app:app --host 127.0.0.1 --port 8765

If SPEECH_SERVICE_TOKEN is set, requests must send `Authorization: Bearer <token>`.
"""

from __future__ import annotations

import asyncio
import hmac
import io
import os
import wave
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, File, Form, Header, Query, UploadFile
from fastapi.responses import JSONResponse, Response

from scoring import ScoringError, score_pronunciation

SAMPLE_RATE = 16_000
MAX_SECONDS = 30
# Quieter than this (RMS of [-1, 1] samples) is treated as silence.
SILENCE_RMS = 0.003
# 30 s of 16 kHz mono 16-bit PCM is ~960 KB; matches the app's own upload cap.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024

# Teach-aloud voices. Browsers often ship no voice for Indian languages, so the
# service generates the audio. First choice: Microsoft Edge neural voices via
# edge-tts (free, no key, needs internet).
TTS_VOICES = {
    "ta-in": "ta-IN-PallaviNeural",
    "hi-in": "hi-IN-SwaraNeural",
    "en-in": "en-IN-NeerjaNeural",
    "kn-in": "kn-IN-SapnaNeural",
    "te-in": "te-IN-ShrutiNeural",
    "ml-in": "ml-IN-SobhanaNeural",
    "mr-in": "mr-IN-AarohiNeural",
    "bn-in": "bn-IN-TanishaaNeural",
    "gu-in": "gu-IN-DhwaniNeural",
}
# Fallback for locales with no Edge neural voice: Google Translate's voice via
# gTTS (free, no key, needs internet). Value is the gTTS language code.
GTTS_LANGS = {
    "pa-in": "pa",
}
MAX_TTS_CHARS = 200

_model = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _model
    from model import MmsModel  # heavy import: torch + transformers

    _model = MmsModel()
    yield


app = FastAPI(title="Pronunciation scoring (MMS)", lifespan=lifespan)


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def decode_wav(data: bytes) -> np.ndarray:
    """PCM WAV -> 16 kHz mono float32 in [-1, 1]."""
    try:
        with wave.open(io.BytesIO(data)) as wav:
            channels, width, rate = wav.getnchannels(), wav.getsampwidth(), wav.getframerate()
            # Validate the header before reading or resampling anything, so a
            # forged header cannot inflate a small upload into a huge array.
            if not (1 <= channels <= 2 and 8_000 <= rate <= 48_000):
                raise ScoringError("provider_rejected_audio", "Unsupported WAV channel count or sample rate.", 400)
            if wav.getnframes() > rate * MAX_SECONDS:
                raise ScoringError("provider_rejected_audio", "Recording is longer than 30 seconds.", 400)
            frames = wav.readframes(wav.getnframes())
    except (wave.Error, EOFError) as exc:
        raise ScoringError("provider_rejected_audio", f"Expected a PCM WAV file ({exc}).", 400) from exc

    if width != 2:
        raise ScoringError("provider_rejected_audio", "Expected 16-bit PCM WAV audio.", 400)

    audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    if rate != SAMPLE_RATE:
        duration = audio.size / rate
        target = np.linspace(0, audio.size - 1, int(duration * SAMPLE_RATE))
        audio = np.interp(target, np.arange(audio.size), audio).astype(np.float32)
    return audio


def _authorized(authorization: str | None) -> bool:
    expected_token = os.environ.get("SPEECH_SERVICE_TOKEN", "").strip()
    if not expected_token:
        return True
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    return hmac.compare_digest(supplied, expected_token)


async def _edge_tts(text: str, voice: str, slow: bool) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate="-15%" if slow else "+0%")
    audio = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    return bytes(audio)


def _gtts(text: str, lang: str, slow: bool) -> bytes:
    """Blocking (network) - call via asyncio.to_thread."""
    from gtts import gTTS

    buffer = io.BytesIO()
    gTTS(text=text, lang=lang, slow=slow).write_to_fp(buffer)
    return buffer.getvalue()


@app.get("/tts")
async def tts(
    text: str = Query(..., min_length=1, max_length=MAX_TTS_CHARS),
    locale: str = Query(...),
    slow: bool = Query(default=True),
    authorization: str | None = Header(default=None),
):
    if not _authorized(authorization):
        return _error(401, "provider_unauthorized", "Invalid speech service token.")
    voice = TTS_VOICES.get(locale.lower())
    gtts_lang = GTTS_LANGS.get(locale.lower())
    if voice is None and gtts_lang is None:
        return _error(400, "locale_unsupported", f"No teaching voice for locale {locale}.")

    try:
        if voice is not None:
            audio = await _edge_tts(text, voice, slow)
        else:
            audio = await asyncio.to_thread(_gtts, text, gtts_lang, slow)
    except Exception:  # network / upstream failure
        return _error(503, "provider_unavailable", "The teaching voice is unavailable right now.")
    if not audio:
        return _error(503, "provider_unavailable", "The teaching voice returned no audio.")
    return Response(audio, media_type="audio/mpeg")


@app.get("/health")
def health():
    return {
        "status": "ok" if _model is not None else "loading",
        "device": getattr(_model, "device", None),
        "language": getattr(_model, "language", None),
    }


@app.post("/assess")
def assess(
    audio: UploadFile = File(...),
    reference_text: str = Form(...),
    locale: str = Form(...),
    authorization: str | None = Header(default=None),
):
    if not _authorized(authorization):
        return _error(401, "provider_unauthorized", "Invalid speech service token.")

    try:
        data = audio.file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise ScoringError("provider_rejected_audio", "Recording is too large.", 413)
        samples = decode_wav(data)
        if samples.size > SAMPLE_RATE * MAX_SECONDS:
            raise ScoringError("provider_rejected_audio", "Recording is longer than 30 seconds.", 400)
        if samples.size < SAMPLE_RATE // 4 or float(np.sqrt(np.mean(samples**2))) < SILENCE_RMS:
            raise ScoringError(
                "no_speech_detected",
                "The recording is silent. Check your microphone and try again.",
            )
        log_probs, vocab = _model.emissions(samples, locale)
        return score_pronunciation(log_probs, reference_text, vocab)
    except ScoringError as exc:
        return _error(exc.status, exc.code, exc.message)
