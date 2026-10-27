'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';

const ORGANIZATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const AUTH_RETRY_DELAY_MS = 450;
const LOGIN_OPERATION_MAX_MS = 5000;
const TENANT_BIND_MAX_MS = 5000;
const ONBOARDING_CHECK_MAX_MS = 800;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type TenantBindingResult =
  | { ok: true; organizationId: string }
  | {
      ok: false;
      reason:
        | 'no_membership'
        | 'multiple_memberships'
        | 'binding_failed';
      detail?: string;
    };

type AuthErrorLike = {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
} | null;

class AuthDependencyTimeout extends Error {
  constructor(public readonly dependency: string) {
    super(`${dependency} timed out`);
    this.name = 'AuthDependencyTimeout';
  }
}

async function withAuthDeadline<T>(
  operation: PromiseLike<T>,
  maxWaitMs: number,
  dependency: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new AuthDependencyTimeout(dependency)),
          maxWaitMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function authUrl(path: string, key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `${path}?${params.toString()}`;
}

function loginAuthUrl(
  key: 'notice' | 'error',
  message: string,
  next?: string,
) {
  const params = new URLSearchParams({ [key]: message });
  if (next) params.set('next', next);
  return `/login?${params.toString()}`;
}

function isTransientAuthError(error: AuthErrorLike) {
  if (!error) return false;

  const status = Number(error.status ?? 0);
  if (status === 408 || status === 429 || status >= 500) return true;

  const detail = `${error.name ?? ''} ${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();

  return (
    detail.includes('timeout') ||
    detail.includes('timed out') ||
    detail.includes('network') ||
    detail.includes('fetch failed') ||
    detail.includes('failed to fetch') ||
    detail.includes('temporarily unavailable') ||
    detail.includes('request_timeout') ||
    detail.includes('retryable')
  );
}

function isWeakPasswordAuthError(error: AuthErrorLike) {
  if (!error) return false;

  const name = String(error.name ?? '').toLowerCase();
  const code = String(error.code ?? '').toLowerCase();

  return (
    code === 'weak_password' ||
    name === 'authweakpassworderror' ||
    name === 'weakpassworderror'
  );
}

function hasWeakPasswordSignal(data: unknown) {
  if (!data || typeof data !== 'object') return false;

  const record = data as Record<string, unknown>;
  const weakPassword = record.weakPassword ?? record.weak_password;

  if (!weakPassword || typeof weakPassword !== 'object') return false;

  const detail = weakPassword as Record<string, unknown>;
  const reasons = Array.isArray(detail.reasons) ? detail.reasons : [];

  return reasons.length > 0 || Boolean(detail.message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signInWithTransientRetry(
  supabase: ServerSupabaseClient,
  email: string,
  password: string,
) {
  let result = await withAuthDeadline(
    supabase.auth.signInWithPassword({ email, password }),
    LOGIN_OPERATION_MAX_MS,
    'supabase.auth.signInWithPassword',
  );

  if (result.error && isTransientAuthError(result.error)) {
    await wait(AUTH_RETRY_DELAY_MS);
    result = await withAuthDeadline(
      supabase.auth.signInWithPassword({ email, password }),
      LOGIN_OPERATION_MAX_MS,
      'supabase.auth.signInWithPassword retry',
    );
  }

  return result;
}

async function bindCurrentUserOrganization(
  supabase: ServerSupabaseClient,
): Promise<TenantBindingResult> {
  try {
    const { data: boundOrganizationId, error: bindingError } =
      await withAuthDeadline(
        supabase.rpc('bind_current_tenant_session_for_current_user'),
        TENANT_BIND_MAX_MS,
        'bind_current_tenant_session_for_current_user',
      );

    if (bindingError || !boundOrganizationId) {
      const detail = bindingError?.message ?? '';

      if (detail.includes('No active organization membership')) {
        return { ok: false, reason: 'no_membership', detail };
      }

      if (detail.includes('Multiple active organization memberships')) {
        return { ok: false, reason: 'multiple_memberships', detail };
      }

      return { ok: false, reason: 'binding_failed', detail };
    }

    return {
      ok: true,
      organizationId: String(boundOrganizationId),
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'binding_failed',
      detail:
        error instanceof AuthDependencyTimeout
          ? error.message
          : 'Tenant binding request failed',
    };
  }
}

function tenantBindingMessage(result: Exclude<TenantBindingResult, { ok: true }>) {
  if (result.reason === 'no_membership') {
    return 'Your account is not assigned to an active organization.';
  }

  if (result.reason === 'multiple_memberships') {
    return 'This account is linked to multiple organizations. Please contact your SalsysOS administrator.';
  }

  return 'Unable to establish your organization session. The service may be temporarily unavailable. Please try again.';
}

async function setWorkspaceCookie(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ORGANIZATION_COOKIE_MAX_AGE_SECONDS,
  });
}

async function shouldEnterRequiredOnboarding(
  supabase: ServerSupabaseClient,
  organizationId: string,
) {
  try {
    return await withAuthDeadline(
      (async () => {
        const { data: canManage, error: permissionError } = await supabase.rpc(
          'can_manage_organization',
          { p_organization_id: organizationId },
        );

        if (permissionError || !canManage) return false;

        const { data: onboarding, error: onboardingError } = await supabase
          .from('organization_onboarding')
          .select('status,enforce_on_sign_in')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (onboardingError || !onboarding) return false;

        return (
          onboarding.enforce_on_sign_in === true &&
          onboarding.status !== 'completed' &&
          onboarding.status !== 'dismissed'
        );
      })(),
      ONBOARDING_CHECK_MAX_MS,
      'login onboarding check',
    );
  } catch {
    return false;
  }
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
    redirect(loginAuthUrl('error', 'Enter your email and password', next));
  }

  const supabase = await createClient();

  let signInData;
  let signInError: AuthErrorLike;

  try {
    const result = await signInWithTransientRetry(supabase, email, password);
    signInData = result.data;
    signInError = result.error;
  } catch (error) {
    console.warn('Login auth dependency unavailable', {
      reason:
        error instanceof AuthDependencyTimeout
          ? error.dependency
          : 'supabase.auth.signInWithPassword',
    });
    redirect(
      loginAuthUrl(
        'error',
        'Sign-in service is temporarily unavailable. Your password was not rejected. Please try again shortly.',
        next,
      ),
    );
  }

  if (isWeakPasswordAuthError(signInError) || hasWeakPasswordSignal(signInData)) {
    await supabase.auth.signOut();
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
    redirect(
      loginAuthUrl(
        'error',
        'For your security, this password must be changed. Use “Forgot password?” to set a new password before signing in.',
        next,
      ),
    );
  }

  if (signInError || !signInData.user) {
    if (isTransientAuthError(signInError)) {
      redirect(
        loginAuthUrl(
          'error',
          'Sign-in service is temporarily unavailable. Your password was not rejected. Please try again in a moment.',
          next,
        ),
      );
    }

    redirect(loginAuthUrl('error', 'Invalid email or password', next));
  }

  const tenant = await bindCurrentUserOrganization(supabase);

  if (!tenant.ok) {
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
    redirect(loginAuthUrl('error', tenantBindingMessage(tenant), next));
  }

  await setWorkspaceCookie(tenant.organizationId);

  if (signInData.user.app_metadata?.require_password_change === true) {
    redirect('/onboarding/security');
  }

  if (await shouldEnterRequiredOnboarding(supabase, tenant.organizationId)) {
    redirect('/onboarding');
  }

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

  const tenant = await bindCurrentUserOrganization(supabase);

  if (!tenant.ok) {
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

  await setWorkspaceCookie(tenant.organizationId);
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

  const tenant = await bindCurrentUserOrganization(supabase);

  if (!tenant.ok) {
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
    if (isWeakPasswordAuthError(updateError)) {
      redirect(
        authUrl(
          resetPath,
          'error',
          'This password is known to be weak or compromised. Choose a different password.',
        ),
      );
    }

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
