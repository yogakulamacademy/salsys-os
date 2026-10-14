import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const ORGANIZATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function tenantLoginUrl(request: NextRequest, slug: string, message: string) {
  const url = new URL(`/login/${encodeURIComponent(slug)}`, request.nextUrl.origin);
  url.searchParams.set('error', message);
  return url;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  const organizationSlug =
    request.nextUrl.searchParams.get('organization_slug')?.trim().toLowerCase() ??
    '';
  const flow = request.nextUrl.searchParams.get('flow')?.trim() ?? '';

  if (
    !code ||
    flow !== 'password-recovery' ||
    !ORGANIZATION_SLUG_PATTERN.test(organizationSlug)
  ) {
    return NextResponse.redirect(
      new URL('/login?error=invalid-recovery-link', request.nextUrl.origin),
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      tenantLoginUrl(
        request,
        organizationSlug,
        'This password reset link is invalid or expired. Request a new one.',
      ),
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      tenantLoginUrl(
        request,
        organizationSlug,
        'Unable to verify this password reset session.',
      ),
    );
  }

  const { data: boundOrganizationId, error: tenantBindingError } =
    await supabase.rpc('bind_current_tenant_session_by_slug', {
      p_organization_slug: organizationSlug,
    });

  if (tenantBindingError || !boundOrganizationId) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      tenantLoginUrl(
        request,
        organizationSlug,
        'This password reset link is not valid for this organization.',
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

  return NextResponse.redirect(
    new URL(
      `/reset-password/${encodeURIComponent(organizationSlug)}`,
      request.nextUrl.origin,
    ),
  );
}
