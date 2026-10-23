/**
 * Browser Speech Synthesis and Multilingual Script Segmentation utilities.
 *
 * Implements:
 * 1. Target word audio teaching via Web Speech API (window.speechSynthesis)
 * 2. Letter-by-letter spelling pronunciation with synchronized visual highlighting
 * 3. Script-appropriate linguistic segmentation:
 *    - For Tamil (ta-IN): true syllabic graphemes (uyir/mei/uyirmei) via Intl.Segmenter
 *    - For English: uppercase letter sequence (e.g. "teeth" -> ['T', 'E', 'E', 'T', 'H'])
 */

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
 * Normalises a locale to browser TTS voice tags.
 */
function normalizeLocale(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower.startsWith('ta')) return 'ta-IN';
  if (lower.startsWith('en')) return 'en-IN';
  return locale;
}

function findBestVoice(locale: string): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const target = normalizeLocale(locale).toLowerCase();

  // Exact match
  const exact = voices.find((v) => v.lang.toLowerCase() === target);
  if (exact) return exact;

  // Prefix match (e.g. 'ta' for 'ta-IN')
  const prefix = target.split('-')[0];
  const byPrefix = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (byPrefix) return byPrefix;

  // If English, any en voice
  if (prefix === 'en') {
    const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (anyEn) return anyEn;
  }

  return null;
}

/**
 * Speaks a word or short phrase aloud using browser SpeechSynthesis.
 */
export function speakWord(
  text: string,
  locale: string,
  options?: { rate?: number; onStart?: () => void; onEnd?: () => void },
): Promise<void> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      options?.onEnd?.();
      resolve();
      return;
    }

    cancelSpeech();

    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = normalizeLocale(locale);
    utterance.lang = targetLang;
    utterance.rate = options?.rate ?? 0.85; // Slightly slower for clear teaching articulation

    const voice = findBestVoice(locale);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      options?.onStart?.();
    };

    utterance.onend = () => {
      options?.onEnd?.();
      resolve();
    };

    utterance.onerror = () => {
      options?.onEnd?.();
      resolve();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      options?.onEnd?.();
      resolve();
    }
  });
}

/**
 * Speaks an English letter sequence aloud letter-by-letter with a short pause
 * and an active index callback for UI highlighting.
 */
export async function speakSpellingSequence(
  letters: string[],
  locale: string,
  options?: {
    onActiveIndex?: (index: number) => void;
    onComplete?: () => void;
  },
): Promise<void> {
  if (!isSpeechSynthesisSupported() || letters.length === 0) {
    options?.onComplete?.();
    return;
  }

  cancelSpeech();

  for (let i = 0; i < letters.length; i += 1) {
    options?.onActiveIndex?.(i);
    const letter = letters[i];

    await new Promise<void>((resolveLetter) => {
      // For individual English letters, speaking letter name clearly
      const utterance = new SpeechSynthesisUtterance(letter);
      utterance.lang = normalizeLocale(locale);
      utterance.rate = 0.8;

      const voice = findBestVoice(locale);
      if (voice) utterance.voice = voice;

      utterance.onend = () => resolveLetter();
      utterance.onerror = () => resolveLetter();

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        resolveLetter();
      }
    });

    // Pause between letters so learner clearly hears each letter
    if (i < letters.length - 1) {
      await new Promise((r) => setTimeout(r, 380));
    }
  }

  options?.onActiveIndex?.(-1);
  options?.onComplete?.();
}

// ---------------------------------------------------------------------------
// Script-appropriate Grapheme Segmentation
// ---------------------------------------------------------------------------

/**
 * Segments Tamil Unicode text into linguistically sound syllabic grapheme units
 * (உயிர், மெய், உயிர்மெய்).
 *
 * NEVER splits combining marks (ா, ி, ீ, etc.) or virama pulli (்) into isolated
 * broken characters.
 */
export function getTamilGraphemes(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const segmenter = new (Intl as unknown as {
        Segmenter: new (
          locale: string,
          options: { granularity: string },
        ) => { segment: (input: string) => Iterable<{ segment: string }> };
      }).Segmenter('ta', { granularity: 'grapheme' });

      const segments = Array.from(segmenter.segment(clean), (s) => s.segment);
      return segments.filter((s) => s.trim() !== '');
    } catch {
      // Fall through to regex
    }
  }

  // Fallback: match Tamil base consonant/vowel plus any number of combining marks
  const matches = clean.match(
    /([\u0B85-\u0B94\u0B95-\u0BB9][\u0BBE-\u0BCD\u0BD7]*|[\u0B82\u0B83]|.)/gu,
  );
  return (matches ?? [clean]).filter((s) => s.trim() !== '');
}

/**
 * Extracts uppercase English letter names for spelling practice.
 */
export function getEnglishLetters(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('');
}

export interface ScriptBreakdown {
  units: string[];
  isEnglish: boolean;
  isTamil: boolean;
  scriptLabel: string;
  spokenSpellingSupported: boolean;
  unsupportedReason?: string;
}

/**
 * Returns script-appropriate breakdown and indicates whether spoken letter-by-letter
 * assessment is supported by the assessment provider.
 */
export function getScriptBreakdown(text: string, locale: string): ScriptBreakdown {
  const isTamil = locale.toLowerCase().startsWith('ta') || /[\u0B80-\u0BFF]/.test(text);

  if (isTamil) {
    const units = getTamilGraphemes(text);
    return {
      units,
      isEnglish: false,
      isTamil: true,
      scriptLabel: 'Tamil Syllabic Graphemes (உயிர் / மெய் / உயிர்மெய்)',
      spokenSpellingSupported: false,
      unsupportedReason:
        'Spoken letter-by-letter spelling assessment is not supported for Tamil (ta-IN) in Azure Speech. Tamil spelling uses syllabic graphemes. Spoken spelling assessment is available for English words. Please proceed to ordinary word pronunciation practice.',
    };
  }

  // English (or Latin-based content)
  const units = getEnglishLetters(text);
  return {
    units,
    isEnglish: true,
    isTamil: false,
    scriptLabel: 'English Letter Sequence',
    spokenSpellingSupported: true,
  };
}
