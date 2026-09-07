import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRow } from '@/types/database';

export interface SessionContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string;
  displayName: string;
}

/**
 * Loads the signed-in user and their display name for a server component.
 * Middleware already guards these routes; this is the defence-in-depth check.
 */
export async function requireSession(returnTo = '/dashboard'): Promise<SessionContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle<Pick<ProfileRow, 'display_name'>>();

  const fallbackName =
    (user.user_metadata?.display_name as string | undefined) ?? user.email?.split('@')[0] ?? 'Learner';

  return {
    supabase,
    userId: user.id,
    email: user.email ?? '',
    displayName: profile?.display_name?.trim() || fallbackName,
  };
}
