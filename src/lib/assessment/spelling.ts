/**
 * Spoken Spelling Assessment Evaluator.
 *
 * Evaluates the learner's spoken letter names (e.g. "T - E - E - T - H")
 * against the expected letter sequence of the target word.
 *
 * This is distinctly separate from ordinary word pronunciation assessment:
 * it operates on the sequence of spoken letter names, compares expected vs heard
 * letters, scores each letter individually, and returns understandable feedback.
 */

import { getAssessmentProvider } from './provider';
import { AssessmentError, type AssessmentResult } from './types';
import { getEnglishLetters } from '@/lib/audio/speech';

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
 * Assesses spoken spelling for an English word.
 * Throws AssessmentError if locale is Tamil or unsupported.
 */
export async function assessSpelling({
  audio,
  contentType,
  expectedWord,
  locale,
}: AssessSpellingInput): Promise<SpellingAssessmentResult> {
  // Multilingual check: reject Tamil or non-Latin locales
  if (locale.toLowerCase().startsWith('ta')) {
    throw new AssessmentError(
      'locale_unsupported',
      'Spoken letter-by-letter spelling assessment is not supported for Tamil (ta-IN). Azure Speech does not provide acoustic models for Tamil letter names.',
      400,
    );
  }

  const expectedLetters = getEnglishLetters(expectedWord);
  if (expectedLetters.length === 0) {
    throw new AssessmentError('unknown', 'No letters found to assess for spelling.', 400);
  }

  // The reference text for spelling assessment is the spaced letter names
  // e.g. "T E E T H"
  const referenceText = expectedLetters.join(' ');

  const provider = getAssessmentProvider();
  let assessment: AssessmentResult;

  try {
    assessment = await provider.assess({
      audio,
      contentType,
      referenceText,
      locale: locale.toLowerCase().startsWith('en') ? locale : 'en-IN',
    });
  } catch (error) {
    if (error instanceof AssessmentError) throw error;
    throw new AssessmentError('unknown', 'Spelling assessment failed. Please try again.');
  }

  // Extract heard letters from Azure or mock assessment result
  const heardWords = assessment.words ?? [];
  const recognizedLetters: { letter: string; score: number; errorType: string }[] = [];

  for (const item of heardWords) {
    const clean = item.word.toUpperCase().replace(/[^A-Z]/g, '');
    if (clean) {
      // Azure usually returns each letter name as a single word (e.g. "T", "E")
      for (const char of clean) {
        recognizedLetters.push({
          letter: char,
          score: item.accuracyScore ?? (item.errorType === 'None' ? 90 : 40),
          errorType: item.errorType,
        });
      }
    }
  }

  // Fallback to recognizedText if words array was empty
  if (recognizedLetters.length === 0 && assessment.recognizedText) {
    const chars = getEnglishLetters(assessment.recognizedText);
    for (const char of chars) {
      recognizedLetters.push({
        letter: char,
        score: assessment.accuracyScore ?? 80,
        errorType: 'None',
      });
    }
  }

  const heardLetters = recognizedLetters.map((r) => r.letter);

  // Compare expected letter sequence with recognized letters
  const letters: LetterAssessment[] = [];
  let totalScore = 0;
  let allCorrect = true;

  for (let i = 0; i < expectedLetters.length; i += 1) {
    const expected = expectedLetters[i];
    const heardItem = recognizedLetters[i];

    if (!heardItem) {
      // Letter was omitted/not spoken
      letters.push({
        position: i + 1,
        expected,
        heard: null,
        score: 0,
        status: 'omitted',
      });
      allCorrect = false;
    } else if (heardItem.letter === expected) {
      const score = Math.max(heardItem.score, 60);
      letters.push({
        position: i + 1,
        expected,
        heard: heardItem.letter,
        score,
        status: heardItem.errorType === 'Mispronunciation' && score < 60 ? 'mispronounced' : 'correct',
      });
      totalScore += score;
      if (heardItem.errorType === 'Mispronunciation' && score < 60) {
        allCorrect = false;
      }
    } else {
      // Wrong letter heard
      const score = Math.min(heardItem.score, 45);
      letters.push({
        position: i + 1,
        expected,
        heard: heardItem.letter,
        score,
        status: 'mispronounced',
      });
      totalScore += score;
      allCorrect = false;
    }
  }

  const extraLetters: string[] = [];
  if (recognizedLetters.length > expectedLetters.length) {
    for (let j = expectedLetters.length; j < recognizedLetters.length; j += 1) {
      extraLetters.push(recognizedLetters[j].letter);
    }
    allCorrect = false;
  }

  const finalScore = Math.round(totalScore / expectedLetters.length);
  const isSpellingCorrect = allCorrect && extraLetters.length === 0;

  // Generate actionable, understandable learner feedback
  let feedback = '';
  if (isSpellingCorrect) {
    feedback = `Great job! You clearly spelled each letter of “${expectedWord.toUpperCase()}” (${expectedLetters.join(' · ')}) in the correct sequence.`;
  } else if (heardLetters.length === 0) {
    feedback =
      'No clear letter names were detected in the recording. Speak each letter name clearly (e.g. “T … E … E … T … H”) and try again.';
  } else {
    const omitted = letters.filter((l) => l.status === 'omitted').map((l) => l.expected);
    const mispronounced = letters
      .filter((l) => l.status === 'mispronounced')
      .map((l) => `expected '${l.expected}' but heard '${l.heard ?? '?'}'`);

    const issues: string[] = [];
    if (omitted.length > 0) {
      issues.push(`missing letter(s): ${omitted.join(', ')}`);
    }
    if (mispronounced.length > 0) {
      issues.push(mispronounced.join(', '));
    }
    if (extraLetters.length > 0) {
      issues.push(`extra spoken letters: ${extraLetters.join(', ')}`);
    }

    feedback = `Spelling mismatch: heard [${heardLetters.join(' · ')}]. Expected [${expectedLetters.join(' · ')}]. Issues: ${issues.join('; ')}. Use "Try Again" to re-record.`;
  }

  return {
    word: expectedWord,
    locale,
    expectedLetters,
    heardLetters,
    isCorrect: isSpellingCorrect,
    score: finalScore,
    letters,
    extraLetters,
    feedback,
    recognizedText: assessment.recognizedText,
    provider: assessment.provider,
  };
}
