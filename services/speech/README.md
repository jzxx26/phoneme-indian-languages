# Open-source pronunciation scoring service

A free, self-hosted alternative to Azure Pronunciation Assessment. No cloud
account, no card. The Next.js app uses it when `ASSESSMENT_PROVIDER=mms`.

## How it scores

1. **Acoustic model:** [Meta MMS](https://huggingface.co/facebook/mms-1b-all)
   (`facebook/mms-1b-all`), a single wav2vec2 model with per-language adapters
   for 1,100+ languages, Tamil, Hindi and English included. For each 20 ms of
   audio it outputs the probability of every character in that language's
   script.
2. **Forced alignment:** the reference text's characters are aligned to the
   audio with CTC Viterbi, so we know where the learner said each expected
   character.
3. **Character score:** how confident the model is that it heard *exactly that
   character* at that point (a goodness-of-pronunciation style score). The word
   accuracy is the mean over the word's characters, scaled to 0-100.
4. **Missed and extra words:** the free transcription is aligned with the
   reference at word level. A reference word with very low confidence and no
   counterpart is reported as `Omission`. An extra spoken word is reported as
   `Insertion`.
5. **Fluency:** starts at 100 and loses points for pauses between words longer
   than 0.3 s and for inserted words. It's only computed for two or more words.
6. **Overall:** `0.6 × accuracy + 0.2 × fluency + 0.2 × completeness`. For a
   single word it's `0.8 × accuracy + 0.2 × completeness`.

The results come back in the same shape as Azure's, so the UI and database
need no changes. All the scoring is in [`scoring.py`](scoring.py) and is unit
tested on synthetic model output.

**Limitations, compared with Azure.** The scores are model-confidence
heuristics, not calibrated against human raters. There is no prosody score.
Spoken letter-by-letter spelling is not supported, because the model scores
characters and not letter names.

**Licence.** The MMS weights are licensed CC-BY-NC 4.0 (non-commercial). That's
fine for a student project, but needs replacing before any commercial use.

## Run it

Needs [uv](https://docs.astral.sh/uv/). The first start downloads the model,
about 4 GB, into `~/.cache/huggingface`.

```bash
cd services/speech
uv sync
uv run uvicorn app:app --host 127.0.0.1 --port 8765
```

If PyTorch and transformers are already installed system-wide, you can reuse them instead of
downloading PyTorch again (about 2.5 GB):

```bash
uv venv --system-site-packages && uv pip install python-multipart pytest "regex>=2025.10.22"
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

It uses a CUDA GPU when one is available. A 1B model in fp16 needs about 3 GB of
VRAM. Otherwise it runs on the CPU, which is slower (a few seconds per
recording) and needs about 5 GB of RAM. Set `MMS_DEVICE=cpu` to force the CPU.

Then, in the app's `.env.local`:

```bash
ASSESSMENT_PROVIDER=mms
# SPEECH_SERVICE_URL=http://127.0.0.1:8765   # the default
```

Check that it's up with `curl http://127.0.0.1:8765/health`.

To expose the service beyond localhost, start it with `SPEECH_SERVICE_TOKEN=<secret>`
and set the same `SPEECH_SERVICE_TOKEN` in the app's `.env.local`.

## Tests

```bash
uv run --group dev pytest
```

## Adding a language

Add the app locale to `LOCALE_TO_MMS` in [`model.py`](model.py). The value is
the MMS adapter's ISO 639-3 code; the supported list is on the model card.
