"""
Open-source pronunciation scoring service.

    POST /assess   multipart: audio (16 kHz mono PCM WAV), reference_text, locale
    GET  /health

Called only by the Next.js route handler (src/lib/assessment/mms.ts), never by
the browser. Run it with:

    uv run uvicorn app:app --host 127.0.0.1 --port 8765

If SPEECH_SERVICE_TOKEN is set, requests must send `Authorization: Bearer <token>`.
"""

from __future__ import annotations

import hmac
import io
import os
import wave
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, File, Form, Header, UploadFile
from fastapi.responses import JSONResponse

from scoring import ScoringError, score_pronunciation

SAMPLE_RATE = 16_000
MAX_SECONDS = 30
# Quieter than this (RMS of [-1, 1] samples) is treated as silence.
SILENCE_RMS = 0.003
# 30 s of 16 kHz mono 16-bit PCM is ~960 KB; matches the app's own upload cap.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024

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
    expected_token = os.environ.get("SPEECH_SERVICE_TOKEN", "").strip()
    if expected_token:
        supplied = (authorization or "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(supplied, expected_token):
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
