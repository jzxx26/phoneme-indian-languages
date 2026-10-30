'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { RecordButton } from '@/components/RecordButton';
import { WordFeedback } from '@/components/WordFeedback';
import { useRecorder } from '@/lib/audio/useRecorder';
import { cancelSpeech, getSpokenWords, speakWordSequence } from '@/lib/audio/speech';
import type { AssessmentResult } from '@/lib/assessment/types';
import type { LanguageConfig } from '@/lib/languages';
import { formatScore, scoreChipClass, scoreLabel, scoreTextClass, starsFor } from '@/lib/scoring';
import type { VerseRow } from '@/types/database';

export interface ReciteLine {
  id: string;
  text: string;
  transliteration: string | null;
}

type Playing = 'verse' | 'line' | null;

function Stars({ score, size = 'text-3xl' }: { score: number | null; size?: string }) {
  const stars = starsFor(score);
  return (
    <span className={`${size} tracking-wider`} aria-label={`${stars} of 3 stars`}>
      <span className="text-amber-400">{'★'.repeat(stars)}</span>
      <span className="text-slate-200">{'★'.repeat(3 - stars)}</span>
    </span>
  );
}

/**
 * Hear each poem word individually, then repeat each line for assessment.
 * Every line is scored by /api/assess like any practice item, so attempts
 * and progress are stored as usual.
 */
