"""
Pronunciation scoring from CTC emissions - no model code in here.

Given the per-frame log-probabilities of a character-level CTC acoustic model
(Meta MMS) and the reference text, this module:

1. Forced-aligns the reference characters to the audio (CTC Viterbi), which
   tells us *where* the learner said each expected character.
2. Scores each character by how confident the model is that it heard exactly
   that character at that place (a "goodness of pronunciation" style score).
3. Compares the free (greedy) transcription with the reference at word level to
   find omitted and inserted words.
4. Derives word accuracy, completeness and pause-based fluency, and combines
   them into an overall pronunciation score on the same 0-100 scale the app
   uses for Azure.

Everything here is plain numpy so it can be unit-tested with synthetic
emissions, without downloading the model.
"""

from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass

import numpy as np

# 20 ms per frame for wav2vec2 / MMS at 16 kHz.
FRAME_SECONDS = 0.02

# Below this a word is reported as mispronounced (matches the UI's "weak" band).
MISPRONOUNCED_BELOW = 60.0
# A word with no counterpart in the free transcription is treated as not said
# at all when its mean character confidence is below this. The bar is lenient
# because forced alignment can lend a skipped word a neighbour's shared sound
# (e.g. the "d" of "good" for a skipped "day").
OMITTED_CONFIDENCE = 0.5
# Pauses between words shorter than this are natural; only the excess counts.
NATURAL_PAUSE_SECONDS = 0.30
FLUENCY_PENALTY_PER_PAUSE_SECOND = 25.0
FLUENCY_PENALTY_PER_INSERTION = 10.0


class ScoringError(Exception):
    """Raised with a stable code the API layer turns into an HTTP error."""

    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------
# Text handling
# ---------------------------------------------------------------------------


def normalize_text(text: str) -> str:
    """NFC, lower-case, punctuation (incl. the Devanagari danda) removed."""
    text = unicodedata.normalize("NFC", text).lower()
    kept = [" " if unicodedata.category(ch).startswith(("P", "S")) else ch for ch in text]
    return " ".join("".join(kept).split())


def word_to_token_ids(word: str, vocab: dict[str, int]) -> list[int]:
    """
    Map a word to vocabulary ids character by character.

    A character missing from the vocabulary is retried in decomposed (NFD) form,
    because some scripts' vowel signs exist in the vocabulary only in one form.
    Characters that still cannot be mapped are skipped.
    """
    ids: list[int] = []
    for ch in word:
        if ch in vocab:
            ids.append(vocab[ch])
            continue
        for part in unicodedata.normalize("NFD", ch):
            if part in vocab:
                ids.append(vocab[part])
    return ids


# ---------------------------------------------------------------------------
# CTC
# ---------------------------------------------------------------------------


