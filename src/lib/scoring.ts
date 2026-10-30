/** Presentation helpers shared by the practice, dashboard and history screens. */

export type ScoreBand = 'strong' | 'fair' | 'weak' | 'unknown';

/** Below this, a word is highlighted as "needs improvement". */
export const LOW_WORD_SCORE_THRESHOLD = 70;

export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score === null || score === undefined || Number.isNaN(score)) return 'unknown';
  if (score >= 80) return 'strong';
  if (score >= LOW_WORD_SCORE_THRESHOLD) return 'fair';
  return 'weak';
}

const BAND_TEXT: Record<ScoreBand, string> = {
  strong: 'text-emerald-700',
  fair: 'text-amber-700',
  weak: 'text-rose-700',
  unknown: 'text-slate-500',
};

const BAND_CHIP: Record<ScoreBand, string> = {
  strong: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  fair: 'bg-amber-50 text-amber-900 border-amber-200',
  weak: 'bg-rose-50 text-rose-800 border-rose-300',
  unknown: 'bg-slate-50 text-slate-600 border-slate-200',
};

const BAND_BAR: Record<ScoreBand, string> = {
  strong: 'bg-emerald-500',
  fair: 'bg-amber-500',
  weak: 'bg-rose-500',
  unknown: 'bg-slate-300',
};

const BAND_LABEL: Record<ScoreBand, string> = {
  strong: 'Good',
  fair: 'Almost there',
  weak: 'Needs practice',
  unknown: 'Not scored',
};

export const scoreTextClass = (score: number | null | undefined) => BAND_TEXT[scoreBand(score)];
export const scoreChipClass = (score: number | null | undefined) => BAND_CHIP[scoreBand(score)];
export const scoreBarClass = (score: number | null | undefined) => BAND_BAR[scoreBand(score)];
export const scoreLabel = (score: number | null | undefined) => BAND_LABEL[scoreBand(score)];

export function needsImprovement(score: number | null | undefined): boolean {
  return scoreBand(score) === 'weak';
}

/** Renders a score as an integer, or an em dash when the provider gave none. */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '—';
  return String(Math.round(Number(score)));
}

export function formatDelta(delta: number | null): string {
  if (delta === null || Number.isNaN(delta)) return '—';
  const rounded = Math.round(delta);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Human label for an Azure word-level error type. */
export function describeErrorType(errorType: string | null | undefined): string | null {
  switch (errorType) {
    case 'Mispronunciation':
      return 'Mispronounced';
    case 'Omission':
      return 'Missed out';
    case 'Insertion':
      return 'Extra word';
    case 'UnexpectedBreak':
      return 'Unexpected pause';
    case 'MissingBreak':
      return 'Missing pause';
    case 'Monotone':
      return 'Monotone';
    case 'None':
    case null:
    case undefined:
      return null;
    default:
      return errorType;
  }
}

/** Kid-friendly 0-3 stars: 3 for 80+, 2 for 60+, 1 for any scored attempt. */
export function starsFor(score: number | null | undefined): number {
  if (score === null || score === undefined || Number.isNaN(score)) return 0;
  if (score >= 80) return 3;
  if (score >= 60) return 2;
  return 1;
}
