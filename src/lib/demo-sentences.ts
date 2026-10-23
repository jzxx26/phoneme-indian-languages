import type { ContentKind, DifficultyLevel } from '@/types/database';

export interface DemoSentence {
  id: string;
  language_code: string;
  text: string;
  transliteration: string | null;
  translation: string | null;
  kind: ContentKind;
  difficulty: DifficultyLevel;
  image_url?: string | null;
}

export const DEMO_ENGLISH_SENTENCES: DemoSentence[] = [
  {
    id: 'demo-en-teeth',
    language_code: 'en-IN',
    text: 'teeth',
    transliteration: null,
    translation: 'teeth (plural of tooth)',
    kind: 'word',
    difficulty: 'beginner',
  },
  {
    id: 'demo-en-water',
    language_code: 'en-IN',
    text: 'water',
    transliteration: null,
    translation: 'drinking water',
    kind: 'word',
    difficulty: 'beginner',
  },
  {
    id: 'demo-en-house',
    language_code: 'en-IN',
    text: 'house',
    transliteration: null,
    translation: 'home / building',
    kind: 'word',
    difficulty: 'beginner',
  },
  {
    id: 'demo-en-book',
    language_code: 'en-IN',
    text: 'book',
    transliteration: null,
    translation: 'reading book',
    kind: 'word',
    difficulty: 'beginner',
  },
  {
    id: 'demo-en-school',
    language_code: 'en-IN',
    text: 'school',
    transliteration: null,
    translation: 'place of learning',
    kind: 'word',
    difficulty: 'intermediate',
  },
  {
    id: 'demo-en-phrase-morning',
    language_code: 'en-IN',
    text: 'Good morning',
    transliteration: null,
    translation: 'Daily morning greeting',
    kind: 'phrase',
    difficulty: 'beginner',
  },
  {
    id: 'demo-en-sentence-learn',
    language_code: 'en-IN',
    text: 'I am learning to speak clearly',
    transliteration: null,
    translation: 'Practice sentence',
    kind: 'sentence',
    difficulty: 'intermediate',
  },
];

export function findDemoSentence(id: string): DemoSentence | undefined {
  return DEMO_ENGLISH_SENTENCES.find((s) => s.id === id);
}
