'use client';

import { useState } from 'react';
import { formatDateTime, formatScore, needsImprovement, scoreTextClass } from '@/lib/scoring';
import type { AttemptRow as AttemptRecord } from '@/types/database';

/** One past attempt, expandable to reveal the stored word-level results. */
export function AttemptRow({
  attempt,
  chipClass,
}: {
  attempt: AttemptRecord;
  chipClass: string;
}) {
  const [open, setOpen] = useState(false);
  const words = Array.isArray(attempt.word_results) ? attempt.word_results : [];

  return (
    <li className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="font-indic truncate text-lg text-slate-900">{attempt.reference_text}</p>
          <p className="text-xs text-slate-500">
            {formatDateTime(attempt.created_at)}
            {attempt.provider === 'mock' ? ' · mock provider' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`rounded-lg border px-2.5 py-1 text-sm font-semibold tabular-nums ${chipClass}`}>
            {formatScore(attempt.pronunciation_score)}
          </span>
          <span aria-hidden className="text-slate-400">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Accuracy</dt>
              <dd className={`font-semibold tabular-nums ${scoreTextClass(attempt.accuracy_score)}`}>
                {formatScore(attempt.accuracy_score)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Fluency</dt>
              <dd className={`font-semibold tabular-nums ${scoreTextClass(attempt.fluency_score)}`}>
                {formatScore(attempt.fluency_score)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Completeness</dt>
              <dd className={`font-semibold tabular-nums ${scoreTextClass(attempt.completeness_score)}`}>
                {formatScore(attempt.completeness_score)}
              </dd>
            </div>
          </dl>

          {attempt.recognized_text ? (
            <p className="mt-3 text-sm text-slate-600">
              Recognised: <span className="font-indic text-base text-slate-900">{attempt.recognized_text}</span>
            </p>
          ) : null}

          {words.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {words.map((word, index) => (
                <li
                  key={`${word.word}-${index}`}
                  className={`rounded-lg border px-2.5 py-1 text-sm ${
                    needsImprovement(word.accuracyScore)
                      ? 'border-rose-300 bg-rose-50 text-rose-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-indic">{word.word}</span>{' '}
                  <span className="font-semibold tabular-nums">{formatScore(word.accuracyScore)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No word-level detail was stored for this attempt.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
