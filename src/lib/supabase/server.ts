import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requirePublicEnv } from '@/lib/env';

/**
 * Supabase client for server components, route handlers and server actions.
 * Requests carry the signed-in user's JWT, so every query is subject to RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component: the middleware refreshes the
          // session cookies instead, so this is safe to ignore.
        }
      },
    },
  });
}
