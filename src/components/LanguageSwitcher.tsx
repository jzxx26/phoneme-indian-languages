'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getLanguages } from '@/lib/languages';

/**
 * Switches the practice language while staying on the current page.
 * Renders nothing when only one language is enabled.
 */
export function LanguageSwitcher({ currentCode }: { currentCode: string }) {
  const pathname = usePathname();
  const languages = getLanguages();

  if (languages.length < 2) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs"
      role="group"
      aria-label="Practice language"
    >
      {languages.map((lang) => {
        const isCurrent = lang.code === currentCode;
        return (
          <Link
            key={lang.code}
            href={`${pathname}?lang=${encodeURIComponent(lang.code)}`}
            aria-current={isCurrent ? 'true' : undefined}
            className={`rounded-md px-2 py-1 font-medium transition-colors ${
              isCurrent
                ? 'bg-white font-bold text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title={`Switch language to ${lang.name}`}
          >
            <span className={lang.scriptClassName}>{lang.nativeName}</span>
          </Link>
        );
      })}
    </div>
  );
}
