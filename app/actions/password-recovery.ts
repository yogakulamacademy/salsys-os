'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  claimPasswordRecoveryGrant,
  issuePasswordRecoveryGrant,
  PASSWORD_RECOVERY_GRANT_COOKIE,
  PASSWORD_RECOVERY_GRANT_MAX_AGE_SECONDS,
} from '@/lib/auth/password-recovery-grant';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';

const ORGANIZATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type AuthErrorLike = {
  name?: string;
  message?: string;
  status?: number;
  code?: string;
} | null;

function authUrl(path: string, key: 'notice' | 'error', message: string) {
  const params = new URLSearchParams({ [key]: message });
  return `${path}?${params.toString()}`;
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

async function bindRecoveryTenant(supabase: ServerSupabaseClient) {
  const { data: organizationId, error } = await supabase.rpc(
    'bind_current_tenant_session_for_current_user',
  );

  if (error || !organizationId) return null;
  return String(organizationId);
}

async function setRecoveryCookies(organizationId: string, recoveryToken: string) {
  const cookieStore = await cookies();

  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ORGANIZATION_COOKIE_MAX_AGE_SECONDS,
  });

  cookieStore.set(PASSWORD_RECOVERY_GRANT_COOKIE, recoveryToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PASSWORD_RECOVERY_GRANT_MAX_AGE_SECONDS,
  });
}

async function clearRecoveryCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(PASSWORD_RECOVERY_GRANT_COOKIE);
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
}

export async function confirmPasswordRecoveryWithGrantAction(formData: FormData) {
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
    await clearRecoveryCookies();
    redirect(
      authUrl(
        '/login',
        'error',
        'This password reset link is invalid or expired. Request a new one.',
      ),
    );
  }

  const organizationId = await bindRecoveryTenant(supabase);

  if (!organizationId) {
    await supabase.auth.signOut();
    await clearRecoveryCookies();
    redirect(
      authUrl(
        '/login',
        'error',
        'Unable to establish your organization recovery session. Contact your SalsysOS administrator.',
      ),
    );
  }

  try {
    const recoveryToken = await issuePasswordRecoveryGrant(
      verification.user.id,
      organizationId,
    );
    await setRecoveryCookies(organizationId, recoveryToken);
  } catch {
    await supabase.auth.signOut();
    await clearRecoveryCookies();
    redirect(
      authUrl(
        '/login',
        'error',
        'Unable to establish a secure password recovery grant. Request a new reset link.',
      ),
    );
  }

  redirect('/reset-password');
}

export async function updateRecoveredPasswordWithGrantAction(formData: FormData) {
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
    await clearRecoveryCookies();
    redirect(
      authUrl(
        loginPath,
        'error',
        'Your password reset session expired. Request a new reset link.',
      ),
    );
  }

  const organizationId = await bindRecoveryTenant(supabase);

  if (!organizationId) {
    await supabase.auth.signOut();
    await clearRecoveryCookies();
    redirect(
      authUrl(
        loginPath,
        'error',
        'This password reset session is not valid for an active organization.',
      ),
    );
  }

  const cookieStore = await cookies();
  const recoveryToken = cookieStore.get(PASSWORD_RECOVERY_GRANT_COOKIE)?.value;
  const claimed = await claimPasswordRecoveryGrant(
    recoveryToken,
    user.id,
    organizationId,
  );

  if (!claimed) {
    cookieStore.delete(PASSWORD_RECOVERY_GRANT_COOKIE);
    redirect(
      authUrl(
        '/forgot-password',
        'error',
        'Your secure password recovery grant is missing, expired, or already used. Request a new reset link.',
      ),
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    try {
      const replacementToken = await issuePasswordRecoveryGrant(
        user.id,
        organizationId,
      );
      await setRecoveryCookies(organizationId, replacementToken);
    } catch {
      await supabase.auth.signOut();
      await clearRecoveryCookies();
      redirect(
        authUrl(
          loginPath,
          'error',
          'Password recovery could not continue securely. Request a new reset link.',
        ),
      );
    }

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
  await clearRecoveryCookies();

  redirect(
    authUrl(
      loginPath,
      'notice',
      'Password updated. Sign in with your new password.',
    ),
  );
}