export function ReciteSession({
  language,
  verse,
  lines,
  backHref,
  nextHref,
}: {
  language: LanguageConfig;
  verse: Pick<VerseRow, 'id' | 'collection' | 'title' | 'author' | 'meaning'>;
  lines: ReciteLine[];
  backHref: string;
  nextHref: string | null;
}) {
  const recorder = useRecorder();
  const [lineIndex, setLineIndex] = useState(0);
  const [results, setResults] = useState<Record<string, AssessmentResult>>({});
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Playing>(null);
  const [voiceMissing, setVoiceMissing] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false);

  const playback = useRef<AbortController | null>(null);
  const [activeWord, setActiveWord] = useState<string | null>(null);

  const stopPlayback = useCallback(() => {
    const controller = playback.current;
    playback.current = null;
    controller?.abort();
    cancelSpeech();
    setPlaying(null);
    setActiveWord(null);
  }, []);

  useEffect(() => () => {
    const controller = playback.current;
    playback.current = null;
    controller?.abort();
    cancelSpeech();
  }, []);

  const finished = lineIndex >= lines.length;
  const line = finished ? null : lines[lineIndex];
  const result = line ? results[line.id] : undefined;
  const lineScores = lines.map((item) => results[item.id]?.pronunciationScore ?? null);
  const verseScore =
    finished && lineScores.every((score) => score !== null)
      ? (lineScores as number[]).reduce((sum, score) => sum + score, 0) / lineScores.length
      : null;

  const play = useCallback(
    async (what: Exclude<Playing, null>, text: string) => {
      stopPlayback();
      const controller = new AbortController();
      playback.current = controller;
      const words = getSpokenWords(text);
      setPlaying(what);
      setVoiceMissing(false);
      const outcome = await speakWordSequence(words, language.code, {
        signal: controller.signal,
        onActiveIndex: (index) => {
          if (playback.current === controller) setActiveWord(words[index] ?? null);
        },
      });
      if (playback.current !== controller) return;
      playback.current = null;
      setVoiceMissing(outcome !== 'spoken' && outcome !== 'cancelled');
      setPlaying(null);
    },
    [language.code, stopPlayback],
  );

  const handleStart = useCallback(async () => {
    stopPlayback();
    setError(null);
    await recorder.start();
  }, [recorder, stopPlayback]);

  const handleStop = useCallback(async () => {
    if (!line) return;
    const audio = await recorder.stop();
    if (!audio) return;

    setAssessing(true);
    const body = new FormData();
    body.append('audio', audio.blob, 'recording.wav');
    body.append('sentenceId', line.id);
    try {
      const response = await fetch('/api/assess', { method: 'POST', body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? `Assessment failed (${response.status}). Please try again.`);
        return;
      }
      setResults((current) => ({ ...current, [line.id]: payload.result as AssessmentResult }));
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setAssessing(false);
    }
  }, [line, recorder]);

  const goToLine = useCallback(
    (index: number) => {
      stopPlayback();
      setError(null);
      recorder.reset();
      setLineIndex(index);
    },
    [recorder, stopPlayback],
  );

  const restart = useCallback(() => {
    setResults({});
    goToLine(0);
  }, [goToLine]);

  const busy = assessing || recorder.isBusy;
  const errorMessage = error ?? recorder.error?.message ?? null;
  const script = language.scriptClassName;

  if (lines.length === 0) {
    return (
      <Card>
        <p className="text-slate-600">This poem has no lines yet.</p>
        <Link href={backHref} className="mt-3 inline-block font-medium text-slate-700 underline">
          Back to poems
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Link href={backHref} className="text-sm font-medium text-slate-600 hover:text-slate-900">
        ← All poems
      </Link>

      {/* ------------------------------------------------------------ the poem */}
      <Card>
        <p className={`${script} text-sm font-medium text-slate-500`}>{verse.collection}</p>
        <h1 className={`${script} mt-1 text-2xl font-bold text-slate-900 sm:text-3xl`}>{verse.title}</h1>
        {verse.author ? <p className={`${script} mt-1 text-sm text-slate-500`}>{verse.author}</p> : null}

        <ol className="mt-5 space-y-2">
          {lines.map((item, index) => {
            const score = results[item.id]?.pronunciationScore ?? null;
            const current = index === lineIndex;
            return (
              <li
                key={item.id}
                className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 transition-colors ${
                  current ? 'border-sky-300 bg-sky-50' : 'border-transparent'
                }`}
              >
                <div className="min-w-0">
                  <p className={`${script} text-xl leading-relaxed text-slate-900 sm:text-2xl`}>{item.text}</p>
                  {item.transliteration ? (
                    <p className="text-sm italic text-slate-500">{item.transliteration}</p>
                  ) : null}
                </div>
                {score !== null ? (
                  <span
                    className={`mt-1 shrink-0 rounded-lg border px-2 py-0.5 text-sm font-semibold tabular-nums ${scoreChipClass(score)}`}
                  >
                    {formatScore(score)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => play('verse', lines.map((item) => item.text).join(' '))}
            disabled={playing !== null || recorder.isRecording || busy}
            className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {playing === 'verse' ? '🔊 Playing…' : '🔊 Listen to poem word by word'}
          </button>
          {playing ? (
            <button
              type="button"
              onClick={stopPlayback}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Stop listening
            </button>
          ) : null}
          {verse.meaning ? (
            <button
              type="button"
              onClick={() => setShowMeaning((value) => !value)}
              aria-expanded={showMeaning}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showMeaning ? 'Hide meaning' : 'What does it mean?'}
            </button>
          ) : null}
        </div>
        {showMeaning && verse.meaning ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-slate-700">{verse.meaning}</p>
        ) : null}
        {playing && activeWord ? (
          <p role="status" className={`${script} mt-3 text-2xl font-semibold text-sky-700`}>
            {activeWord}
          </p>
        ) : null}
        {voiceMissing ? (
          <p role="status" className="mt-3 text-sm text-amber-800">
            The teaching voice is unavailable right now. You can still read the line and record it.
          </p>
        ) : null}
      </Card>

      {/* ------------------------------------------------------- current line */}
      {line ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              Line {lineIndex + 1} of {lines.length}: listen word by word, then say the line back
            </CardTitle>
            <button
              type="button"
              onClick={() => play('line', line.text)}
              disabled={playing !== null || recorder.isRecording || busy}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {playing === 'line' ? '🔊 Playing…' : '🔊 Listen word by word'}
            </button>
          </div>

          <p className={`${script} mt-4 text-3xl font-semibold leading-snug text-slate-900 sm:text-4xl`}>
            {line.text}
          </p>
          {line.transliteration ? (
            <p className="mt-2 text-base italic text-slate-600">{line.transliteration}</p>
          ) : null}

          <div className="mt-6">
            <RecordButton
              isRecording={recorder.isRecording}
              elapsedSeconds={recorder.elapsedSeconds}
              busy={busy}
              busyLabel={assessing ? 'Listening to your recitation…' : 'Preparing audio…'}
              onStart={handleStart}
              onStop={handleStop}
            />
          </div>

          {errorMessage ? (
            <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {errorMessage}
            </div>
          ) : null}

          {result ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className={`text-4xl font-bold tabular-nums ${scoreTextClass(result.pronunciationScore)}`}>
                  {formatScore(result.pronunciationScore)}
                  <span className="ml-1 text-xl font-medium text-slate-400">/100</span>
                </p>
                <p className={`text-sm font-medium ${scoreTextClass(result.pronunciationScore)}`}>
                  {scoreLabel(result.pronunciationScore)}
                </p>
              </div>
              <Stars score={result.pronunciationScore} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {result ? <WordFeedback words={result.words} /> : null}

      {/* -------------------------------------------------------------- summary */}
      {finished ? (
        <Card className="text-center">
          <CardTitle>Poem complete!</CardTitle>
          <div className="mt-3">
            <Stars score={verseScore} size="text-5xl" />
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${scoreTextClass(verseScore)}`}>
            {formatScore(verseScore)}
            <span className="ml-1 text-base font-medium text-slate-400">/100</span>
          </p>
          <p className="mt-1 text-slate-600">
            {starsFor(verseScore) === 3
              ? 'Wonderful recitation!'
              : starsFor(verseScore) === 2
                ? 'Well done. Practise the lines marked in amber or red for three stars.'
                : 'Good start. Listen to each line again and try once more.'}
          </p>
        </Card>
      ) : null}

      {/* -------------------------------------------------------------- actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {finished ? (
          <>
            <button
              type="button"
              onClick={restart}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50"
            >
              Recite again
            </button>
            {nextHref ? (
              <Link
                href={nextHref}
                className="flex-1 rounded-xl bg-slate-900 px-5 py-3 text-center text-base font-semibold text-white hover:bg-slate-800"
              >
                Next poem →
              </Link>
            ) : (
              <Link
                href={backHref}
                className="flex-1 rounded-xl bg-slate-900 px-5 py-3 text-center text-base font-semibold text-white hover:bg-slate-800"
              >
                All poems
              </Link>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => goToLine(Math.max(0, lineIndex - 1))}
              disabled={lineIndex === 0 || busy || recorder.isRecording}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              ← Previous line
            </button>
            <button
              type="button"
              onClick={() => goToLine(lineIndex + 1)}
              disabled={!result || busy || recorder.isRecording}
              className="flex-1 rounded-xl bg-slate-900 px-5 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {lineIndex + 1 === lines.length ? 'Finish poem' : 'Next line →'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
