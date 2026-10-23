/**
 * Spoken Spelling Assessment Evaluator.
 *
 * Evaluates the learner's spoken letter names (e.g. "T - E - E - T - H")
 * against the expected letter sequence of the target word.
 *
 * This is distinctly separate from ordinary word pronunciation assessment:
 * it operates on the sequence of spoken letter names, aligns expected vs heard
 * letters, scores each letter individually, and returns understandable feedback.
 */

import { getAssessmentProvider } from './provider';
import { AssessmentError, type AssessmentResult } from './types';
import { getLatinLetters } from '@/lib/audio/speech';
import { getLanguage } from '@/lib/languages';

export interface LetterAssessment {
  position: number;
  expected: string;
  heard: string | null;
  score: number;
  status: 'correct' | 'mispronounced' | 'omitted';
}

export interface SpellingAssessmentResult {
  word: string;
  locale: string;
  expectedLetters: string[];
  heardLetters: string[];
  isCorrect: boolean;
  score: number;
  letters: LetterAssessment[];
  extraLetters: string[];
  feedback: string;
  recognizedText: string | null;
  provider: string;
}

export interface AssessSpellingInput {
  audio: ArrayBuffer;
  contentType: string;
  expectedWord: string;
  locale: string;
}

/**
 * Spoken English letter names as a recogniser may transcribe them. A single
 * letter ("T") is always accepted; these cover the spelled-out forms.
 */
const LETTER_NAMES: Record<string, string> = {
  ay: 'A',
  bee: 'B',
  be: 'B',
  cee: 'C',
  see: 'C',
  sea: 'C',
  dee: 'D',
  ee: 'E',
  ef: 'F',
  eff: 'F',
  gee: 'G',
  aitch: 'H',
  haitch: 'H',
  eye: 'I',
  jay: 'J',
  kay: 'K',
  el: 'L',
  ell: 'L',
  em: 'M',
  en: 'N',
  oh: 'O',
  pee: 'P',
  pea: 'P',
  cue: 'Q',
  queue: 'Q',
  ar: 'R',
  are: 'R',
  es: 'S',
  ess: 'S',
  tee: 'T',
  tea: 'T',
  you: 'U',
  vee: 'V',
  'double-u': 'W',
  doubleu: 'W',
  doubleyou: 'W',
  ex: 'X',
  why: 'Y',
  wye: 'Y',
  zed: 'Z',
  zee: 'Z',
};

interface HeardToken {
  /** Normalised token as recognised, lowercase. */
  token: string;
  score: number | null;
  errorType: string;
}

interface HeardLetter {
  letter: string;
  score: number;
  errorType: string;
}

/** Maps one recognised token to a letter, or null when it is not a letter name. */
function tokenToLetter(token: string): string | null {
  if (/^[a-z]$/.test(token)) return token.toUpperCase();
  return LETTER_NAMES[token] ?? null;
}

/**
 * Splits recognised text into lowercase tokens, merging "double u" into one.
 * Hyphens split too, since recognisers often write spelling as "T-E-E-T-H".
 */
function tokenise(words: { text: string; score: number | null; errorType: string }[]): HeardToken[] {
  const raw: HeardToken[] = [];
  for (const item of words) {
    for (const token of item.text.toLowerCase().split(/[^a-z]+/)) {
      if (token) raw.push({ token, score: item.score, errorType: item.errorType });
    }
  }

  const merged: HeardToken[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const next = raw[i + 1];
    if (raw[i].token === 'double' && next && (next.token === 'u' || next.token === 'you')) {
      merged.push({ ...next, token: 'double-u' });
      i += 1;
    } else {
      merged.push(raw[i]);
    }
  }
  return merged;
}

/**
 * What the learner actually said, in order. Azure's miscue detection reports
 * reference words that were never spoken as `Omission` - those are skipped,
 * because they are the expected letters, not heard ones.
 */
function heardTokens(assessment: AssessmentResult): HeardToken[] {
  const spoken = (assessment.words ?? [])
    .filter((word) => word.errorType !== 'Omission')
    .map((word) => ({ text: word.word, score: word.accuracyScore, errorType: word.errorType }));

  if (spoken.length > 0) return tokenise(spoken);
  if (!assessment.recognizedText) return [];
  return tokenise([{ text: assessment.recognizedText, score: assessment.accuracyScore, errorType: 'None' }]);
}

type AlignmentStep =
  | { kind: 'match' | 'substitute'; expected: number; heard: number }
  | { kind: 'omit'; expected: number }
  | { kind: 'extra'; heard: number };

/** Levenshtein alignment of expected vs heard letters, with backtrace. */
function align(expected: string[], heard: string[]): AlignmentStep[] {
  const rows = expected.length + 1;
  const cols = heard.length + 1;
  const cost: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) cost[i][0] = i;
  for (let j = 0; j < cols; j += 1) cost[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const same = expected[i - 1] === heard[j - 1] ? 0 : 1;
      cost[i][j] = Math.min(cost[i - 1][j - 1] + same, cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    }
  }

  const steps: AlignmentStep[] = [];
  let i = expected.length;
  let j = heard.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = expected[i - 1] === heard[j - 1];
      if (cost[i][j] === cost[i - 1][j - 1] + (same ? 0 : 1)) {
        steps.push({ kind: same ? 'match' : 'substitute', expected: i - 1, heard: j - 1 });
        i -= 1;
        j -= 1;
        continue;
      }
    }
    if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      steps.push({ kind: 'omit', expected: i - 1 });
      i -= 1;
    } else {
      steps.push({ kind: 'extra', heard: j - 1 });
      j -= 1;
    }
  }
  return steps.reverse();
}

