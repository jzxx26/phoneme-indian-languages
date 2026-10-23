/**
 * Reliable illustrations for word-based practice items.
 *
 * Pictures are looked up by the item's text or its English translation, so a
 * new language needs no changes here as long as its seed has translations.
 * They deliberately carry no caption: the picture must not give away the word.
 *
 * All illustrations are self-contained vector SVGs encoded as Data URIs.
 * They require zero external network requests, work 100% offline, never 404,
 * and render razor-sharp across all screen densities.
 */

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Curated SVG Illustrations for vocabulary
// ---------------------------------------------------------------------------

const MOTHER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#FDF2F8"/>
  <circle cx="160" cy="120" r="90" fill="#FCE7F3"/>
  <!-- Mother and child silhouette/warm illustration -->
  <circle cx="140" cy="85" r="28" fill="#EC4899"/>
  <path d="M110 160 C110 125, 170 125, 170 160 Z" fill="#DB2777"/>
  <circle cx="185" cy="115" r="18" fill="#F472B6"/>
  <path d="M165 160 C165 138, 205 138, 205 160 Z" fill="#EC4899"/>
  <!-- Heart icon -->
  <path d="M160 50 C155 42, 145 42, 140 48 C133 56, 160 74, 160 74 C160 74, 187 56, 180 48 C175 42, 165 42, 160 50 Z" fill="#E11D48"/>
</svg>
`;

const FATHER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#EFF6FF"/>
  <circle cx="160" cy="120" r="90" fill="#DBEAFE"/>
  <!-- Father and child -->
  <circle cx="145" cy="80" r="28" fill="#2563EB"/>
  <path d="M110 160 C110 120, 180 120, 180 160 Z" fill="#1D4ED8"/>
  <circle cx="190" cy="115" r="18" fill="#60A5FA"/>
  <path d="M170 160 C170 138, 210 138, 210 160 Z" fill="#3B82F6"/>
  <!-- Star icon -->
  <path d="M160 42 L163 50 L172 50 L165 55 L168 64 L160 59 L152 64 L155 55 L148 50 L157 50 Z" fill="#F59E0B"/>
</svg>
`;

const WATER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#F0FDF4"/>
  <circle cx="160" cy="120" r="90" fill="#E0F2FE"/>
  <!-- Water drops and glass -->
  <path d="M160 55 C160 55, 130 98, 130 118 C130 135, 143 148, 160 148 C177 148, 190 135, 190 118 C190 98, 160 55, 160 55 Z" fill="#0284C7"/>
  <circle cx="152" cy="110" r="6" fill="#BAE6FD"/>
  <!-- Ripples -->
  <ellipse cx="160" cy="170" rx="50" ry="12" fill="#38BDF8" fill-opacity="0.4"/>
  <ellipse cx="160" cy="170" rx="30" ry="7" fill="#0284C7" fill-opacity="0.6"/>
</svg>
`;

const HOUSE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#FFFBEB"/>
  <circle cx="160" cy="120" r="90" fill="#FEF3C7"/>
  <!-- House base -->
  <rect x="115" y="105" width="90" height="70" rx="4" fill="#F59E0B"/>
  <!-- Roof -->
  <path d="M100 110 L160 60 L220 110 Z" fill="#D97706"/>
  <!-- Chimney -->
  <rect x="190" y="70" width="14" height="25" fill="#B45309"/>
  <!-- Door -->
  <rect x="145" y="135" width="22" height="40" rx="2" fill="#78350F"/>
  <!-- Window -->
  <rect x="125" y="120" width="16" height="16" rx="2" fill="#FEF3C7"/>
  <rect x="175" y="120" width="16" height="16" rx="2" fill="#FEF3C7"/>
</svg>
`;

const FLOWER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#FDF4FF"/>
  <circle cx="160" cy="120" r="90" fill="#FAE8FF"/>
  <!-- Stem & Leaf -->
  <path d="M160 120 Q160 170, 160 180" stroke="#16A34A" stroke-width="6" stroke-linecap="round"/>
  <path d="M160 150 Q180 145, 185 135 Q170 145, 160 150" fill="#22C55E"/>
  <path d="M160 160 Q140 155, 135 145 Q150 155, 160 160" fill="#22C55E"/>
  <!-- Petals -->
  <circle cx="160" cy="85" r="22" fill="#C084FC"/>
  <circle cx="160" cy="135" r="22" fill="#C084FC"/>
  <circle cx="135" cy="110" r="22" fill="#C084FC"/>
  <circle cx="185" cy="110" r="22" fill="#C084FC"/>
  <circle cx="142" cy="92" r="22" fill="#E879F9"/>
  <circle cx="178" cy="92" r="22" fill="#E879F9"/>
  <circle cx="142" cy="128" r="22" fill="#E879F9"/>
  <circle cx="178" cy="128" r="22" fill="#E879F9"/>
  <!-- Flower center -->
  <circle cx="160" cy="110" r="18" fill="#FACC15"/>
