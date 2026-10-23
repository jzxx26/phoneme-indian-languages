/**
 * Open-source pronunciation assessment provider.
 *
 * Calls the self-hosted scoring service in `services/speech`, which runs Meta's
 * MMS speech model and scores each word by forced-aligning the reference text
 * to the audio. Free, no cloud account; used when Azure credentials are not
 * available. Like Azure, it is only ever called from the server.
 */

import { speechServiceEnv } from '@/lib/env.server';
import {
  AssessmentError,
  type AssessmentErrorCode,
  type AssessmentInput,
  type AssessmentProvider,
  type AssessmentResult,
} from './types';

/** The first request after start-up loads a language adapter, which is slow. */
const REQUEST_TIMEOUT_MS = 60_000;

const KNOWN_CODES: readonly AssessmentErrorCode[] = [
  'no_speech_detected',
  'provider_unauthorized',
  'provider_unavailable',
  'provider_rejected_audio',
  'locale_unsupported',
];

interface ServiceError {
  error?: { code?: string; message?: string };
}

export const mmsProvider: AssessmentProvider = {
  name: 'mms',

  async assess({ audio, contentType, referenceText, locale }: AssessmentInput): Promise<AssessmentResult> {
    const { url, token } = speechServiceEnv();

    const body = new FormData();
    body.append('audio', new Blob([audio], { type: contentType }), 'recording.wav');
    body.append('reference_text', referenceText);
    body.append('locale', locale);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${url}/assess`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AssessmentError(
          'provider_unavailable',
          'The speech scoring service did not respond in time. Please try again.',
          504,
        );
      }
      throw new AssessmentError(
        'provider_unavailable',
        `Could not reach the speech scoring service at ${url}. Is it running? See services/speech/README.md.`,
        503,
      );
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AssessmentError('provider_unavailable', 'The speech scoring service returned a malformed response.');
    }

    if (!response.ok) {
      const detail = (payload as ServiceError).error;
      const code = KNOWN_CODES.find((known) => known === detail?.code) ?? 'provider_unavailable';
      throw new AssessmentError(
        code,
        detail?.message ?? `The speech scoring service responded with ${response.status}.`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
      );
    }

    return { ...(payload as Omit<AssessmentResult, 'provider'>), provider: 'mms' };
  },
};
