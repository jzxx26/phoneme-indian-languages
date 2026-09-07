import Link from 'next/link';
import { SignOutButton } from '@/components/SignOutButton';
import type { LanguageConfig } from '@/lib/languages';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/practice', label: 'Practice' },
  { href: '/history', label: 'History' },
];

export function NavBar({
  displayName,
  language,
}: {
  displayName: string;
  language: LanguageConfig;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="text-base font-bold text-slate-900">
            Pronunciation Trainer
          </Link>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 sm:hidden">
            <span className="font-indic">{language.nativeName}</span>
          </span>
        </div>

        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />
          <span className="hidden max-w-[10rem] truncate text-sm text-slate-500 sm:block" title={displayName}>
            {displayName}
          </span>
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
