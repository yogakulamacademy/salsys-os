'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';

const ORGANIZATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function authUrl(path: string, key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `${path}?${params.toString()}`;
}

function normalizedOrganizationSlug(value: FormDataEntryValue | null) {
  const slug = String(value ?? '').trim().toLowerCase();
  return ORGANIZATION_SLUG_PATTERN.test(slug) ? slug : '';
}

async function applicationOrigin() {
  const configuredOrigin = process.env.SALSYSOS_APP_URL?.trim();

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall through to trusted deployment headers.
    }
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host')?.trim() ||
    requestHeaders.get('host')?.trim();
  const protocol =
    requestHeaders.get('x-forwarded-proto')?.trim() ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');

  if (!host || !/^https?$/.test(protocol)) {
    return null;
  }

  return `${protocol}://${host}`;
}

export async function signInAction(formData: FormData) {
  if (useMockData) redirect('/dashboard');

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const organizationSlug = normalizedOrganizationSlug(
    formData.get('organization_slug'),
  );
  const requestedNext = String(formData.get('next') ?? '/dashboard').trim();

  const next =
    requestedNext.startsWith('/') &&
    !requestedNext.startsWith('//') &&
    !requestedNext.startsWith('/workspace')
      ? requestedNext
      : '/dashboard';

  if (!organizationSlug) {
    redirect(
      authUrl(
        '/login',
        'error',
        'Use your organization-specific SalsysOS login link.',
      ),
    );
  }

  const loginPath = `/login/${encodeURIComponent(organizationSlug)}`;

  if (!email || !password) {
    redirect(authUrl(loginPath, 'error', 'Enter your email and password'));
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !signInData.user) {
    redirect(authUrl(loginPath, 'error', 'Invalid email or password'));
  }

  const { data: boundOrganizationId, error: tenantBindingError } =
    await supabase.rpc('bind_current_tenant_session_by_slug', {
      p_organization_slug: organizationSlug,
    });

  if (tenantBindingError || !boundOrganizationId) {
    await supabase.auth.signOut();
    redirect(
      authUrl(
        loginPath,
        'error',
        'This organization is unavailable or your account does not have access.',
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

  redirect(next);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const organizationSlug = normalizedOrganizationSlug(
    formData.get('organization_slug'),
  );

  if (!organizationSlug) {
    redirect(
      authUrl(
        '/login',
        'error',
        'Use your organization-specific SalsysOS login link.',
      ),
    );
  }

  const forgotPath = `/forgot-password/${encodeURIComponent(
    organizationSlug,
  )}`;

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

  const origin = await applicationOrigin();

  if (!origin) {
    redirect(
      authUrl(
        forgotPath,
        'error',
        'Password recovery is temporarily unavailable.',
      ),
    );
  }

  const callbackUrl = new URL('/auth/callback', origin);
  callbackUrl.searchParams.set('organization_slug', organizationSlug);
  callbackUrl.searchParams.set('flow', 'password-recovery');

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl.toString(),
  });

  // Deliberately return the same response whether or not the account exists.
  redirect(
    authUrl(
      forgotPath,
      'notice',
      'If an eligible account exists for that email, a password reset link has been sent.',
    ),
  );
}

export async function updateRecoveredPasswordAction(formData: FormData) {
  const organizationSlug = normalizedOrganizationSlug(
    formData.get('organization_slug'),
  );
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (!organizationSlug) {
    redirect('/login?error=invalid-recovery-tenant');
  }

  const resetPath = `/reset-password/${encodeURIComponent(
    organizationSlug,
  )}`;
  const loginPath = `/login/${encodeURIComponent(organizationSlug)}`;

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

  // Re-assert that this recovery session is bound to the tenant encoded in
  // the recovery link. A slug for another membership cannot switch sessions.
  const { data: boundOrganizationId, error: tenantBindingError } =
    await supabase.rpc('bind_current_tenant_session_by_slug', {
      p_organization_slug: organizationSlug,
    });

  if (tenantBindingError || !boundOrganizationId) {
    await supabase.auth.signOut();
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
    redirect(
      authUrl(
        loginPath,
        'error',
        'This reset link is not valid for this organization.',
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

  // Force a normal tenant-specific sign-in after password rotation instead of
  // carrying the recovery session into the CRM as a long-lived user session.
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
