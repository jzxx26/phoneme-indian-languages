'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'sign-in' | 'sign-up';

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10';

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';

  const [mode, setMode] = useState<Mode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const supabase = createClient();

    try {
      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0] },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          },
        });

        if (signUpError) throw signUpError;

        // With "Confirm email" enabled there is no session until the link is clicked.
        if (!data.session) {
          setNotice('Check your inbox for a confirmation link, then sign in.');
          setMode('sign-in');
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {(['sign-in', 'sign-up'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
              setNotice(null);
            }}
            aria-pressed={mode === value}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
              mode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {value === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'sign-up' ? (
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name"
              className={INPUT_CLASS}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT_CLASS}
          />
          {mode === 'sign-up' ? (
            <p className="mt-1 text-xs text-slate-500">At least 6 characters.</p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
