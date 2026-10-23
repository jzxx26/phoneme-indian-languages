/**
 * Assessment provider resolution.
 *
 * `azure` (default) and `mms` (the self-hosted open-source engine) both produce
 * real scores and may run in production. The mock provider is gated behind an
 * explicit development flag and is hard-blocked in production builds so a
 * stray env var can never cause fake scores to be stored.
 */

import { isProduction } from '@/lib/env.server';
import { azureProvider } from './azure';
import { mmsProvider } from './mms';
import { mockProvider } from './mock';
import { AssessmentError, type AssessmentProvider } from './types';

export function getAssessmentProvider(): AssessmentProvider {
  const configured = (process.env.ASSESSMENT_PROVIDER ?? 'azure').trim().toLowerCase();

  if (configured === 'mock') {
    if (isProduction) {
      throw new AssessmentError(
        'provider_unavailable',
        'ASSESSMENT_PROVIDER=mock is not allowed in production. Use "azure" or "mms".',
        500,
      );
    }
    return mockProvider;
  }

  if (configured === 'mms') return mmsProvider;
  if (configured === 'azure') return azureProvider;

  throw new AssessmentError(
    'provider_unavailable',
    `Unknown ASSESSMENT_PROVIDER "${configured}". Use "azure", "mms" or (in development) "mock".`,
    500,
  );
}

export { AssessmentError };
export type { AssessmentProvider };
