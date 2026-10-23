import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { Card, CardTitle } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { requireSession } from '@/lib/session';
import { DEFAULT_LANGUAGE_CODE, resolveLanguage } from '@/lib/languages';
import { formatDateTime, formatScore, scoreChipClass, scoreTextClass } from '@/lib/scoring';
import type { AttemptRow, UserLanguageStatsRow } from '@/types/database';

export const dynamic = 'force-dynamic';

type RecentAttempt = Pick<
  AttemptRow,
  'id' | 'reference_text' | 'pronunciation_score' | 'created_at' | 'language_code'
>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const language = resolveLanguage(lang ?? DEFAULT_LANGUAGE_CODE);
  const { supabase, userId, displayName } = await requireSession('/dashboard');

  const [statsResponse, recentResponse] = await Promise.all([
    supabase
      .from('user_language_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('language_code', language.code)
      .maybeSingle<UserLanguageStatsRow>(),
    supabase
      .from('attempts')
      .select('id, reference_text, pronunciation_score, created_at, language_code')
      .eq('user_id', userId)
      .eq('language_code', language.code)
      .order('created_at', { ascending: false })
      .limit(5)
      .returns<RecentAttempt[]>(),
  ]);

  const stats = statsResponse.data;
  const recent = recentResponse.data ?? [];
  const attemptCount = stats?.attempt_count ?? 0;
  const averageScore = stats?.avg_pronunciation_score ?? null;

  return (
    <>
      <NavBar displayName={displayName} language={language} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Welcome back, {displayName}
          </h1>
          <p className="mt-1 text-slate-600">
            Current language:{' '}
            <span className="font-semibold text-slate-900">{language.name}</span>{' '}
            <span className="font-indic text-slate-700">({language.nativeName})</span>
            <span className="ml-2 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {language.code}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Practice attempts" value={String(attemptCount)} />
          <StatTile
            label="Average score"
            value={formatScore(averageScore)}
            hint={averageScore === null ? 'No attempts yet' : 'out of 100'}
            valueClassName={scoreTextClass(averageScore)}
          />
          <StatTile
            label="Best score"
            value={formatScore(stats?.best_pronunciation_score ?? null)}
            valueClassName={scoreTextClass(stats?.best_pronunciation_score ?? null)}
          />
          <StatTile
            label="Items practised"
            value={String(stats?.sentences_practiced ?? 0)}
            hint={stats?.last_attempt_at ? `Last: ${formatDateTime(stats.last_attempt_at)}` : undefined}
          />
        </div>

        <div className="mt-4">
          <Link
            href={`/practice?lang=${encodeURIComponent(language.code)}`}
            className="block w-full rounded-xl bg-slate-900 px-5 py-4 text-center text-lg font-semibold text-white hover:bg-slate-800 sm:w-auto sm:px-8"
          >
            Start practising {language.name}
          </Link>
        </div>

        <Card className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Recent attempts</CardTitle>
            {recent.length > 0 ? (
              <Link href={`/history?lang=${encodeURIComponent(language.code)}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                View all →
              </Link>
            ) : null}
          </div>

          {recent.length === 0 ? (
            <p className="mt-4 text-slate-600">
              No attempts yet. Press <span className="font-medium">Start practising</span> to record your
              first {language.name} sentence.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {recent.map((attempt) => (
                <li key={attempt.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-indic truncate text-lg text-slate-900">{attempt.reference_text}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(attempt.created_at)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-lg border px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreChipClass(attempt.pronunciation_score)}`}
                  >
                    {formatScore(attempt.pronunciation_score)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </>
  );
}
