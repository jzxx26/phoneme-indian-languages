'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { WordFeedback } from '@/components/WordFeedback';
import { RecordButton } from '@/components/RecordButton';
import { WordImage } from '@/components/WordImage';
import { SpellingPractice } from '@/components/SpellingPractice';
import { useRecorder } from '@/lib/audio/useRecorder';
import {
  cancelSpeech,
  isSpeechSynthesisSupported,
  speakWord,
} from '@/lib/audio/speech';
import type { LanguageConfig } from '@/lib/languages';
import { formatDelta, formatScore, scoreLabel, scoreTextClass } from '@/lib/scoring';
import type { AssessmentResult } from '@/lib/assessment/types';
import type { ContentKind, DifficultyLevel } from '@/types/database';

export interface PracticeSentence {
  id: string;
  text: string;
  transliteration: string | null;
  translation: string | null;
  kind: ContentKind;
  difficulty: DifficultyLevel;
  language_code: string;
  image_url?: string | null;
}

export interface SentenceProgress {
  sentence_id: string;
  attempt_count: number;
  first_score: number | null;
  latest_score: number | null;
  best_score: number | null;
}

type Phase = 'idle' | 'recording' | 'uploading' | 'done' | 'error';
type ActiveTab = 'pronunciation' | 'spelling';

const KIND_LABEL: Record<ContentKind, string> = {
  word: 'Word',
  phrase: 'Phrase',
  sentence: 'Sentence',
};

