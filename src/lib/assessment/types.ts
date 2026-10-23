/**
 * Provider-neutral pronunciation assessment contract.
 *
 * The UI and the database only ever see these shapes. Swapping or adding an
 * assessment provider means implementing `AssessmentProvider` - no UI changes.
 */

export type WordErrorType =
  | 'None'
  | 'Omission'
  | 'Insertion'
  | 'Mispronunciation'
  | 'UnexpectedBreak'
  | 'MissingBreak'
  | 'Monotone'
  | (string & {});

export interface WordResult {
  word: string;
  /** 0-100, or null when the provider could not score the word (e.g. omission). */
  accuracyScore: number | null;
  errorType: WordErrorType;
}

export interface AssessmentResult {
  /** Overall pronunciation score, 0-100. */
  pronunciationScore: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  /** Only returned by providers that support prosody scoring. */
  prosodyScore: number | null;
  /** What the recogniser actually heard, for "did it hear me at all?" feedback. */
  recognizedText: string | null;
  words: WordResult[];
  provider: AssessmentProviderName;
}

/** 'mms' is the self-hosted open-source engine in services/speech. */
export type AssessmentProviderName = 'azure' | 'mms' | 'mock';

export interface AssessmentInput {
  audio: ArrayBuffer;
  /** MIME type of `audio`, e.g. 'audio/wav; codecs=audio/pcm; samplerate=16000'. */
  contentType: string;
  /** The expected text the learner was asked to say. */
  referenceText: string;
  /** BCP-47 locale, e.g. 'ta-IN'. */
  locale: string;
}

export interface AssessmentProvider {
  readonly name: AssessmentProviderName;
  assess(input: AssessmentInput): Promise<AssessmentResult>;
}

export type AssessmentErrorCode =
  | 'no_speech_detected'
  | 'provider_unauthorized'
  | 'provider_unavailable'
  | 'provider_rejected_audio'
  | 'locale_unsupported'
  | 'unknown';

/** Error carrying a stable code so the UI can show an actionable message. */
export class AssessmentError extends Error {
  readonly code: AssessmentErrorCode;
  readonly status: number;

  constructor(code: AssessmentErrorCode, message: string, status = 502) {
    super(message);
    this.name = 'AssessmentError';
    this.code = code;
    this.status = status;
  }
}
