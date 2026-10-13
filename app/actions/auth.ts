'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { useMockData } from '@/lib/config';
import { isSafeFunctionalWorkspaceDestination } from '@/lib/functional-workspaces';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_ORGANIZATION_COOKIE } from '@/lib/workspace';

const PASSWORD_RECOVERY_COOKIE = 'salsys-password-recovery';

function authUrl(path: string, key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `${path}?${params.toString()}`;
}

function passwordResetRedirectUrl() {
  const configuredUrl = process.env.SALSYS_APP_URL?.trim();
  const fallbackUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
  const baseUrl = configuredUrl || fallbackUrl;

  if (!baseUrl) return null;

  try {
    const url = new URL(baseUrl);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return null;
    }

    url.pathname = '/auth/callback';
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}

export async function signInAction(formData: FormData) {
  if (useMockData) redirect('/dashboard');

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const requestedNext = String(formData.get('next') ?? '/dashboard').trim();

  const safeRequestedNext =
    requestedNext.startsWith('/') &&
    !requestedNext.startsWith('//') &&
    (!requestedNext.startsWith('/workspace') ||
      isSafeFunctionalWorkspaceDestination(requestedNext));

  const next = safeRequestedNext ? requestedNext : '/dashboard';

  if (!email || !password) {
    redirect('/login?error=Enter%20your%20email%20and%20password');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=Invalid%20email%20or%20password');
  }

  redirect(`/workspace?next=${encodeURIComponent(next)}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(authUrl('/forgot-password', 'error', 'Enter a valid email address.'));
  }

  if (useMockData) {
    redirect(
      authUrl(
        '/forgot-password',
        'notice',
        'Mock mode is active. Password reset emails are disabled in this environment.',
      ),
    );
  }

  const redirectTo = passwordResetRedirectUrl();

  if (!redirectTo) {
    redirect(
      authUrl(
        '/forgot-password',
        'error',
        'Password reset is not configured. Contact your administrator.',
      ),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    redirect(
      authUrl(
        '/forgot-password',
        'error',
        'Unable to send a reset email right now. Please try again shortly.',
      ),
    );
  }

  redirect(
    authUrl(
      '/forgot-password',
      'notice',
      'If an account exists for this email, a password reset link has been sent.',
    ),
  );
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (password.length < 10) {
    redirect(
      authUrl(
        '/reset-password',
        'error',
        'New password must be at least 10 characters.',
      ),
    );
  }

  if (password !== confirmPassword) {
    redirect(
      authUrl('/reset-password', 'error', 'Passwords do not match.'),
    );
  }

  const cookieStore = await cookies();

  if (cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== '1') {
    redirect(
      authUrl(
        '/forgot-password',
        'error',
        'Start a new password reset request before setting a new password.',
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
    redirect(
      authUrl(
        '/forgot-password',
        'error',
        'Your password reset link is invalid or expired. Request a new one.',
      ),
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      authUrl(
        '/reset-password',
        'error',
        'Unable to update the password. Request a new reset link if the problem continues.',
      ),
    );
  }

  await supabase.auth.signOut();
  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);

  redirect(
    authUrl(
      '/login',
      'notice',
      'Password updated. Sign in with your new password.',
    ),
  );
}

export async function signOutAction() {
  if (!useMockData) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
  cookieStore.delete(PASSWORD_RECOVERY_COOKIE);

  redirect('/login');
}
