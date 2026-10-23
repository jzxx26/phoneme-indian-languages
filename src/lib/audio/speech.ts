/**
 * Browser Speech Synthesis and multilingual script segmentation utilities.
 *
 * Implements:
 * 1. Target word audio teaching via Web Speech API (window.speechSynthesis)
 * 2. Letter-by-letter spelling pronunciation with synchronized visual highlighting
 * 3. Script-appropriate segmentation, driven by the language registry:
 *    - 'graphemes': user-perceived characters via Intl.Segmenter, so vowel
 *      signs and viramas stay attached to their consonant
 *    - 'latin-letters': uppercase letter sequence ("teeth" -> T E E T H)
 *
 * Nothing here knows about specific languages: voices are matched by the
 * locale string, and segmentation comes from `LanguageConfig`.
 */

import type { LanguageConfig } from '@/lib/languages';

/** How long to wait for the browser to load its voice list. */
const VOICE_LOAD_TIMEOUT_MS = 1500;

export type SpeakOutcome = 'spoken' | 'no-voice' | 'unsupported';

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function cancelSpeech(): void {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore cancellation errors
    }
  }
}

/**
 * Returns the browser's voices. Chrome populates the list asynchronously, so
 * an empty first read waits for `voiceschanged` (bounded by a timeout).
 */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve([]);

  const synth = window.speechSynthesis;
  const initial = synth.getVoices();
  if (initial.length > 0) return Promise.resolve(initial);

  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener('voiceschanged', finish);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
    synth.addEventListener('voiceschanged', finish);
  });
}

function normaliseTag(tag: string): string {
  return tag.replace('_', '-').toLowerCase();
}

/** Exact locale match first, then any voice for the same base language. */
function pickVoice(voices: SpeechSynthesisVoice[], locale: string): SpeechSynthesisVoice | null {
  const target = normaliseTag(locale);
  const exact = voices.find((v) => normaliseTag(v.lang) === target);
  if (exact) return exact;

  const base = target.split('-')[0];
  return voices.find((v) => normaliseTag(v.lang).split('-')[0] === base) ?? null;
}

async function findVoice(locale: string): Promise<SpeechSynthesisVoice | null> {
  return pickVoice(await loadVoices(), locale);
}

/** Whether this browser has a voice that can speak `locale`. */
export async function hasVoiceFor(locale: string): Promise<boolean> {
  return (await findVoice(locale)) !== null;
}

function speakWithVoice(text: string, voice: SpeechSynthesisVoice, rate: number): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

/**
 * Speaks a word or short phrase aloud using browser SpeechSynthesis.
 *
 * When no voice for the language is installed it does NOT fall back to a
 * different language's voice (that would teach the wrong pronunciation); it
 * resolves 'no-voice' so the caller can tell the learner.
 */
export async function speakWord(
  text: string,
  locale: string,
  options?: { rate?: number; onStart?: () => void; onEnd?: () => void },
): Promise<SpeakOutcome> {
  if (!isSpeechSynthesisSupported()) {
    options?.onEnd?.();
    return 'unsupported';
  }

  cancelSpeech();
  const voice = await findVoice(locale);
  if (!voice) {
    options?.onEnd?.();
    return 'no-voice';
  }

  options?.onStart?.();
  // Slightly slower for clear teaching articulation.
  await speakWithVoice(text, voice, options?.rate ?? 0.85);
  options?.onEnd?.();
  return 'spoken';
}

/**
 * Speaks a letter sequence aloud letter-by-letter with a short pause and an
 * active index callback for UI highlighting.
 */
export async function speakSpellingSequence(
  letters: string[],
  locale: string,
  options?: {
    onActiveIndex?: (index: number) => void;
    onComplete?: () => void;
  },
): Promise<SpeakOutcome> {
  if (!isSpeechSynthesisSupported() || letters.length === 0) {
    options?.onComplete?.();
    return 'unsupported';
  }

  cancelSpeech();
  const voice = await findVoice(locale);
  if (!voice) {
    options?.onComplete?.();
    return 'no-voice';
  }

  for (let i = 0; i < letters.length; i += 1) {
    options?.onActiveIndex?.(i);
    await speakWithVoice(letters[i], voice, 0.8);

    // Pause between letters so the learner clearly hears each one.
    if (i < letters.length - 1) {
      await new Promise((r) => setTimeout(r, 380));
    }
  }

  options?.onActiveIndex?.(-1);
  options?.onComplete?.();
  return 'spoken';
}

// ---------------------------------------------------------------------------
// Script-appropriate segmentation
// ---------------------------------------------------------------------------

/**
 * Splits text into user-perceived characters (grapheme clusters), so combining
 * vowel signs and viramas are never shown as isolated broken marks.
 */
export function getGraphemes(text: string, locale: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(clean), (s) => s.segment).filter((s) => s.trim() !== '');
    } catch {
      // Fall through to code points.
    }
  }

  return Array.from(clean).filter((s) => s.trim() !== '');
}

/** Extracts uppercase Latin letters for spelling practice. */
export function getLatinLetters(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('');
}

export interface ScriptBreakdown {
  units: string[];
  segmentation: LanguageConfig['segmentation'];
  unitsLabel: string;
  spokenSpellingSupported: boolean;
  note?: string;
}

/**
 * Returns the script-appropriate breakdown of `text` for `language`, and
 * whether spoken letter-by-letter checking is offered for it.
 */
export function getScriptBreakdown(text: string, language: LanguageConfig): ScriptBreakdown {
  const units =
    language.segmentation === 'latin-letters'
      ? getLatinLetters(text)
      : getGraphemes(text, language.code);

  return {
    units,
    segmentation: language.segmentation,
    unitsLabel: language.unitsLabel,
    spokenSpellingSupported: language.spokenSpelling,
    note: language.spellingNote,
  };
}
