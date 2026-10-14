'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';
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
  const organizationSlug = String(formData.get('organization_slug') ?? '')
    .trim()
    .toLowerCase();
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

  const {
    data: boundOrganizationId,
    error: tenantBindingError,
  } = await supabase.rpc('bind_current_tenant_session_by_slug', {
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

export async function signOutAction() {
  if (!useMockData) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);

  redirect('/login');
}
