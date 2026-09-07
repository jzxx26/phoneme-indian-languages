import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { Card, CardTitle } from '@/components/ui/Card';
import { AttemptRow } from '@/components/AttemptRow';
import { requireSession } from '@/lib/session';
import { DEFAULT_LANGUAGE_CODE, resolveLanguage } from '@/lib/languages';
import { formatDelta, formatScore, scoreChipClass, scoreTextClass } from '@/lib/scoring';
import type { AttemptRow as AttemptRecord, SentenceProgressRow } from '@/types/database';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const language = resolveLanguage(lang ?? DEFAULT_LANGUAGE_CODE);
  const { supabase, userId, displayName } = await requireSession('/history');

  const [attemptsResponse, progressResponse] = await Promise.all([
    supabase
      .from('attempts')
      .select(
        'id, sentence_id, reference_text, recognized_text, pronunciation_score, accuracy_score, fluency_score, completeness_score, word_results, provider, created_at',
      )
      .eq('user_id', userId)
      .eq('language_code', language.code)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .returns<AttemptRecord[]>(),
    supabase
      .from('sentence_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('language_code', language.code)
      .order('last_attempt_at', { ascending: false })
      .returns<SentenceProgressRow[]>(),
  ]);

  const attempts = attemptsResponse.data ?? [];
  const progress = progressResponse.data ?? [];

  return (
    <>
      <NavBar displayName={displayName} language={language} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Your {language.name} history</h1>
        <p className="mt-1 text-slate-600">
          Every recording you have submitted, plus how each item has changed since your first try.
        </p>

        {attempts.length === 0 ? (
          <Card className="mt-6">
            <p className="text-slate-600">
              You have not recorded anything yet.{' '}
              <Link href="/practice" className="font-medium text-slate-900 underline">
                Start practising
              </Link>{' '}
              to build up your history.
            </p>
          </Card>
        ) : (
          <>
            {/* ------------------------------------------------ progress per item */}
            <Card className="mt-6">
              <CardTitle>Improvement by item</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                First score compared with your most recent score for the same item.
              </p>

              <div className="mt-4 -mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[34rem] border-collapse text-left">
                  <thead>
                    <tr className="border-y border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-5 py-2 font-semibold sm:px-6">Item</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Tries</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">First</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Latest</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Best</th>
                      <th scope="col" className="px-5 py-2 text-right font-semibold sm:px-6">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {progress.map((row) => {
                      const change =
                        row.first_score !== null && row.latest_score !== null
                          ? Number(row.latest_score) - Number(row.first_score)
                          : null;
                      const changeClass =
                        change === null
                          ? 'text-slate-500'
                          : change > 0
                            ? 'text-emerald-700'
                            : change < 0
                              ? 'text-rose-700'
                              : 'text-slate-500';

                      return (
                        <tr key={row.sentence_id}>
                          <td className="px-5 py-3 sm:px-6">
                            <Link
                              href={`/practice?lang=${encodeURIComponent(language.code)}&sentence=${row.sentence_id}`}
                              className="font-indic text-lg text-slate-900 hover:underline"
                            >
                              {row.reference_text}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                            {row.attempt_count}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                            {formatScore(row.first_score)}
                          </td>
                          <td className={`px-3 py-3 text-right font-semibold tabular-nums ${scoreTextClass(row.latest_score)}`}>
                            {formatScore(row.latest_score)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                            {formatScore(row.best_score)}
                          </td>
                          <td className={`px-5 py-3 text-right font-semibold tabular-nums sm:px-6 ${changeClass}`}>
                            {row.attempt_count > 1 ? formatDelta(change) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* ----------------------------------------------------- attempt list */}
            <Card className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle>Recent attempts</CardTitle>
                <p className="text-sm text-slate-500">
                  Showing the latest {Math.min(attempts.length, PAGE_SIZE)}
                </p>
              </div>

              <ul className="mt-4 space-y-3">
                {attempts.map((attempt) => (
                  <AttemptRow key={attempt.id} attempt={attempt} chipClass={scoreChipClass(attempt.pronunciation_score)} />
                ))}
              </ul>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
