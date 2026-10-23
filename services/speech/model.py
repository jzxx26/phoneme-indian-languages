"""
Meta MMS acoustic model wrapper.

`facebook/mms-1b-all` is one wav2vec2 model with small per-language adapters
covering 1,100+ languages. We load it once and swap the adapter (and the
matching character vocabulary) when a request arrives for another language.

Model card / licence (CC-BY-NC 4.0): https://huggingface.co/facebook/mms-1b-all
"""

from __future__ import annotations

import os
import threading

import numpy as np
import torch
from transformers import AutoProcessor, Wav2Vec2ForCTC

from scoring import ScoringError, Vocabulary

MODEL_ID = os.environ.get("MMS_MODEL_ID", "facebook/mms-1b-all")
SAMPLE_RATE = 16_000

# App locale (BCP-47) -> MMS adapter (ISO 639-3).
LOCALE_TO_MMS = {
    "ta-IN": "tam",
    "hi-IN": "hin",
    "en-IN": "eng",
    "kn-IN": "kan",
    "te-IN": "tel",
    "ml-IN": "mal",
    "mr-IN": "mar",
    "bn-IN": "ben",
    "gu-IN": "guj",
}


def mms_language_for(locale: str) -> str:
    for known, code in LOCALE_TO_MMS.items():
        if known.lower() == locale.lower():
            return code
    raise ScoringError(
        "locale_unsupported",
        f"The open-source engine has no model mapping for locale {locale}.",
        400,
    )


class MmsModel:
    def __init__(self) -> None:
        self.device = os.environ.get("MMS_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
        dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)
        self.model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID, dtype=dtype).to(self.device).eval()
        self.dtype = dtype
        self.language: str | None = None
        # One model, one adapter at a time: serialise switching + inference.
        self._lock = threading.Lock()

    def _use_language(self, language: str) -> None:
        if language == self.language:
            return
        self.processor.tokenizer.set_target_lang(language)
        self.model.load_adapter(language)
        self.model.to(device=self.device, dtype=self.dtype)
        self.language = language

    def vocabulary(self) -> Vocabulary:
        tokenizer = self.processor.tokenizer
        return Vocabulary(
            token_to_id=dict(tokenizer.get_vocab()),
            blank_id=int(tokenizer.pad_token_id),
            delimiter=tokenizer.word_delimiter_token,
        )

    def emissions(self, audio: np.ndarray, locale: str) -> tuple[np.ndarray, Vocabulary]:
        """Per-frame log-probabilities (T x V) for `audio` (16 kHz mono float32)."""
        language = mms_language_for(locale)
        with self._lock:
            self._use_language(language)
            inputs = self.processor(audio, sampling_rate=SAMPLE_RATE, return_tensors="pt")
            values = inputs["input_values"].to(device=self.device, dtype=self.dtype)
            with torch.inference_mode():
                logits = self.model(values).logits[0]
            log_probs = torch.log_softmax(logits.float(), dim=-1).cpu().numpy()
            return log_probs, self.vocabulary()
