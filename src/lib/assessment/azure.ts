/**
 * Azure Speech - Pronunciation Assessment provider.
 *
 * Uses the "speech to text REST API for short audio" with the
 * `Pronunciation-Assessment` header. This module runs on the server only: the
 * subscription key never leaves the Node process.
 *
 * Docs: https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment
 */

import { serverEnv } from '@/lib/env.server';
import {
  AssessmentError,
  type AssessmentInput,
  type AssessmentProvider,
  type AssessmentResult,
  type WordResult,
} from './types';

/** Azure rejects anything longer than 60s on the short-audio endpoint. */
const REQUEST_TIMEOUT_MS = 30_000;

interface AzureWord {
  Word?: string;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    ErrorType?: string;
  };
}

interface AzureNBest {
  Display?: string;
  Lexical?: string;
  PronunciationAssessment?: {
    AccuracyScore?: number;
    FluencyScore?: number;
    CompletenessScore?: number;
    ProsodyScore?: number;
    PronScore?: number;
    PronunciationScore?: number;
  };
  Words?: AzureWord[];
}

interface AzureResponse {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: AzureNBest[];
}

function endpointFor(region: string, override?: string): string {
  if (override) return override.replace(/\/+$/, '');
  return `https://${region}.stt.speech.microsoft.com`;
}

function round(value: number | undefined | null): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

/**
 * The assessment parameters travel in a base64-encoded JSON header rather than
 * the body, because the body is the raw audio stream.
 */
function pronunciationAssessmentHeader(referenceText: string): string {
  const config = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Word',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
  };
  return Buffer.from(JSON.stringify(config), 'utf-8').toString('base64');
}

function mapRecognitionStatus(status: string | undefined, locale: string): void {
  switch (status) {
    case 'Success':
      return;
    case 'NoMatch':
      throw new AssessmentError(
        'no_speech_detected',
        'No recognisable speech was found in the recording. Speak clearly and try again.',
        422,
      );
    case 'InitialSilenceTimeout':
      throw new AssessmentError(
        'no_speech_detected',
        'The recording started with silence. Start speaking right after you press record.',
        422,
      );
    case 'BabbleTimeout':
      throw new AssessmentError(
        'no_speech_detected',
        'Too much background noise was detected. Try again somewhere quieter.',
        422,
      );
    default:
      throw new AssessmentError(
        'provider_unavailable',
        `Azure Speech returned an unexpected status "${status ?? 'unknown'}" for locale ${locale}.`,
      );
  }
}

function parseAzureResponse(payload: AzureResponse, locale: string): AssessmentResult {
  mapRecognitionStatus(payload.RecognitionStatus, locale);

  const best = payload.NBest?.[0];
  if (!best) {
    throw new AssessmentError(
      'no_speech_detected',
      'Azure Speech recognised the audio but returned no assessment detail.',
      422,
    );
  }

  const scores = best.PronunciationAssessment ?? {};

  const words: WordResult[] = (best.Words ?? []).map((entry) => ({
    word: entry.Word ?? '',
    accuracyScore: round(entry.PronunciationAssessment?.AccuracyScore),
    errorType: entry.PronunciationAssessment?.ErrorType ?? 'None',
  }));

  return {
    pronunciationScore: round(scores.PronScore ?? scores.PronunciationScore),
    accuracyScore: round(scores.AccuracyScore),
    fluencyScore: round(scores.FluencyScore),
    completenessScore: round(scores.CompletenessScore),
    prosodyScore: round(scores.ProsodyScore),
    recognizedText: best.Display ?? payload.DisplayText ?? best.Lexical ?? null,
    words,
    provider: 'azure',
  };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

export const azureProvider: AssessmentProvider = {
  name: 'azure',

  async assess({ audio, contentType, referenceText, locale }: AssessmentInput): Promise<AssessmentResult> {
    const { azureSpeechKey, azureSpeechRegion, azureSpeechEndpoint } = serverEnv();

    const url = new URL(
      '/speech/recognition/conversation/cognitiveservices/v1',
      endpointFor(azureSpeechRegion, azureSpeechEndpoint),
    );
    url.searchParams.set('language', locale);
    url.searchParams.set('format', 'detailed');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': azureSpeechKey,
          'Content-Type': contentType,
          'Pronunciation-Assessment': pronunciationAssessmentHeader(referenceText),
          Accept: 'application/json',
        },
        body: audio,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AssessmentError(
          'provider_unavailable',
          'Azure Speech did not respond in time. Please try again.',
          504,
        );
      }
      throw new AssessmentError(
        'provider_unavailable',
        'Could not reach Azure Speech. Check the service region and network access.',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await readErrorBody(response);

      if (response.status === 401 || response.status === 403) {
        throw new AssessmentError(
          'provider_unauthorized',
          'Azure Speech rejected the credentials. Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.',
        );
      }
      if (response.status === 400) {
        throw new AssessmentError(
          'provider_rejected_audio',
          `Azure Speech rejected the request. It is usually the audio format or an unsupported locale (${locale}). ${body}`,
          400,
        );
      }
      if (response.status === 429) {
        throw new AssessmentError(
          'provider_unavailable',
          'Azure Speech rate limit reached. Wait a moment and try again.',
          429,
        );
      }
      throw new AssessmentError(
        'provider_unavailable',
        `Azure Speech responded with ${response.status}. ${body}`,
      );
    }

    let payload: AzureResponse;
    try {
      payload = (await response.json()) as AzureResponse;
    } catch {
      throw new AssessmentError('provider_unavailable', 'Azure Speech returned a malformed response.');
    }

    return parseAzureResponse(payload, locale);
  },
};

/** Exported for unit testing / debugging of the response mapping. */
export const __testing = { parseAzureResponse, pronunciationAssessmentHeader };
