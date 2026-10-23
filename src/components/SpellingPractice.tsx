'use client';

import { useCallback, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { RecordButton } from '@/components/RecordButton';
import { useRecorder } from '@/lib/audio/useRecorder';
import {
  cancelSpeech,
  getScriptBreakdown,
  isSpeechSynthesisSupported,
  speakSpellingSequence,
} from '@/lib/audio/speech';
import { getLanguages, type LanguageConfig } from '@/lib/languages';
import type { SpellingAssessmentResult } from '@/lib/assessment/spelling';
import type { PracticeSentence } from '@/components/PracticeSession';

interface SpellingPracticeProps {
  sentence: PracticeSentence;
  language: LanguageConfig;
  onProceedToPronunciation?: () => void;
}

export function SpellingPractice({
  sentence,
  language,
  onProceedToPronunciation,
}: SpellingPracticeProps) {
  const recorder = useRecorder();

  const [activeLetterIndex, setActiveLetterIndex] = useState<number>(-1);
  const [isTeachingAloud, setIsTeachingAloud] = useState(false);
  const [hasHeardSpelling, setHasHeardSpelling] = useState(false);
  const [missingVoice, setMissingVoice] = useState(false);

  const [phase, setPhase] = useState<'idle' | 'recording' | 'assessing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<SpellingAssessmentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const breakdown = getScriptBreakdown(sentence.text, language);
  const isSpeechSupported = isSpeechSynthesisSupported();
  const spellingLanguages = getLanguages()
    .filter((l) => l.spokenSpelling)
    .map((l) => l.name);

  // ---------------------------------------------------------------------------
  // Teach Spelling Aloud
  // ---------------------------------------------------------------------------
  const handleTeachSpelling = useCallback(async () => {
    if (!breakdown.spokenSpellingSupported || breakdown.units.length === 0) return;

    setIsTeachingAloud(true);
    cancelSpeech();

    const outcome = await speakSpellingSequence(breakdown.units, sentence.language_code, {
      onActiveIndex: (index) => setActiveLetterIndex(index),
      onComplete: () => {
        setIsTeachingAloud(false);
        setActiveLetterIndex(-1);
        setHasHeardSpelling(true);
      },
    });
    setMissingVoice(outcome === 'no-voice');
  }, [breakdown.spokenSpellingSupported, breakdown.units, sentence.language_code]);

  // ---------------------------------------------------------------------------
  // Check Learner's Spoken Spelling
  // ---------------------------------------------------------------------------
  const submitSpellingAudio = useCallback(
    async (audioBlob: Blob) => {
      setPhase('assessing');
      setErrorMessage(null);

      const body = new FormData();
      body.append('audio', audioBlob, 'spelling.wav');
      body.append('sentenceId', sentence.id);

      try {
        const response = await fetch('/api/assess/spelling', {
          method: 'POST',
          body,
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setErrorMessage(
            payload?.error?.message ??
              `Spelling assessment failed (${response.status}). Please try again.`,
          );
          setPhase('error');
          return;
        }

        setResult(payload.result as SpellingAssessmentResult);
        setPhase('done');
      } catch {
        setErrorMessage('Could not reach the server. Please check your connection and try again.');
        setPhase('error');
      }
    },
    [sentence.id],
  );

  const handleStartRecording = useCallback(async () => {
    cancelSpeech();
    setResult(null);
    setErrorMessage(null);
    setPhase('recording');
    await recorder.start();
  }, [recorder]);

  const handleStopRecording = useCallback(async () => {
    const audio = await recorder.stop();
    if (!audio) {
      setPhase('error');
      return;
    }
    await submitSpellingAudio(audio.blob);
  }, [recorder, submitSpellingAudio]);

  const handleRetry = useCallback(() => {
    setResult(null);
    setErrorMessage(null);
    setPhase('idle');
    recorder.reset();
  }, [recorder]);

  const busy = phase === 'assessing' || recorder.isBusy;

  return (
    <Card className="border-indigo-100 bg-gradient-to-b from-indigo-50/40 via-white to-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
            🔤
          </span>
          <div>
            <CardTitle>Spelling Teaching & Spoken Check</CardTitle>
            <p className="text-xs text-slate-500">{breakdown.unitsLabel}</p>
          </div>
        </div>

        {breakdown.spokenSpellingSupported ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Letter-name check supported
          </span>
        ) : (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Script breakdown only
          </span>
        )}
      </div>

      {/* ------------------------------------- Languages without spoken spelling */}
      {!breakdown.spokenSpellingSupported ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Letters in this word
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {breakdown.units.map((unit, idx) => (
                <div
                  key={`${unit}-${idx}`}
                  className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 shadow-xs"
                >
                  <span className={`${language.scriptClassName} text-2xl font-bold text-slate-900`}>{unit}</span>
                  <span className="mt-1 text-[10px] text-slate-400">Unit {idx + 1}</span>
                </div>
              ))}
            </div>
            {breakdown.note ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-600">{breakdown.note}</p>
            ) : null}
          </div>

          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"
          >
            <div className="flex items-start gap-2">
              <span className="text-base">ℹ️</span>
              <div>
                <p className="font-semibold">Spoken spelling check is not available for {language.name}</p>
                <p className="mt-1">
                  {spellingLanguages.length > 0
                    ? `Spoken spelling check is available for ${spellingLanguages.join(', ')} only. `
                    : ''}
                  Use the letters above to study the word, then practise saying the whole word.
                </p>
              </div>
            </div>
          </div>

          {onProceedToPronunciation ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={onProceedToPronunciation}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 sm:w-auto"
              >
                <span>Proceed to {language.name} Word Pronunciation</span>
                <span>→</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        /* ------------------------------------------- Languages with spoken spelling */
        <div className="mt-4 space-y-5">
          {/* Visual letter tiles */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Target Spelling: Letter by Letter
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {breakdown.units.map((letter, idx) => {
                const isActive = activeLetterIndex === idx;
                return (
                  <div
                    key={`${letter}-${idx}`}
                    className={`flex h-14 w-12 flex-col items-center justify-center rounded-xl border font-bold text-lg transition-all duration-200 ${
                      isActive
                        ? 'scale-110 border-indigo-600 bg-indigo-600 text-white shadow-md ring-4 ring-indigo-100'
                        : 'border-slate-200 bg-white text-slate-800 shadow-xs'
                    }`}
                  >
                    <span>{letter}</span>
                    <span className={`text-[9px] ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spelling Teaching Audio Controls */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <button
              type="button"
              onClick={handleTeachSpelling}
              disabled={isTeachingAloud || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
            >
              <span>{isTeachingAloud ? '🔊 Spelling Aloud…' : hasHeardSpelling ? '🔁 Replay Spelling' : '🔊 Teach Spelling Aloud'}</span>
            </button>

            <span className="text-xs text-slate-500">
              {isSpeechSupported
                ? isTeachingAloud
                  ? 'Listen to each letter name…'
                  : 'Spells the target aloud letter by letter'
                : 'Speech synthesis not supported in this browser'}
            </span>
            {missingVoice ? (
              <span role="status" className="w-full text-xs text-amber-800">
                No {language.name} voice is installed in this browser, so the spelling cannot be played.
              </span>
            ) : null}
          </div>

          {/* Spoken Spelling Check Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Check Your Spoken Spelling
              </h3>
              <p className="text-xs text-slate-500">
                Press record and speak each letter aloud in order (e.g. “{breakdown.units.join(' … ')}”).
              </p>
            </div>

            <RecordButton
              isRecording={recorder.isRecording}
              elapsedSeconds={recorder.elapsedSeconds}
              busy={busy}
              busyLabel={
                phase === 'assessing'
                  ? 'Evaluating your spoken spelling sequence…'
                  : 'Preparing microphone…'
              }
              onStart={handleStartRecording}
              onStop={handleStopRecording}
            />

            {errorMessage ? (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
              >
                {errorMessage}
              </div>
            ) : null}

            {/* Assessment Results */}
            {result ? (
              <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        result.isCorrect
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {result.isCorrect ? '✅ Spelling Correct' : '⚠️ Spelling Needs Practice'}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      Score: {result.score}/100
                    </span>
                  </div>

                  {result.provider === 'mock' ? (
                    <span className="text-[11px] text-amber-700">Mock Provider</span>
                  ) : null}
                </div>

                {/* Letter by Letter Comparison */}
                <div>
                  <p className="text-xs font-semibold text-slate-600">Letter-by-Letter Assessment:</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {result.letters.map((item) => {
                      const isGood = item.status === 'correct';
                      const isOmitted = item.status === 'omitted';

                      return (
                        <div
                          key={`res-${item.position}`}
                          className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center ${
                            isGood
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : isOmitted
                                ? 'border-dashed border-rose-300 bg-rose-50 text-rose-800'
                                : 'border-amber-300 bg-amber-50 text-amber-900'
                          }`}
                        >
                          <span className="text-xs text-slate-500">#{item.position}</span>
                          <span className="text-base font-bold">{item.expected}</span>
                          <span className="mt-1 text-[11px]">
                            {isGood ? '✓ Heard' : isOmitted ? '✗ Missed' : `Heard: ${item.heard}`}
                          </span>
                          <span className="text-[10px] opacity-75">{item.score}%</span>
                        </div>
                      );
                    })}
                  </div>

                  {result.extraLetters.length > 0 ? (
                    <p className="mt-2 text-xs text-rose-700">
                      Extra spoken letters detected:{' '}
                      <span className="font-semibold">{result.extraLetters.join(', ')}</span>
                    </p>
                  ) : null}
                </div>

                {/* Understandable Feedback */}
                <div className="rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-700 border border-slate-200">
                  <p className="font-semibold text-slate-900">Feedback:</p>
                  <p className="mt-1">{result.feedback}</p>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    🔄 Try Spelling Again
                  </button>
                  {onProceedToPronunciation ? (
                    <button
                      type="button"
                      onClick={onProceedToPronunciation}
                      className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Proceed to Word Pronunciation →
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
