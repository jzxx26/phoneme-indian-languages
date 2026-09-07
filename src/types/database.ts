/**
 * Hand-written database types mirroring supabase/migrations/0001_init.sql.
 * Regenerate with `supabase gen types typescript` if the schema changes.
 */

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type ContentKind = 'word' | 'phrase' | 'sentence';

export interface LanguageRow {
  code: string;
  name: string;
  native_name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  display_name: string | null;
  created_at: string;
}

export interface SentenceRow {
  id: string;
  language_code: string;
  text: string;
  transliteration: string | null;
  translation: string | null;
  kind: ContentKind;
  difficulty: DifficultyLevel;
  is_active: boolean;
  created_at: string;
}

export interface StoredWordResult {
  word: string;
  accuracyScore: number | null;
  errorType: string;
}

export interface AttemptRow {
  id: string;
  user_id: string;
  sentence_id: string;
  language_code: string;
  reference_text: string;
  recognized_text: string | null;
  pronunciation_score: number | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  prosody_score: number | null;
  word_results: StoredWordResult[];
  provider: string;
  created_at: string;
}

export interface UserLanguageStatsRow {
  user_id: string;
  language_code: string;
  attempt_count: number;
  sentences_practiced: number;
  avg_pronunciation_score: number | null;
  avg_accuracy_score: number | null;
  avg_fluency_score: number | null;
  avg_completeness_score: number | null;
  best_pronunciation_score: number | null;
  last_attempt_at: string | null;
}

export interface SentenceProgressRow {
  user_id: string;
  sentence_id: string;
  language_code: string;
  reference_text: string;
  attempt_count: number;
  first_score: number | null;
  latest_score: number | null;
  best_score: number | null;
  first_attempt_at: string;
  last_attempt_at: string;
}