</svg>
`;

const FRIEND_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#F0FDFA"/>
  <circle cx="160" cy="120" r="90" fill="#CCFBF1"/>
  <!-- Two friends smiling -->
  <circle cx="130" cy="85" r="24" fill="#0D9488"/>
  <path d="M100 160 C100 125, 155 125, 155 160 Z" fill="#14B8A6"/>
  <circle cx="190" cy="85" r="24" fill="#0284C7"/>
  <path d="M165 160 C165 125, 220 125, 220 160 Z" fill="#0EA5E9"/>
  <!-- Handshake / arm around shoulder -->
  <path d="M130 130 Q160 145, 190 130" stroke="#0F766E" stroke-width="4" stroke-linecap="round"/>
</svg>
`;

const BOOK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#F5F3FF"/>
  <circle cx="160" cy="120" r="90" fill="#EDE9FE"/>
  <!-- Open Book -->
  <path d="M160 85 C145 75, 115 75, 100 85 L100 155 C115 145, 145 145, 160 155 Z" fill="#FFFFFF" stroke="#6366F1" stroke-width="3"/>
  <path d="M160 85 C175 75, 205 75, 220 85 L220 155 C205 145, 175 145, 160 155 Z" fill="#FFFFFF" stroke="#6366F1" stroke-width="3"/>
  <!-- Spine and book cover -->
  <path d="M96 85 L160 155 L224 85" stroke="#4F46E5" stroke-width="4" fill="none"/>
  <!-- Lines in book -->
  <line x1="110" y1="100" x2="145" y2="95" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round"/>
  <line x1="110" y1="115" x2="145" y2="110" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round"/>
  <line x1="110" y1="130" x2="145" y2="125" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round"/>
  <line x1="175" y1="95" x2="210" y2="100" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round"/>
  <line x1="175" y1="110" x2="210" y2="115" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round"/>
  <line x1="175" y1="125" x2="210" y2="130" stroke="#A5B4FC" stroke-width="2" stroke-linecap="round"/>
</svg>
`;

const FOOD_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#FFF7ED"/>
  <circle cx="160" cy="120" r="90" fill="#FFEDD5"/>
  <!-- Bowl of hot meal -->
  <path d="M105 120 C105 160, 215 160, 215 120 Z" fill="#EA580C"/>
  <ellipse cx="160" cy="120" rx="55" ry="15" fill="#F97316"/>
  <!-- Food inside -->
  <ellipse cx="160" cy="120" rx="45" ry="10" fill="#FDE047"/>
  <!-- Steam curls -->
  <path d="M140 100 Q145 85, 140 75" stroke="#FB923C" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M160 95 Q165 80, 160 70" stroke="#FB923C" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M180 100 Q185 85, 180 75" stroke="#FB923C" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>
`;

const SCHOOL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#F0FDF4"/>
  <circle cx="160" cy="120" r="90" fill="#DCFCE7"/>
  <!-- School Building -->
  <rect x="100" y="100" width="120" height="75" rx="3" fill="#15803D"/>
  <!-- Center tower -->
  <rect x="140" y="70" width="40" height="105" rx="2" fill="#166534"/>
  <!-- Triangular roof over tower -->
  <path d="M135 70 L160 40 L185 70 Z" fill="#14532D"/>
  <!-- Flag on roof -->
  <line x1="160" y1="40" x2="160" y2="28" stroke="#374151" stroke-width="2"/>
  <path d="M160 28 L175 34 L160 40 Z" fill="#EF4444"/>
  <!-- Clock on tower -->
  <circle cx="160" cy="85" r="10" fill="#FFFFFF"/>
  <line x1="160" y1="85" x2="160" y2="79" stroke="#1F2937" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="160" y1="85" x2="164" y2="85" stroke="#1F2937" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Door -->
  <rect x="150" y="145" width="20" height="30" rx="2" fill="#FFFFFF"/>
  <!-- Windows -->
  <rect x="112" y="115" width="16" height="16" rx="2" fill="#BBF7D0"/>
  <rect x="192" y="115" width="16" height="16" rx="2" fill="#BBF7D0"/>
