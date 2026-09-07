import { formatScore, scoreBarClass, scoreTextClass } from '@/lib/scoring';

/** A labelled 0-100 score with a proportional bar. */
export function ScoreBar({
  label,
  score,
  emphasis = false,
}: {
  label: string;
  score: number | null;
  emphasis?: boolean;
}) {
  const width = score === null || Number.isNaN(score) ? 0 : Math.max(0, Math.min(100, score));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`${emphasis ? 'text-base font-semibold' : 'text-sm font-medium'} text-slate-700`}
        >
          {label}
        </span>
        <span
          className={`tabular-nums ${emphasis ? 'text-2xl font-bold' : 'text-lg font-semibold'} ${scoreTextClass(score)}`}
        >
          {formatScore(score)}
          <span className="ml-0.5 text-xs font-normal text-slate-400">/100</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-valuenow={width}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${scoreBarClass(score)}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
