'use client';

import { createBrowserClient } from '@supabase/ssr';
import { requirePublicEnv } from '@/lib/env';

/** Supabase client for use inside client components (auth forms, sign-out). */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