</svg>
`;

const TEETH_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#F0F9FF"/>
  <circle cx="160" cy="120" r="90" fill="#E0F2FE"/>
  <!-- Smiling lips -->
  <path d="M90 115 C115 155, 205 155, 230 115 C205 130, 115 130, 90 115 Z" fill="#F43F5E"/>
  <!-- Inner mouth -->
  <path d="M100 120 C120 148, 200 148, 220 120 C195 125, 125 125, 100 120 Z" fill="#881337"/>
  <!-- Upper row of clean white teeth -->
  <rect x="110" y="116" width="16" height="14" rx="3" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
  <rect x="128" y="116" width="19" height="16" rx="3" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
  <rect x="149" y="116" width="22" height="18" rx="3" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
  <rect x="173" y="116" width="19" height="16" rx="3" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
  <rect x="194" y="116" width="16" height="14" rx="3" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
  <!-- Sparkle on teeth -->
  <path d="M152 110 L154 116 L160 118 L154 120 L152 126 L150 120 L144 118 L150 116 Z" fill="#38BDF8"/>
</svg>
`;

const GENERIC_FALLBACK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" fill="none">
  <rect width="320" height="240" rx="16" fill="#F8FAFC"/>
  <circle cx="160" cy="115" r="70" fill="#E2E8F0"/>
  <!-- Flashcard / vocabulary picture placeholder icon -->
  <rect x="120" y="75" width="80" height="60" rx="8" fill="#FFFFFF" stroke="#94A3B8" stroke-width="3"/>
  <circle cx="140" cy="95" r="8" fill="#38BDF8"/>
  <path d="M125 125 L145 105 L165 120 L175 112 L195 125 Z" fill="#94A3B8"/>
  <text x="160" y="180" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#475569">Word Practice</text>
  <text x="160" y="200" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#94A3B8">Visual prompt</text>
</svg>
`;

// ---------------------------------------------------------------------------
// Image Lookup Mapping
// ---------------------------------------------------------------------------

const IMAGE_MAP: Record<string, string> = {
  // Keyed by English word / meaning, so any language maps via its translation.
  mother: svgToDataUri(MOTHER_SVG),
  father: svgToDataUri(FATHER_SVG),
  water: svgToDataUri(WATER_SVG),
  'drinking water': svgToDataUri(WATER_SVG),
  house: svgToDataUri(HOUSE_SVG),
  flower: svgToDataUri(FLOWER_SVG),
  friend: svgToDataUri(FRIEND_SVG),
  book: svgToDataUri(BOOK_SVG),
  food: svgToDataUri(FOOD_SVG),
  'food / meal': svgToDataUri(FOOD_SVG),
  meal: svgToDataUri(FOOD_SVG),
  school: svgToDataUri(SCHOOL_SVG),
  teeth: svgToDataUri(TEETH_SVG),
  tooth: svgToDataUri(TEETH_SVG),
};

export const FALLBACK_IMAGE_URI = svgToDataUri(GENERIC_FALLBACK_SVG);

/**
 * Returns a reliable image URL/URI for a word based on its text,
 * translation, or an explicit image_url override.
 */
export function getWordImage(
  text: string,
  translation?: string | null,
  customImageUrl?: string | null,
): { src: string; isFallback: boolean; alt: string } {
  if (customImageUrl && customImageUrl.trim() !== '') {
    return {
      src: customImageUrl.trim(),
      isFallback: false,
      alt: translation ? `Picture for ${translation}` : `Picture for ${text}`,
    };
  }

  const cleanText = text.trim().toLowerCase();
  if (IMAGE_MAP[cleanText]) {
    return {
      src: IMAGE_MAP[cleanText],
      isFallback: false,
      alt: translation ? `Picture for ${translation}` : `Picture for ${cleanText}`,
    };
  }

  if (translation) {
    const cleanTrans = translation.trim().toLowerCase();
    if (IMAGE_MAP[cleanTrans]) {
      return {
        src: IMAGE_MAP[cleanTrans],
        isFallback: false,
        alt: `Picture for ${translation}`,
      };
    }

    // Try partial words in translation (e.g. 'food / meal' -> 'food')
    for (const [key, uri] of Object.entries(IMAGE_MAP)) {
      if (cleanTrans.includes(key)) {
        return {
          src: uri,
          isFallback: false,
          alt: `Picture for ${translation}`,
        };
      }
    }
  }

  return {
    src: FALLBACK_IMAGE_URI,
    isFallback: true,
    alt: `Picture for ${text}`,
  };
}