export function PracticeSession({
  language,
  sentences,
  startIndex,
  progress,
}: {
  language: LanguageConfig;
  sentences: PracticeSentence[];
  startIndex: number;
  progress: Record<string, SentenceProgress>;
}) {
  const recorder = useRecorder();

  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), sentences.length - 1));
  const sentence = sentences[index];
  const isWord = sentence.kind === 'word';

  // --- Feature 1: Show an image before teaching a word ---
  const [isWordRevealed, setIsWordRevealed] = useState(!isWord);

  // --- Feature 2: Teach before speaking ---
  const [hasBeenTaught, setHasBeenTaught] = useState(false);
  const [isSpeakingTarget, setIsSpeakingTarget] = useState(false);
  /** Set when the browser has no voice for this language. */
  const [missingVoice, setMissingVoice] = useState(false);

  // --- Feature 3: Spelling Practice mode ---
  const [activeTab, setActiveTab] = useState<ActiveTab>('pronunciation');

  // --- Standard assessment states ---
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  /** Scores recorded in this browser session, newest last, per sentence. */
  const [sessionScores, setSessionScores] = useState<Record<string, number[]>>({});

  const isSpeechSupported = isSpeechSynthesisSupported();

  // Cancel speech on unmount or when sentence changes
  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, [index]);

  const previousBest = useMemo(() => {
    const stored = progress[sentence.id]?.best_score ?? null;
    const thisSession = sessionScores[sentence.id] ?? [];
    const sessionBest = thisSession.length ? Math.max(...thisSession) : null;
    if (stored === null) return sessionBest;
    if (sessionBest === null) return stored;
    return Math.max(stored, sessionBest);
  }, [progress, sentence.id, sessionScores]);

  const previousAttemptCount =
    (progress[sentence.id]?.attempt_count ?? 0) + (sessionScores[sentence.id]?.length ?? 0);

  /** Change against the previous attempt of the same item, if there is one. */
  const delta = useMemo(() => {
    if (result?.pronunciationScore === null || result?.pronunciationScore === undefined) return null;
    const thisSession = sessionScores[sentence.id] ?? [];
    const priorInSession = thisSession.length > 1 ? thisSession[thisSession.length - 2] : null;
    const prior = priorInSession ?? progress[sentence.id]?.latest_score ?? null;
    if (prior === null) return null;
    return result.pronunciationScore - prior;
  }, [progress, result, sentence.id, sessionScores]);

  const resetOutcome = useCallback(() => {
    setResult(null);
    setApiError(null);
    setSaved(true);
    setPhase('idle');
    recorder.reset();
  }, [recorder]);

  // ---------------------------------------------------------------------------
  // Audio teaching logic
  // ---------------------------------------------------------------------------
  const handleTeachTarget = useCallback(async () => {
    if (!isSpeechSupported) {
      setHasBeenTaught(true);
      return;
    }

    setIsSpeakingTarget(true);
    const outcome = await speakWord(sentence.text, sentence.language_code, {
      onStart: () => setIsSpeakingTarget(true),
      onEnd: () => {
        setIsSpeakingTarget(false);
        setHasBeenTaught(true);
      },
    });
    setMissingVoice(outcome === 'no-voice');
  }, [isSpeechSupported, sentence.language_code, sentence.text]);

  const handleRevealWord = useCallback(() => {
    setIsWordRevealed(true);
    // Teach word aloud immediately when revealed
    handleTeachTarget();
  }, [handleTeachTarget]);

  // ---------------------------------------------------------------------------
  // Pronunciation Recording Submission
  // ---------------------------------------------------------------------------
  const submit = useCallback(
    async (audio: Blob) => {
      setPhase('uploading');
      setApiError(null);

      const body = new FormData();
      body.append('audio', audio, 'recording.wav');
      body.append('sentenceId', sentence.id);

      try {
        const response = await fetch('/api/assess', { method: 'POST', body });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setApiError(
            payload?.error?.message ??
              `Assessment failed (${response.status}). Please try recording again.`,
          );
          setPhase('error');
          return;
        }

        const assessment = payload.result as AssessmentResult;
        setResult(assessment);
        setSaved(Boolean(payload.saved));
        setPhase('done');

        if (typeof assessment.pronunciationScore === 'number') {
          setSessionScores((current) => ({
            ...current,
            [sentence.id]: [...(current[sentence.id] ?? []), assessment.pronunciationScore as number],
          }));
        }
      } catch {
        setApiError('Could not reach the server. Check your connection and try again.');
        setPhase('error');
      }
    },
    [sentence.id],
  );

  const handleStart = useCallback(async () => {
    cancelSpeech();
    setResult(null);
    setApiError(null);
    setPhase('recording');
    await recorder.start();
  }, [recorder]);

  const handleStop = useCallback(async () => {
    const audio = await recorder.stop();
    if (!audio) {
      setPhase('error');
      return;
    }
    await submit(audio.blob);
  }, [recorder, submit]);

  const goToSentence = useCallback(
    (nextIndex: number) => {
      cancelSpeech();
      const resolvedNext = ((nextIndex % sentences.length) + sentences.length) % sentences.length;
      setIndex(resolvedNext);
      const nextSentence = sentences[resolvedNext];
      setIsWordRevealed(nextSentence.kind !== 'word');
      setHasBeenTaught(false);
      setIsSpeakingTarget(false);
      setMissingVoice(false);
      setActiveTab('pronunciation');
      resetOutcome();
    },
    [resetOutcome, sentences],
  );

  const busy = phase === 'uploading' || recorder.isBusy;
  const errorMessage = apiError ?? recorder.error?.message ?? null;

  // Gate recording until taught (or learner explicitly proceeds)
  const isRecordingLocked = !hasBeenTaught && !recorder.isRecording;

  return (
    <div className="space-y-4">
      {/* Header and counter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {language.name} Practice
        </h1>
        <span className="text-sm text-slate-500">
          Item {index + 1} of {sentences.length}
        </span>
      </div>

      {/* Mode Switcher for word items (Pronunciation vs Spelling Lab) */}
      {isWord && isWordRevealed ? (
        <div className="flex rounded-xl bg-slate-100 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('pronunciation')}
            className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-all ${
              activeTab === 'pronunciation'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🗣️ Word Pronunciation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('spelling')}
            className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-all ${
              activeTab === 'spelling'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🔤 Spelling Lab
          </button>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- Target Card */}
      <Card>
        {/* Meta badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
            {KIND_LABEL[sentence.kind]}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 capitalize text-slate-600">
            {sentence.difficulty}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
            {language.code}
          </span>
          {previousAttemptCount > 0 ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
              {previousAttemptCount} previous {previousAttemptCount === 1 ? 'attempt' : 'attempts'}
              {previousBest !== null ? ` · best ${formatScore(previousBest)}` : ''}
            </span>
          ) : null}
        </div>

        {/* Feature 1: Show an image before teaching a word */}
        {isWord ? (
          <div className="mt-4">
            <WordImage
              text={sentence.text}
              translation={sentence.translation}
              customImageUrl={sentence.image_url}
              isRevealed={isWordRevealed}
              onReveal={handleRevealWord}
            />
          </div>
        ) : null}

        {/* Target word display (revealed or not a word) */}
        {isWordRevealed ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Target Word</p>

              {/* Feature 2: Audio Teaching and Replay controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTeachTarget}
                  disabled={isSpeakingTarget || recorder.isRecording}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                  title="Listen to the target word pronounced aloud"
                >
                  <span>{isSpeakingTarget ? '🔊 Speaking…' : hasBeenTaught ? '🔁 Listen Again' : '🔊 Teach Word Aloud'}</span>
                </button>
              </div>
            </div>

            {missingVoice ? (
              <p role="status" className="mt-2 text-xs text-amber-800">
                No {language.name} voice is installed in this browser, so the word cannot be played.
                You can still record your pronunciation.
              </p>
            ) : null}

            <p className={`${language.scriptClassName} mt-2 text-3xl font-semibold leading-snug text-slate-900 sm:text-4xl`}>
              {sentence.text}
            </p>

            {sentence.transliteration ? (
              <p className="mt-2 text-base italic text-slate-600">{sentence.transliteration}</p>
            ) : null}
            {sentence.translation ? (
              <p className="mt-1 text-base text-slate-500">“{sentence.translation}”</p>
            ) : null}

            {/* Feature 2: Teach before speaking gate banner */}
            {isRecordingLocked ? (
              <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎧</span>
                    <div>
                      <p className="text-xs font-bold text-sky-900">Step 2: Teach before speaking</p>
                      <p className="text-xs text-sky-700">
                        Listen to the word pronounced aloud before recording your voice.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTeachTarget}
                      disabled={isSpeakingTarget}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50 shadow-xs"
                    >
                      {isSpeakingTarget ? 'Speaking…' : '🔊 Listen Now'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasBeenTaught(true)}
                      className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100/50"
                    >
                      Proceed to Recording →
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Word Pronunciation Recorder (Unlocked after teaching) */}
            {activeTab === 'pronunciation' ? (
              <div className="mt-6">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Record Pronunciation
                  </span>
                  {hasBeenTaught ? (
                    <span className="text-xs font-medium text-emerald-700">
                      ✓ Pronunciation taught
                    </span>
                  ) : null}
                </div>

                <div className={isRecordingLocked ? 'opacity-50 pointer-events-none' : ''}>
                  <RecordButton
                    isRecording={recorder.isRecording}
                    elapsedSeconds={recorder.elapsedSeconds}
                    busy={busy}
                    busyLabel={
                      phase === 'uploading'
                        ? 'Assessing your pronunciation…'
                        : recorder.status === 'converting'
                          ? 'Preparing audio…'
                          : 'Waiting for microphone…'
                    }
                    onStart={handleStart}
                    onStop={handleStop}
                  />
                </div>
              </div>
            ) : null}

            {errorMessage ? (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {errorMessage}
              </div>
            ) : null}

            {!saved && result ? (
              <p
                role="status"
                className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                Scores are shown below but could not be saved to your history.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------- Feature 3: Spelling Lab */}
      {isWord && isWordRevealed && activeTab === 'spelling' ? (
        <SpellingPractice
          sentence={sentence}
          language={language}
          onProceedToPronunciation={() => setActiveTab('pronunciation')}
        />
      ) : null}

      {/* --------------------------------------------------------------- Word Pronunciation Results */}
      {result && activeTab === 'pronunciation' ? (
        <>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <CardTitle>Pronunciation Score</CardTitle>
                <p className={`mt-1 text-5xl font-bold tabular-nums ${scoreTextClass(result.pronunciationScore)}`}>
                  {formatScore(result.pronunciationScore)}
                  <span className="ml-1 text-2xl font-medium text-slate-400">/100</span>
                </p>
                <p className={`mt-1 text-sm font-medium ${scoreTextClass(result.pronunciationScore)}`}>
                  {scoreLabel(result.pronunciationScore)}
                  {delta !== null ? (
                    <span className="ml-2 text-slate-500">
                      ({formatDelta(delta)} vs. your last attempt)
                    </span>
                  ) : null}
                </p>
              </div>
              {result.provider === 'mock' ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  Development mock provider
                </span>
              ) : result.provider === 'mms' ? (
                <span
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                  title="Scored by the self-hosted open-source engine (Meta MMS)"
                >
                  Open-source engine
                </span>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <ScoreBar label="Accuracy" score={result.accuracyScore} />
              <ScoreBar label="Fluency" score={result.fluencyScore} />
              <ScoreBar label="Completeness" score={result.completenessScore} />
            </div>

            {result.prosodyScore !== null ? (
              <div className="mt-4 sm:max-w-xs">
                <ScoreBar label="Prosody" score={result.prosodyScore} />
              </div>
            ) : null}

            {result.recognizedText ? (
              <p className="mt-5 text-sm text-slate-600">
                Recognised:{' '}
                <span className={`${language.scriptClassName} text-base text-slate-900`}>{result.recognizedText}</span>
              </p>
            ) : null}
          </Card>

          <WordFeedback words={result.words} />
        </>
      ) : null}

      {/* --------------------------------------------------------------- Actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={resetOutcome}
          disabled={busy || recorder.isRecording}
          className="flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={() => goToSentence(index + 1)}
          disabled={busy || recorder.isRecording}
          className="flex-1 rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Next Sentence
        </button>
      </div>
    </div>
  );
}