function letterScore(heard: HeardLetter): number {
  return Math.round(heard.score);
}

/**
 * Assesses spoken spelling for a word in a language whose registry entry has
 * `spokenSpelling: true`. Throws AssessmentError otherwise.
 */
export async function assessSpelling({
  audio,
  contentType,
  expectedWord,
  locale,
}: AssessSpellingInput): Promise<SpellingAssessmentResult> {
  const language = getLanguage(locale);
  if (!language?.spokenSpelling) {
    throw new AssessmentError(
      'locale_unsupported',
      `Spoken spelling check is not available for ${language?.name ?? locale}.`,
      400,
    );
  }

  const expectedLetters = getLatinLetters(expectedWord);
  if (expectedLetters.length === 0) {
    throw new AssessmentError('unknown', 'No letters found to assess for spelling.', 400);
  }

  const provider = getAssessmentProvider();
  // Judging spoken letter names needs a recogniser with a language model for
  // them; a character-level acoustic engine cannot tell "tee" from "T".
  const providerName: string = provider.name;
  if (providerName !== 'azure' && providerName !== 'mock') {
    throw new AssessmentError(
      'locale_unsupported',
      'Spoken spelling check needs Azure Speech. The open-source engine scores word pronunciation only.',
      400,
    );
  }

  let assessment: AssessmentResult;
  try {
    assessment = await provider.assess({
      audio,
      contentType,
      // The reference text is the spaced letter names, e.g. "T E E T H".
      referenceText: expectedLetters.join(' '),
      locale,
    });
  } catch (error) {
    if (error instanceof AssessmentError) throw error;
    throw new AssessmentError('unknown', 'Spelling assessment failed. Please try again.');
  }

  const tokens = heardTokens(assessment);
  const heard: HeardLetter[] = [];
  let saidWholeWord = false;

  for (const token of tokens) {
    const letter = tokenToLetter(token.token);
    if (letter) {
      heard.push({
        letter,
        score: token.score ?? (token.errorType === 'None' ? 90 : 40),
        errorType: token.errorType,
      });
    } else {
      // A multi-letter token that is not a letter name means the learner said
      // a word (most often the target word itself) instead of spelling it.
      saidWholeWord = true;
    }
  }

  const heardLetters = heard.map((h) => h.letter);
  const letters: LetterAssessment[] = [];
  const extraLetters: string[] = [];

  for (const step of align(expectedLetters, heardLetters)) {
    if (step.kind === 'extra') {
      extraLetters.push(heardLetters[step.heard]);
      continue;
    }

    const position = step.expected + 1;
    const expected = expectedLetters[step.expected];

    if (step.kind === 'omit') {
      letters.push({ position, expected, heard: null, score: 0, status: 'omitted' });
    } else if (step.kind === 'match') {
      const item = heard[step.heard];
      const score = letterScore(item);
      const unclear = item.errorType === 'Mispronunciation' && score < 60;
      letters.push({
        position,
        expected,
        heard: item.letter,
        score: unclear ? score : Math.max(score, 60),
        status: unclear ? 'mispronounced' : 'correct',
      });
    } else {
      const item = heard[step.heard];
      letters.push({
        position,
        expected,
        heard: item.letter,
        score: Math.min(letterScore(item), 45),
        status: 'mispronounced',
      });
    }
  }

  const allLettersCorrect = letters.every((l) => l.status === 'correct');
  const isCorrect = allLettersCorrect && extraLetters.length === 0 && !saidWholeWord;
  const totalScore = letters.reduce((sum, l) => sum + l.score, 0);
  const score = saidWholeWord && heard.length === 0 ? 0 : Math.round(totalScore / expectedLetters.length);

  const upperWord = expectedWord.toUpperCase();
  let feedback: string;
  if (isCorrect) {
    feedback = `Great job! You clearly spelled each letter of “${upperWord}” (${expectedLetters.join(' · ')}) in the correct order.`;
  } else if (saidWholeWord && heard.length === 0) {
    feedback = `It sounds like you said the word — spell it letter by letter instead: “${expectedLetters.join(' … ')}”.`;
  } else if (heard.length === 0) {
    feedback =
      'No clear letter names were detected in the recording. Say each letter name clearly (e.g. “T … E … E … T … H”) and try again.';
  } else {
    const issues: string[] = [];
    const omitted = letters.filter((l) => l.status === 'omitted').map((l) => l.expected);
    const wrong = letters
      .filter((l) => l.status === 'mispronounced')
      .map((l) =>
        l.heard === l.expected
          ? `'${l.expected}' was unclear`
          : `expected '${l.expected}' but heard '${l.heard ?? '?'}'`,
      );
    if (omitted.length > 0) issues.push(`missing letter(s): ${omitted.join(', ')}`);
    if (wrong.length > 0) issues.push(wrong.join(', '));
    if (extraLetters.length > 0) issues.push(`extra letters: ${extraLetters.join(', ')}`);
    if (saidWholeWord) issues.push('some of it sounded like whole words — say only letter names');

    feedback = `Spelling mismatch: heard [${heardLetters.join(' · ')}], expected [${expectedLetters.join(' · ')}]. Issues: ${issues.join('; ')}. Use “Try Spelling Again” to re-record.`;
  }

  return {
    word: expectedWord,
    locale,
    expectedLetters,
    heardLetters,
    isCorrect,
    score,
    letters,
    extraLetters,
    feedback,
    recognizedText: assessment.recognizedText,
    provider: assessment.provider,
  };
}

/** Exported for unit testing of the parsing and alignment. */
export const __testing = { align, tokenise, tokenToLetter };
