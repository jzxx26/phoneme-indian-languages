'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    startTransition(() => {
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy || isPending}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
    >
      {busy || isPending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
