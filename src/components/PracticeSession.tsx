'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { ScoreBar } from '@/components/ui/ScoreBar';
import { WordFeedback } from '@/components/WordFeedback';
import { RecordButton } from '@/components/RecordButton';
import { useRecorder } from '@/lib/audio/useRecorder';
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
}

export interface SentenceProgress {
  sentence_id: string;
  attempt_count: number;
  first_score: number | null;
  latest_score: number | null;
  best_score: number | null;
}

type Phase = 'idle' | 'recording' | 'uploading' | 'done' | 'error';

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
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  /** Scores recorded in this browser session, newest last, per sentence. */
  const [sessionScores, setSessionScores] = useState<Record<string, number[]>>({});

  const sentence = sentences[index];

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
      setIndex(((nextIndex % sentences.length) + sentences.length) % sentences.length);
      resetOutcome();
    },
    [resetOutcome, sentences.length],
  );

  const busy = phase === 'uploading' || recorder.isBusy;
  const errorMessage = apiError ?? recorder.error?.message ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {language.name} Practice
        </h1>
        <span className="text-sm text-slate-500">
          Item {index + 1} of {sentences.length}
        </span>
      </div>

      {/* ---------------------------------------------------------------- target */}
      <Card>
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

        <p className="mt-4 text-sm font-medium uppercase tracking-wide text-slate-500">Target</p>
        <p className="font-indic mt-1 text-3xl font-semibold leading-snug text-slate-900 sm:text-4xl">
          {sentence.text}
        </p>
        {sentence.transliteration ? (
          <p className="mt-2 text-base italic text-slate-600">{sentence.transliteration}</p>
        ) : null}
        {sentence.translation ? (
          <p className="mt-1 text-base text-slate-500">“{sentence.translation}”</p>
        ) : null}

        <div className="mt-6">
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

        {errorMessage ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {errorMessage}
          </div>
        ) : null}

        {!saved && result ? (
          <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Scores are shown below but could not be saved to your history.
          </p>
        ) : null}
      </Card>

      {/* --------------------------------------------------------------- results */}
      {result ? (
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
                <span className="font-indic text-base text-slate-900">{result.recognizedText}</span>
              </p>
            ) : null}
          </Card>

          <WordFeedback words={result.words} />
        </>
      ) : null}

      {/* --------------------------------------------------------------- actions */}
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
