"""Scoring tests on synthetic CTC emissions - no model download needed."""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scoring import (  # noqa: E402
    ScoringError,
    Vocabulary,
    align_words,
    ctc_forced_align,
    normalize_text,
    score_pronunciation,
)

TOKENS = ["<pad>", "|", "<unk>", *"abcdefghijklmnopqrstuvwxyz", "அ", "ம", "்", "ா"]
VOCAB = Vocabulary(token_to_id={t: i for i, t in enumerate(TOKENS)}, blank_id=0)


def emissions(spoken: str, peak: float = 0.95, blanks_between: int = 2, pause_frames: int = 0) -> np.ndarray:
    """
    Fake model output for `spoken`: each character peaks for one frame,
    separated by blank frames; a space emits the word delimiter, optionally
    followed by `pause_frames` of extra silence.
    """
    rows: list[int] = [0, 0]
    for ch in spoken:
        token = VOCAB.token_to_id["|"] if ch == " " else VOCAB.token_to_id[ch]
        rows.append(token)
        rows.extend([0] * blanks_between)
        if ch == " ":
            rows.extend([0] * pause_frames)
    rows.extend([0, 0])

    size = len(TOKENS)
    probs = np.full((len(rows), size), (1 - peak) / (size - 1))
    for t, token in enumerate(rows):
        probs[t, token] = peak
    return np.log(probs)


def test_normalize_text_strips_punctuation_and_case():
    assert normalize_text("Hello, World!  ") == "hello world"
    assert normalize_text("नमस्ते।") == "नमस्ते"


def test_forced_align_assigns_every_target():
    lp = emissions("ab")
    targets = [VOCAB.token_to_id["a"], VOCAB.token_to_id["b"]]
    path = ctc_forced_align(lp, targets, blank=0)
    assert path is not None
    assert set(path[path >= 0].tolist()) == {0, 1}
    # Order is preserved.
    assert np.nonzero(path == 0)[0].max() < np.nonzero(path == 1)[0].min()


def test_forced_align_handles_repeated_characters():
    lp = emissions("aa")
    path = ctc_forced_align(lp, [VOCAB.token_to_id["a"]] * 2, blank=0)
    assert path is not None and set(path[path >= 0].tolist()) == {0, 1}


def test_forced_align_rejects_audio_too_short():
    lp = emissions("a")[:1]
    assert ctc_forced_align(lp, [VOCAB.token_to_id["a"]] * 3, blank=0) is None


def test_correct_pronunciation_scores_high():
    result = score_pronunciation(emissions("good day"), "Good day", VOCAB)
    assert result["recognizedText"] == "good day"
    assert result["accuracyScore"] > 90
    assert result["completenessScore"] == 100
    assert result["fluencyScore"] == 100
    assert all(w["errorType"] == "None" for w in result["words"])


def test_mispronounced_word_is_flagged():
    result = score_pronunciation(emissions("good dxy"), "good day", VOCAB)
    by_word = {w["word"]: w for w in result["words"]}
    assert by_word["good"]["errorType"] == "None"
    assert by_word["day"]["accuracyScore"] < by_word["good"]["accuracyScore"]


def test_omitted_word():
    result = score_pronunciation(emissions("good"), "good day", VOCAB)
    by_word = {w["word"]: w for w in result["words"]}
    assert by_word["day"]["errorType"] == "Omission"
    assert by_word["day"]["accuracyScore"] is None
    assert result["completenessScore"] == 50


def test_inserted_word():
    result = score_pronunciation(emissions("good big day"), "good day", VOCAB)
    assert [w["word"] for w in result["words"]] == ["good", "big", "day"]
    assert result["words"][1]["errorType"] == "Insertion"


def test_long_pause_lowers_fluency():
    fluent = score_pronunciation(emissions("good day"), "good day", VOCAB)
    halting = score_pronunciation(emissions("good day", pause_frames=75), "good day", VOCAB)
    assert halting["fluencyScore"] < fluent["fluencyScore"]


def test_single_word_has_no_fluency():
    result = score_pronunciation(emissions("good"), "good", VOCAB)
    assert result["fluencyScore"] is None
    assert result["pronunciationScore"] is not None


def test_indic_script_with_combining_marks():
    result = score_pronunciation(emissions("அம்மா"), "அம்மா", VOCAB)
    assert result["words"][0]["errorType"] == "None"


def test_silence_raises_no_speech():
    lp = np.log(np.full((40, len(TOKENS)), 0.001))
    lp[:, 0] = np.log(0.97)
    with pytest.raises(ScoringError) as info:
        score_pronunciation(lp, "good", VOCAB)
    assert info.value.code == "no_speech_detected"


def test_align_words_pairs_similar_words():
    pairs = align_words(["good", "day"], ["god", "day"])
    assert pairs == [(0, 0), (1, 1)]


def test_trailing_delimiter_run_does_not_swallow_last_word():
    # MMS emits long runs of the word delimiter over trailing silence; the last
    # word must still be aligned where it was spoken, not pushed into silence.
    lp = emissions("good day")
    size = len(TOKENS)
    silence = np.full((40, size), 0.001 / (size - 1))
    silence[:, VOCAB.token_to_id["|"]] = 0.999
    result = score_pronunciation(np.vstack([lp, np.log(silence)]), "good day", VOCAB)
    assert result["words"][-1]["accuracyScore"] > 90
    assert result["fluencyScore"] == 100


def test_saying_a_different_sentence_scores_low():
    result = score_pronunciation(emissions("big cat"), "good day", VOCAB)
    assert {w["errorType"] for w in result["words"] if w["word"] in ("good", "day")} == {"Omission"}
    assert result["completenessScore"] == 0
    assert result["pronunciationScore"] < 30


def test_skipped_word_counts_against_accuracy():
    full = score_pronunciation(emissions("good day"), "good day", VOCAB)
    skipped = score_pronunciation(emissions("good"), "good day", VOCAB)
    assert skipped["accuracyScore"] < 60 < full["accuracyScore"]


def test_compound_split_in_two_is_not_an_extra_word():
    # The recogniser hears "goodday" as "good day": not an insertion.
    result = score_pronunciation(emissions("good day"), "goodday", VOCAB)
    assert [w["errorType"] for w in result["words"]] == ["None"]
    assert result["completenessScore"] == 100
