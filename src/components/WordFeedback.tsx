import { Card, CardTitle } from '@/components/ui/Card';
import {
  describeErrorType,
  formatScore,
  LOW_WORD_SCORE_THRESHOLD,
  needsImprovement,
  scoreBarClass,
  scoreTextClass,
} from '@/lib/scoring';
import type { WordResult } from '@/lib/assessment/types';

/**
 * Word-level breakdown from the assessment provider. Words scoring below
 * LOW_WORD_SCORE_THRESHOLD, or flagged with an error type, are highlighted.
 */
export function WordFeedback({ words }: { words: WordResult[] }) {
  if (!words || words.length === 0) {
    return (
      <Card>
        <CardTitle>Word Feedback</CardTitle>
        <p className="mt-2 text-slate-600">
          The assessment provider did not return word-level detail for this recording.
        </p>
      </Card>
    );
  }

  const weakWords = words.filter(
    (word) => needsImprovement(word.accuracyScore) || (word.errorType && word.errorType !== 'None'),
  );

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Word Feedback</CardTitle>
        <p className="text-sm text-slate-500">
          Highlighted below {LOW_WORD_SCORE_THRESHOLD}/100
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {words.map((word, index) => {
          const flagged = needsImprovement(word.accuracyScore) || (word.errorType && word.errorType !== 'None');
          const note = describeErrorType(word.errorType);
          const width =
            word.accuracyScore === null ? 0 : Math.max(0, Math.min(100, word.accuracyScore));

          return (
            <li
              key={`${word.word}-${index}`}
              className={`rounded-lg border px-3 py-2.5 ${
                flagged ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-indic truncate text-xl text-slate-900">{word.word}</p>
                  {note ? (
                    <p className="text-xs font-medium text-rose-700">{note}</p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 text-xl font-bold tabular-nums ${scoreTextClass(word.accuracyScore)}`}
                >
                  {formatScore(word.accuracyScore)}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${scoreBarClass(word.accuracyScore)}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {weakWords.length > 0 ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Focus on:{' '}
          <span className="font-indic font-semibold">
            {weakWords.map((word) => word.word).join(', ')}
          </span>
        </p>
      ) : (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Every word scored well. Try the next item.
        </p>
      )}
    </Card>
  );
}
