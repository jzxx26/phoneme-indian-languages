/**
 * Central language registry.
 *
 * Nothing in the application should hardcode "ta-IN" or "Tamil" outside of this
 * file. Pages, API routes and the assessment providers all take a `locale`
 * string and look it up here. Adding a language in a later review means adding
 * one entry below plus a row in `public.languages` - no business logic changes.
 */

export interface LanguageConfig {
  /** BCP-47 locale used by the assessment provider (e.g. Azure Speech). */
  code: string;
  /** English name. */
  name: string;
  /** Name in the language's own script. */
  nativeName: string;
  /** Whether the locale is enabled for practice in the current release. */
  enabled: boolean;
  /**
   * Tailwind-friendly font stack hint for scripts that need a larger optical
   * size to stay readable (Indic scripts render small at default sizes).
   */
  scriptClassName: string;
  /**
   * Whether learners can spell the word aloud letter by letter and have it
   * checked. Only meaningful for alphabets with spoken letter names.
   */
  spokenSpelling: boolean;
  /**
   * How a word is broken into units for the spelling breakdown:
   * - 'latin-letters': A-Z letters ("teeth" -> T E E T H)
   * - 'graphemes': user-perceived characters via Intl.Segmenter, so combining
   *   vowel signs and viramas stay attached to their consonant.
   */
  segmentation: 'latin-letters' | 'graphemes';
  /** Heading shown above the spelling breakdown. */
  unitsLabel: string;
  /** Optional script-specific explanation shown with the breakdown. */
  spellingNote?: string;
}

export const LANGUAGES: readonly LanguageConfig[] = [
  {
    code: 'ta-IN',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    enabled: true,
    scriptClassName: 'font-indic',
    spokenSpelling: false,
    segmentation: 'graphemes',
    unitsLabel: 'Tamil letters (உயிர் / மெய் / உயிர்மெய்)',
    spellingNote:
      'Tamil words are written with vowels (உயிர்), pure consonants with pulli (மெய்) and consonant-vowel combinations (உயிர்மெய்). Each unit is read as a syllable rather than as a letter name.',
  },
  {
    code: 'en-IN',
    name: 'English',
    nativeName: 'English',
    enabled: true,
    scriptClassName: 'font-sans',
    spokenSpelling: true,
    segmentation: 'latin-letters',
    unitsLabel: 'English letter sequence',
  },
  {
    code: 'hi-IN',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    enabled: true,
    scriptClassName: 'font-indic',
    spokenSpelling: false,
    segmentation: 'graphemes',
    unitsLabel: 'Hindi letters (स्वर / व्यंजन / मात्रा)',
    spellingNote:
      'Hindi is written in Devanagari: vowels (स्वर), consonants (व्यंजन) and vowel signs (मात्रा) that attach to a consonant. Each unit is read as a syllable rather than as a letter name.',
  },
  {
    code: 'kn-IN',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    enabled: true,
    scriptClassName: 'font-indic',
    spokenSpelling: false,
    segmentation: 'graphemes',
    unitsLabel: 'Kannada letters (ಸ್ವರ / ವ್ಯಂಜನ / ಕಾಗುಣಿತ)',
    spellingNote:
      'Kannada is written with vowels (ಸ್ವರ), consonants (ವ್ಯಂಜನ) and consonant-vowel combinations (ಕಾಗುಣಿತ), where a vowel sign attaches to the consonant. Each unit is read as a syllable rather than as a letter name.',
  },
  {
    code: 'pa-IN',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    enabled: true,
    scriptClassName: 'font-indic',
    spokenSpelling: false,
    segmentation: 'graphemes',
    unitsLabel: 'Gurmukhi letters (ਸਵਰ / ਵਿਅੰਜਨ / ਲਗਾਂ-ਮਾਤਰਾਂ)',
    spellingNote:
      'Punjabi is written in Gurmukhi: vowels (ਸਵਰ), consonants (ਵਿਅੰਜਨ) and vowel signs (ਲਗਾਂ-ਮਾਤਰਾਂ) that attach to a consonant. Each unit is read as a syllable rather than as a letter name.',
  },
] as const;

/** The locale used when a caller does not specify one. */
export const DEFAULT_LANGUAGE_CODE = 'ta-IN';

export function getLanguages(): LanguageConfig[] {
  return LANGUAGES.filter((language) => language.enabled);
}

export function getLanguage(code: string | null | undefined): LanguageConfig | undefined {
  if (!code) return undefined;
  return LANGUAGES.find((language) => language.code.toLowerCase() === code.toLowerCase());
}

/** Returns the requested locale if it is enabled, otherwise the default one. */
export function resolveLanguage(code: string | null | undefined): LanguageConfig {
  const requested = getLanguage(code);
  if (requested?.enabled) return requested;

  const fallback = getLanguage(DEFAULT_LANGUAGE_CODE);
  if (!fallback) {
    throw new Error(`Default language "${DEFAULT_LANGUAGE_CODE}" is missing from the registry.`);
  }
  return fallback;
}

export function isLanguageEnabled(code: string | null | undefined): boolean {
  return getLanguage(code)?.enabled ?? false;
}
