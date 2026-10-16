'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';

const ORGANIZATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function authUrl(path: string, key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `${path}?${params.toString()}`;
}

export async function signInAction(formData: FormData) {
  if (useMockData) redirect('/dashboard');

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const requestedNext = String(formData.get('next') ?? '/dashboard').trim();

  const next =
    requestedNext.startsWith('/') &&
    !requestedNext.startsWith('//') &&
    !requestedNext.startsWith('/workspace')
      ? requestedNext
      : '/dashboard';

  if (!email || !password) {
    redirect(authUrl('/login', 'error', 'Enter your email and password'));
  }

  const supabase = await createClient();
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.user) {
    redirect(authUrl('/login', 'error', 'Invalid email or password'));
  }

  const { data: boundOrganizationId, error: tenantBindingError } =
    await supabase.rpc('bind_current_tenant_session_for_current_user');

  if (tenantBindingError || !boundOrganizationId) {
    await supabase.auth.signOut();

    const rawMessage = tenantBindingError?.message ?? '';
    const message = rawMessage.includes('Multiple active organization memberships')
      ? 'This account is linked to multiple organizations. Please contact your SalsysOS administrator.'
      : rawMessage.includes('No active organization membership')
        ? 'Your account is not assigned to an active organization.'
        : 'Unable to establish your organization session. Please try again.';

    redirect(authUrl('/login', 'error', message));
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, String(boundOrganizationId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ORGANIZATION_COOKIE_MAX_AGE_SECONDS,
  });

  redirect(next);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const forgotPath = '/forgot-password';

  if (!email) {
    redirect(authUrl(forgotPath, 'error', 'Enter your email address.'));
  }

  if (useMockData) {
    redirect(
      authUrl(
        forgotPath,
        'notice',
        'Mock mode is enabled. Password recovery email was not sent.',
      ),
    );
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);

  // Deliberately return the same response whether or not the account exists.
  redirect(
    authUrl(
      forgotPath,
      'notice',
      'If an eligible account exists for that email, a password reset link has been sent.',
    ),
  );
}

export async function confirmPasswordRecoveryAction(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') ?? '').trim();

  if (!tokenHash) {
    redirect(
      authUrl(
        '/login',
        'error',
        'This password reset link is invalid. Request a new one.',
      ),
    );
  }

  const supabase = await createClient();
  const { data: verification, error: verificationError } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });

  if (verificationError || !verification.user) {
    await supabase.auth.signOut();
    redirect(
      authUrl(
        '/login',
        'error',
        'This password reset link is invalid or expired. Request a new one.',
      ),
    );
  }

  // Resolve the tenant from the authenticated recovery identity only.
  // No organization slug or organization ID is accepted from the browser.
  const { data: boundOrganizationId, error: tenantBindingError } =
    await supabase.rpc('bind_current_tenant_session_for_current_user');

  if (tenantBindingError || !boundOrganizationId) {
    await supabase.auth.signOut();
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
    redirect(
      authUrl(
        '/login',
        'error',
        'Unable to establish your organization recovery session. Contact your SalsysOS administrator.',
      ),
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, String(boundOrganizationId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ORGANIZATION_COOKIE_MAX_AGE_SECONDS,
  });

  redirect('/reset-password');
}

export async function updateRecoveredPasswordAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');
  const resetPath = '/reset-password';
  const loginPath = '/login';

  if (password.length < 12) {
    redirect(
      authUrl(
        resetPath,
        'error',
        'Use a password with at least 12 characters.',
      ),
    );
  }

  if (password !== confirmPassword) {
    redirect(authUrl(resetPath, 'error', 'Passwords do not match.'));
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      authUrl(
        loginPath,
        'error',
        'Your password reset session expired. Request a new reset link.',
      ),
    );
  }

  // Re-assert canonical tenant binding from the authenticated user before
  // rotating credentials. This does not trust any tenant identifier from UI.
  const { data: boundOrganizationId, error: tenantBindingError } =
    await supabase.rpc('bind_current_tenant_session_for_current_user');

  if (tenantBindingError || !boundOrganizationId) {
    await supabase.auth.signOut();
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
    redirect(
      authUrl(
        loginPath,
        'error',
        'This password reset session is not valid for an active organization.',
      ),
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    redirect(
      authUrl(
        resetPath,
        'error',
        'Unable to update your password. Use a different password or request a new reset link.',
      ),
    );
  }

  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);

  redirect(
    authUrl(
      loginPath,
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
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);

  redirect('/login');
}
