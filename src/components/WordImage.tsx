'use client';

import { useState } from 'react';
import { FALLBACK_IMAGE_URI, getWordImage } from '@/lib/images';

interface WordImageProps {
  text: string;
  translation?: string | null;
  customImageUrl?: string | null;
  isRevealed: boolean;
  onReveal?: () => void;
  className?: string;
}

export function WordImage({
  text,
  translation,
  customImageUrl,
  isRevealed,
  onReveal,
  className = '',
}: WordImageProps) {
  const initial = getWordImage(text, translation, customImageUrl);
  // Derived from the current word on every render; only a load failure is
  // remembered, and only for the image that failed, so moving to the next
  // word always shows that word's picture.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = failedSrc === initial.src ? FALLBACK_IMAGE_URI : initial.src;

  const handleImageError = () => {
    if (imageSrc !== FALLBACK_IMAGE_URI) setFailedSrc(initial.src);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all ${className}`}
    >
      <div className="flex items-center justify-between gap-2 pb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          Step 1: Visual Clue
        </span>
        <span className="text-xs text-slate-500">
          {isRevealed ? 'Word revealed' : 'Look at picture first'}
        </span>
      </div>

      <div className="relative mx-auto flex max-h-60 max-w-sm items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={isRevealed ? initial.alt : 'Picture clue for the practice word'}
          onError={handleImageError}
          className="h-auto max-h-56 w-full object-contain p-2"
          loading="eager"
        />

        {!isRevealed && onReveal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px] transition-all">
            <p className="text-center text-sm font-medium text-white drop-shadow">
              Can you name this in the practice language?
            </p>
            <button
              type="button"
              onClick={onReveal}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-md hover:bg-slate-100 active:scale-95 transition-transform"
            >
              <span>👁️ Reveal Word & Teach</span>
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 text-center">
        {isRevealed ? (
          <p className="text-xs text-slate-500">
            {translation ? `Clue: “${translation}”` : 'Picture for practice word'}
          </p>
        ) : (
          <p className="text-xs text-slate-600">
            Study the picture above. Reveal the word when you are ready to hear its pronunciation.
          </p>
        )}
      </div>
    </div>
  );
}
