import Link from 'next/link';
import { NavBar } from '@/components/NavBar';
import { PracticeSession } from '@/components/PracticeSession';
import { Card } from '@/components/ui/Card';
import { requireSession } from '@/lib/session';
import { DEFAULT_LANGUAGE_CODE, resolveLanguage } from '@/lib/languages';
import type { SentenceProgressRow, SentenceRow } from '@/types/database';

import { DEMO_ENGLISH_SENTENCES } from '@/lib/demo-sentences';

export const dynamic = 'force-dynamic';

type PracticeSentence = Pick<
  SentenceRow,
  'id' | 'text' | 'transliteration' | 'translation' | 'kind' | 'difficulty' | 'language_code'
>;

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; sentence?: string }>;
}) {
  const { lang, sentence: requestedSentenceId } = await searchParams;
  const language = resolveLanguage(lang ?? DEFAULT_LANGUAGE_CODE);
  const { supabase, userId, displayName } = await requireSession('/practice');

  const [sentencesResponse, progressResponse] = await Promise.all([
    supabase
      .from('sentences')
      .select('id, text, transliteration, translation, kind, difficulty, language_code')
      .eq('language_code', language.code)
      .eq('is_active', true)
      .order('difficulty', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<PracticeSentence[]>(),
    supabase
      .from('sentence_progress')
      .select('sentence_id, attempt_count, first_score, latest_score, best_score')
      .eq('user_id', userId)
      .eq('language_code', language.code)
      .returns<
        Pick<
          SentenceProgressRow,
          'sentence_id' | 'attempt_count' | 'first_score' | 'latest_score' | 'best_score'
        >[]
      >(),
  ]);

  let sentences = sentencesResponse.data ?? [];
  if (sentences.length === 0 && language.code.startsWith('en')) {
    sentences = DEMO_ENGLISH_SENTENCES;
  }

  if (sentences.length === 0) {
    return (
      <>
        <NavBar displayName={displayName} language={language} />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Card>
            <h1 className="text-xl font-bold text-slate-900">No practice content available</h1>
            <p className="mt-2 text-slate-600">
              There are no active {language.name} items in the database yet. Run the seed script
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-sm">
                supabase/seed/0002_seed_tamil.sql
              </code>
              and reload this page.
            </p>
            <Link href="/dashboard" className="mt-4 inline-block font-medium text-slate-700 underline">
              Back to dashboard
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const startIndex = requestedSentenceId
    ? Math.max(0, sentences.findIndex((item) => item.id === requestedSentenceId))
    : 0;

  const progress = Object.fromEntries(
    (progressResponse.data ?? []).map((row) => [row.sentence_id, row]),
  );

  return (
    <>
      <NavBar displayName={displayName} language={language} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <PracticeSession
          language={language}
          sentences={sentences}
          startIndex={startIndex}
          progress={progress}
        />
      </main>
    </>
  );
}
