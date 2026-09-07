import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { requirePublicEnv } from '@/lib/env';

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = ['/dashboard', '/practice', '/history'];

/**
 * Refreshes the Supabase auth cookies on every request and applies route
 * guards. Called from the root `middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalidates the token with Supabase - do not replace with getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', pathname + (searchParams.size ? `?${searchParams}` : ''));
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
