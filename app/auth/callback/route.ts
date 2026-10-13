import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PASSWORD_RECOVERY_COOKIE = 'salsys-password-recovery';

function redirectWithError(request: NextRequest, message: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/forgot-password';
  url.search = '';
  url.searchParams.set('error', message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next');

  if (!code || next !== '/reset-password') {
    return redirectWithError(
      request,
      'This password reset link is invalid. Request a new one.',
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return redirectWithError(
      request,
      'Password reset is not configured. Contact your administrator.',
    );
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/reset-password';
  redirectUrl.search = '';

  let response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        const nextResponse = NextResponse.redirect(redirectUrl);

        response.cookies.getAll().forEach((cookie) => {
          nextResponse.cookies.set(cookie);
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          nextResponse.cookies.set(name, value, options);
        });

        response = nextResponse;
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectWithError(
      request,
      'Your password reset link is invalid or expired. Request a new one.',
    );
  }

  response.cookies.set(PASSWORD_RECOVERY_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 15 * 60,
  });

  return response;
}