def ctc_forced_align(log_probs: np.ndarray, targets: list[int], blank: int) -> np.ndarray | None:
    """
    Viterbi alignment of `targets` to `log_probs` (T x V) under CTC rules.

    Returns, for every frame, the index of the target it is aligned to, or -1
    for blank frames. Returns None when the audio is too short to fit the text.
    """
    num_frames = log_probs.shape[0]
    num_targets = len(targets)
    if num_targets == 0:
        return None

    states = 2 * num_targets + 1
    ext = np.full(states, blank, dtype=np.int64)
    ext[1::2] = targets

    can_skip = np.zeros(states, dtype=bool)
    for s in range(2, states):
        can_skip[s] = ext[s] != blank and ext[s] != ext[s - 2]

    neg = -np.inf
    emit = log_probs[:, ext]  # T x S
    score = np.full(states, neg)
    score[0] = emit[0, 0]
    if states > 1:
        score[1] = emit[0, 1]
    back = np.zeros((num_frames, states), dtype=np.int8)

    for t in range(1, num_frames):
        stay = score
        step = np.concatenate(([neg], score[:-1]))
        skip = np.concatenate(([neg, neg], score[:-2]))
        skip = np.where(can_skip, skip, neg)
        candidates = np.stack([stay, step, skip])
        choice = np.argmax(candidates, axis=0)
        score = candidates[choice, np.arange(states)] + emit[t]
        back[t] = choice

    if states == 1:
        end = 0
    else:
        end = states - 1 if score[states - 1] >= score[states - 2] else states - 2
    if not np.isfinite(score[end]):
        return None

    path = np.empty(num_frames, dtype=np.int64)
    s = end
    for t in range(num_frames - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])

    return np.where(path % 2 == 1, (path - 1) // 2, -1)


def greedy_decode(log_probs: np.ndarray, id_to_token: dict[int, str], blank: int, delimiter: str) -> str:
    """Best-path CTC decoding: argmax per frame, collapse repeats, drop blanks."""
    best = np.argmax(log_probs, axis=1)
    chars: list[str] = []
    previous = -1
    for idx in best:
        idx = int(idx)
        if idx != previous and idx != blank:
            token = id_to_token.get(idx, "")
            chars.append(" " if token == delimiter else token)
        previous = idx
    return " ".join("".join(chars).replace("<unk>", "").split())


# ---------------------------------------------------------------------------
# Word-level comparison of reference vs. what was freely recognised
# ---------------------------------------------------------------------------


def _char_similarity(a: str, b: str) -> float:
    """1 - normalised Levenshtein distance between two words."""
    if not a and not b:
        return 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return 1.0 - prev[-1] / max(len(a), len(b))


# Two words less similar than this are never paired: the reference word was
# not said (omission) and the heard word is extra (insertion).
MIN_WORD_SIMILARITY = 0.5


def _substitution_cost(a: str, b: str) -> float:
    similarity = _char_similarity(a, b)
    # Above the delete + insert cost (2), so dissimilar words are never paired.
    return 1.0 - similarity if similarity >= MIN_WORD_SIMILARITY else 2.5


def align_words(reference: list[str], hypothesis: list[str]) -> list[tuple[int | None, int | None]]:
    """
    Levenshtein alignment at word level, where substituting two similar words
    is cheap and dissimilar words cannot be paired. Returns (ref_index,
    hyp_index) pairs; None marks a gap.
    """
    n, m = len(reference), len(hypothesis)
    cost = np.zeros((n + 1, m + 1))
    cost[:, 0] = np.arange(n + 1)
    cost[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = _substitution_cost(reference[i - 1], hypothesis[j - 1])
            cost[i, j] = min(cost[i - 1, j] + 1, cost[i, j - 1] + 1, cost[i - 1, j - 1] + sub)

    pairs: list[tuple[int | None, int | None]] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            sub = _substitution_cost(reference[i - 1], hypothesis[j - 1])
            if math.isclose(cost[i, j], cost[i - 1, j - 1] + sub):
                pairs.append((i - 1, j - 1))
                i, j = i - 1, j - 1
                continue
        if i > 0 and math.isclose(cost[i, j], cost[i - 1, j] + 1):
            pairs.append((i - 1, None))
            i -= 1
        else:
            pairs.append((None, j - 1))
            j -= 1
    pairs.reverse()
    return pairs


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


@dataclass
class Vocabulary:
    token_to_id: dict[str, int]
    blank_id: int
    delimiter: str = "|"

    @property
    def id_to_token(self) -> dict[int, str]:
        return {i: t for t, i in self.token_to_id.items()}


def _round(value: float | None) -> float | None:
    if value is None or math.isnan(value):
        return None
    return round(float(value), 1)


def score_pronunciation(log_probs: np.ndarray, reference_text: str, vocab: Vocabulary) -> dict:
    """
    Score a recording against `reference_text`.

    `log_probs` is the T x V log-softmax output of the acoustic model.
    Returns a dict shaped like the app's AssessmentResult (camelCase), minus
    the `provider` field.
    """
    reference_words = normalize_text(reference_text).split()
    word_ids = [word_to_token_ids(w, vocab.token_to_id) for w in reference_words]
    scorable = [(w, ids) for w, ids in zip(reference_words, word_ids) if ids]
    if not scorable:
        raise ScoringError(
            "locale_unsupported",
            "The reference text contains no characters this language model knows.",
            400,
        )

    recognized = greedy_decode(log_probs, vocab.id_to_token, vocab.blank_id, vocab.delimiter)
    if not recognized:
        raise ScoringError(
            "no_speech_detected",
            "No recognisable speech was found in the recording. Speak clearly and try again.",
        )

    # Forced alignment of the reference characters over the whole utterance.
    # The word delimiter is folded into blank rather than aligned as a target:
    # MMS emits long runs of it over silence (e.g. after the last word), and as
    # a mandatory target it would drag the following word into that silence.
    align_log_probs = log_probs
    delimiter_id = vocab.token_to_id.get(vocab.delimiter)
    if delimiter_id is not None:
        align_log_probs = log_probs.copy()
        align_log_probs[:, vocab.blank_id] = np.logaddexp(
            log_probs[:, vocab.blank_id], log_probs[:, delimiter_id]
        )
    targets: list[int] = []
    owner: list[int] = []  # word index of each target character
    for wi, (_, ids) in enumerate(scorable):
        targets.extend(ids)
        owner.extend([wi] * len(ids))

    frame_target = ctc_forced_align(align_log_probs, targets, vocab.blank_id)
    if frame_target is None:
        raise ScoringError(
            "no_speech_detected",
            "The recording is too short for this text. Say the whole item and try again.",
        )

    probs = np.exp(log_probs)
    char_conf: dict[int, list[float]] = {wi: [] for wi in range(len(scorable))}
    word_frames: dict[int, list[int]] = {wi: [] for wi in range(len(scorable))}
    for k, wi in enumerate(owner):
        frames = np.nonzero(frame_target == k)[0]
        if frames.size == 0:
            continue
        # Confidence that this exact character was heard where it was expected.
        char_conf[wi].append(float(probs[frames, targets[k]].max()))
        word_frames[wi].extend(int(f) for f in frames)

    # Which reference words have a counterpart in the free transcription?
    hyp_words = recognized.split()
    pairs = align_words([w for w, _ in scorable], hyp_words)
    matched_ref = {r for r, h in pairs if r is not None and h is not None}

    words: list[dict] = []
    word_accuracies: list[float] = []
    omitted = 0
    ref_to_output: dict[int, int] = {}
    for wi, (word, _) in enumerate(scorable):
        mean_conf = float(np.mean(char_conf[wi])) if char_conf[wi] else 0.0
        accuracy = 100.0 * mean_conf
        if mean_conf < OMITTED_CONFIDENCE and wi not in matched_ref:
            omitted += 1
            word_accuracies.append(0.0)  # a missed word counts as 0 accuracy
            ref_to_output[wi] = len(words)
            words.append({"word": word, "accuracyScore": None, "errorType": "Omission"})
            continue
        word_accuracies.append(accuracy)
        ref_to_output[wi] = len(words)
        words.append(
            {
                "word": word,
                "accuracyScore": _round(accuracy),
                "errorType": "Mispronunciation" if accuracy < MISPRONOUNCED_BELOW else "None",
            }
        )

    # Extra words the learner said that are not in the reference. A compound
    # the recogniser split in two (e.g. "मुझसा" heard as "मुझ सा") is not extra:
    # joined with a neighbour it matches a reference word.
    reference_set = [w for w, _ in scorable]

    def is_split_fragment(h: int) -> bool:
        joined = []
        if h > 0:
            joined.append(hyp_words[h - 1] + hyp_words[h])
        if h + 1 < len(hyp_words):
            joined.append(hyp_words[h] + hyp_words[h + 1])
        return any(_char_similarity(j, ref) >= 0.8 for j in joined for ref in reference_set)

    insertions = 0
    insert_after: list[tuple[int, str]] = []
    last_ref = -1
    for r, h in pairs:
        if r is not None:
            last_ref = r
        elif h is not None and len(hyp_words[h]) >= 2 and not is_split_fragment(h):
            insertions += 1
            insert_after.append((last_ref, hyp_words[h]))
    for last_ref_index, extra in reversed(insert_after):
        position = ref_to_output[last_ref_index] + 1 if last_ref_index >= 0 else 0
        words.insert(position, {"word": extra, "accuracyScore": None, "errorType": "Insertion"})

    accuracy_score = float(np.mean(word_accuracies)) if word_accuracies else 0.0
    completeness_score = 100.0 * (len(scorable) - omitted) / len(scorable)

    # Fluency: only meaningful with at least two spoken words.
    spoken = [wi for wi in range(len(scorable)) if word_frames[wi] and words[ref_to_output[wi]]["errorType"] != "Omission"]
    fluency_score: float | None = None
    if len(spoken) >= 2:
        excess_pause = 0.0
        for a, b in zip(spoken, spoken[1:]):
            gap = (min(word_frames[b]) - max(word_frames[a]) - 1) * FRAME_SECONDS
            excess_pause += max(0.0, gap - NATURAL_PAUSE_SECONDS)
        penalty = FLUENCY_PENALTY_PER_PAUSE_SECOND * excess_pause + FLUENCY_PENALTY_PER_INSERTION * insertions
        fluency_score = max(0.0, 100.0 - penalty)

    if fluency_score is None:
        pronunciation_score = 0.8 * accuracy_score + 0.2 * completeness_score
    else:
        pronunciation_score = 0.6 * accuracy_score + 0.2 * fluency_score + 0.2 * completeness_score

    return {
        "pronunciationScore": _round(pronunciation_score),
        "accuracyScore": _round(accuracy_score),
        "fluencyScore": _round(fluency_score),
        "completenessScore": _round(completeness_score),
        "prosodyScore": None,
        "recognizedText": recognized,
        "words": words,
    }
