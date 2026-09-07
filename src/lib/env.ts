/**
 * Environment values that are safe to ship to the browser.
 *
 * Server-only secrets (Azure) live in `env.server.ts`, which is marked
 * `server-only` so importing it from a client component is a build error.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value.trim();
}

export function requirePublicEnv() {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };
}
