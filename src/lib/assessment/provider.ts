/**
 * Assessment provider resolution.
 *
 * Production always uses Azure. The mock provider is gated behind an explicit
 * development flag and is hard-blocked in production builds so a stray env var
 * can never cause fake scores to be stored.
 */

import { isProduction } from '@/lib/env.server';
import { azureProvider } from './azure';
import { mockProvider } from './mock';
import { AssessmentError, type AssessmentProvider } from './types';

export function getAssessmentProvider(): AssessmentProvider {
  const configured = (process.env.ASSESSMENT_PROVIDER ?? 'azure').trim().toLowerCase();

  if (configured === 'mock') {
    if (isProduction) {
      throw new AssessmentError(
        'provider_unavailable',
        'ASSESSMENT_PROVIDER=mock is not allowed in production. Configure AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.',
        500,
      );
    }
    return mockProvider;
  }

  if (configured !== 'azure') {
    throw new AssessmentError(
      'provider_unavailable',
      `Unknown ASSESSMENT_PROVIDER "${configured}". Use "azure" or (in development) "mock".`,
      500,
    );
  }

  return azureProvider;
}

export { AssessmentError };
export type { AssessmentProvider };
