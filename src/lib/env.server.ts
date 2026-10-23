import 'server-only';

/**
 * Server-only environment access.
 *
 * The `server-only` import above makes any attempt to pull this module into a
 * client component fail at build time, which is what guarantees the Azure
 * subscription key can never be bundled for the browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value.trim();
}

export function serverEnv() {
  return {
    azureSpeechKey: required('AZURE_SPEECH_KEY'),
    azureSpeechRegion: required('AZURE_SPEECH_REGION'),
    /** Optional override for sovereign clouds / custom endpoints. */
    azureSpeechEndpoint: process.env.AZURE_SPEECH_ENDPOINT?.trim() || undefined,
  };
}

/**
 * The self-hosted open-source scoring service (services/speech). Neither value
 * is required: the URL defaults to the local dev address, and the token is only
 * needed when the service is started with SPEECH_SERVICE_TOKEN.
 */
export function speechServiceEnv() {
  return {
    url: (process.env.SPEECH_SERVICE_URL?.trim() || 'http://127.0.0.1:8765').replace(/\/+$/, ''),
    token: process.env.SPEECH_SERVICE_TOKEN?.trim() || undefined,
  };
}

export const isProduction = process.env.NODE_ENV === 'production';
