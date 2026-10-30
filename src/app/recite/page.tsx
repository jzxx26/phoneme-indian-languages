import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { ReciteSession, type ReciteLine } from '@/components/ReciteSession';
import { Card, CardTitle } from '@/components/ui/Card';
import { requireSession } from '@/lib/session';
import { DEFAULT_LANGUAGE_CODE, resolveLanguage } from '@/lib/languages';
import { formatScore, scoreChipClass, starsFor } from '@/lib/scoring';
import type { SentenceProgressRow, SentenceRow, VerseRow } from '@/types/database';

export const dynamic = 'force-dynamic';

type Verse = Pick<VerseRow, 'id' | 'collection' | 'number' | 'title' | 'author' | 'meaning'>;
type Line = Pick<SentenceRow, 'id' | 'text' | 'transliteration' | 'verse_id' | 'verse_line'>;

export default async function RecitePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; verse?: string }>;
}) {
  const { lang, verse: verseId } = await searchParams;
  const language = resolveLanguage(lang ?? DEFAULT_LANGUAGE_CODE);
  const { supabase, userId, displayName } = await requireSession('/recite');
  const langQuery = `lang=${encodeURIComponent(language.code)}`;

  const [versesResponse, linesResponse, progressResponse] = await Promise.all([
    supabase
      .from('verses')
      .select('id, collection, number, title, author, meaning')
      .eq('language_code', language.code)
      .eq('is_active', true)
      .order('collection', { ascending: true })
      .order('number', { ascending: true })
      .returns<Verse[]>(),
    supabase
      .from('sentences')
      .select('id, text, transliteration, verse_id, verse_line')
      .eq('language_code', language.code)
      .eq('is_active', true)
      .not('verse_id', 'is', null)
      .order('verse_line', { ascending: true })
      .returns<Line[]>(),
    supabase
      .from('sentence_progress')
      .select('sentence_id, best_score')
      .eq('user_id', userId)
      .eq('language_code', language.code)
      .returns<Pick<SentenceProgressRow, 'sentence_id' | 'best_score'>[]>(),
  ]);

  const nav = <NavBar displayName={displayName} language={language} />;

  if (versesResponse.error || linesResponse.error) {
    return (
      <>
        {nav}
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Card>
            <h1 className="text-xl font-bold text-slate-900">Could not load poems</h1>
            <p className="mt-2 text-slate-600">
              Check that the Supabase project is running and that
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">supabase/migrations/0007_verses.sql</code>
              and
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">supabase/seed/0008_seed_verses.sql</code>
              have been run.
            </p>
          </Card>
        </main>
      </>
    );
  }

  const verses = versesResponse.data ?? [];
  const linesByVerse = new Map<string, ReciteLine[]>();
  for (const line of linesResponse.data ?? []) {
    if (!line.verse_id) continue;
    const list = linesByVerse.get(line.verse_id) ?? [];
    list.push({ id: line.id, text: line.text, transliteration: line.transliteration });
    linesByVerse.set(line.verse_id, list);
  }
  const best = new Map((progressResponse.data ?? []).map((row) => [row.sentence_id, row.best_score]));

  /** Average of each line's best score, or null until every line has been tried. */
  function verseBest(id: string): number | null {
    const lines = linesByVerse.get(id) ?? [];
    const scores = lines.map((line) => best.get(line.id));
    if (lines.length === 0 || scores.some((score) => score === null || score === undefined)) return null;
    return (scores as number[]).reduce((sum, score) => sum + Number(score), 0) / scores.length;
  }

  // ------------------------------------------------------------ one verse
  const selected = verseId ? verses.find((verse) => verse.id === verseId) : undefined;
  if (selected) {
    const index = verses.indexOf(selected);
    const next = verses[index + 1];
    return (
      <>
        {nav}
        <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
          <ReciteSession
            key={selected.id}
            language={language}
            verse={selected}
            lines={linesByVerse.get(selected.id) ?? []}
            backHref={`/recite?${langQuery}`}
            nextHref={next ? `/recite?${langQuery}&verse=${next.id}` : null}
          />
        </main>
      </>
    );
  }

  // ------------------------------------------------------------ verse list
  const collections = new Map<string, Verse[]>();
  for (const verse of verses) {
    collections.set(verse.collection, [...(collections.get(verse.collection) ?? []), verse]);
  }

  return (
    <>
      {nav}
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{language.name} Poems</h1>
        <p className="mt-1 text-slate-600">
          Listen to a poem, then say it back line by line. Earn up to three stars for each poem.
        </p>

        {verses.length === 0 ? (
          <Card className="mt-6">
            <p className="text-slate-600">
              There are no {language.name} poems yet. Poems are available in other languages — use the
              language switcher above.
            </p>
          </Card>
        ) : (
          [...collections.entries()].map(([collection, items]) => (
            <Card key={collection} className="mt-6">
              <CardTitle>
                <span className={language.scriptClassName}>{collection}</span>
              </CardTitle>
              <ul className="mt-3 divide-y divide-slate-100">
                {items.map((verse) => {
                  const score = verseBest(verse.id);
                  const firstLine = linesByVerse.get(verse.id)?.[0]?.text ?? '';
                  return (
                    <li key={verse.id}>
                      <Link
                        href={`/recite?${langQuery}&verse=${verse.id}`}
                        className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className={`${language.scriptClassName} truncate text-lg font-semibold text-slate-900`}>
                            {verse.title}
                          </p>
                          <p className={`${language.scriptClassName} truncate text-sm text-slate-500`}>
                            {firstLine}
                            {verse.author ? ` — ${verse.author}` : ''}
                          </p>
                        </div>
                        {score === null ? (
                          <span className="shrink-0 text-sm font-medium text-slate-400">Not tried</span>
                        ) : (
                          <span
                            className={`shrink-0 rounded-lg border px-2.5 py-1 text-sm font-semibold ${scoreChipClass(score)}`}
                            aria-label={`${starsFor(score)} of 3 stars, best ${formatScore(score)}`}
                          >
                            {'★'.repeat(starsFor(score))}
                            {'☆'.repeat(3 - starsFor(score))}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))
        )}
      </main>
    </>
  );
}
