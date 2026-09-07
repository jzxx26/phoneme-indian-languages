import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { getLanguages } from '@/lib/languages';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const languages = getLanguages();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Pronunciation Trainer</h1>
          <p className="mt-2 text-sm text-slate-600">
            Practise your pronunciation and track how it improves over time.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Available now:{' '}
            {languages.map((language, index) => (
              <span key={language.code}>
                {index > 0 ? ', ' : ''}
                <span className="font-medium text-slate-700">{language.name}</span>{' '}
                <span className="font-indic text-slate-700">({language.nativeName})</span>
              </span>
            ))}
          </p>
        </div>

        <Suspense fallback={<div className="h-96 rounded-xl border border-slate-200 bg-white" />}>
          <AuthForm />
        </Suspense>
      </div>
    </main>
  );
}
