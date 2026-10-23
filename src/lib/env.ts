/**
 * Environment values that are safe to ship to the browser.
 *
 * Server-only secrets (Azure) live in `env.server.ts`, which is marked
 * `server-only` so importing it from a client component is a build error.
 */

// `value` must be passed in from a literal `process.env.NEXT_PUBLIC_*` access:
// Next.js only inlines those into the client bundle when referenced statically,
// so a dynamic `process.env[name]` lookup is always undefined in the browser.
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value.trim();
}

export function requirePublicEnv() {
  return {
    supabaseUrl: required(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabaseAnonKey: required(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}
