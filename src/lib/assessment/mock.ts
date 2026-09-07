/**
 * Development-only stand-in for Azure Pronunciation Assessment.
 *
 * It exists so the recording UI can be built and demonstrated before Azure
 * credentials are provisioned. It is selected ONLY when
 * `ASSESSMENT_PROVIDER=mock` and the build is not a production build - see
 * `provider.ts`, which refuses to load it in production.
 *
 * Delete this file once Azure credentials are permanent; nothing else imports it.
 */

import type { AssessmentInput, AssessmentProvider, AssessmentResult, WordResult } from './types';

/** Deterministic hash so the same sentence yields stable, explainable numbers. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function scoreFor(seed: string, floor: number, ceiling: number): number {
  const span = ceiling - floor + 1;
  return floor + (hash(seed) % span);
}

export const mockProvider: AssessmentProvider = {
  name: 'mock',

  async assess({ referenceText, locale }: AssessmentInput): Promise<AssessmentResult> {
    // Simulate provider latency so loading states are visible during development.
    await new Promise((resolve) => setTimeout(resolve, 700));

    const tokens = referenceText.split(/\s+/).filter(Boolean);

    const words: WordResult[] = tokens.map((word, index) => {
      const accuracy = scoreFor(`${locale}:${word}:${index}`, 55, 99);
      return {
        word,
        accuracyScore: accuracy,
        errorType: accuracy < 70 ? 'Mispronunciation' : 'None',
      };
    });

    const accuracyScore = words.length
      ? Math.round(words.reduce((sum, w) => sum + (w.accuracyScore ?? 0), 0) / words.length)
      : scoreFor(referenceText, 60, 95);

    const fluencyScore = scoreFor(`fluency:${referenceText}`, 60, 98);
    const completenessScore = 100;
    const pronunciationScore = Math.round(
      accuracyScore * 0.6 + fluencyScore * 0.2 + completenessScore * 0.2,
    );

    return {
      pronunciationScore,
      accuracyScore,
      fluencyScore,
      completenessScore,
      prosodyScore: null,
      recognizedText: referenceText,
      words,
      provider: 'mock',
    };
  },
};
