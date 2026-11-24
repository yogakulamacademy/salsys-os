import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { provisionVerifiedSignup } from '@/lib/signup/provision';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';
import { useMockData } from '@/lib/config';

export const dynamic = 'force-dynamic';

function go(path: string) {
  const response = NextResponse.redirect(new URL(path, 'https://salsysos.com'));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: NextRequest) {
  if (useMockData || process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true') {
    return go('/signup?error=Registration+is+not+open.');
  }
  const code = request.nextUrl.searchParams.get('code')?.trim();
  if (!code || code.length > 2048) {
    return go('/signup?mode=resend&error=Invalid+or+expired+verification+link.+If+already+verified,+sign+in.');
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return go('/signup?mode=resend&error=Invalid+or+expired+verification+link.+If+already+verified,+sign+in.');
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || !user.email_confirmed_at || user.is_anonymous) {
    await supabase.auth.signOut({ scope: 'local' });
    return go('/signup?error=Email+verification+could+not+be+confirmed.');
  }
  const provisioned = await provisionVerifiedSignup().catch(() => ({ ok: false as const }));
  if (!provisioned.ok) {
    await supabase.auth.signOut({ scope: 'local' });
    return go('/signup?error=Workspace+setup+could+not+be+completed.+Sign+in+to+retry+or+contact+support.');
  }
  const { error: bindingError } = await supabase.rpc('bind_current_tenant_session', {
    p_organization_id: provisioned.organizationId,
  });
  if (bindingError) {
    await supabase.auth.signOut({ scope: 'local' });
    return go('/login?error=Workspace+setup+requires+another+sign-in.');
  }
  // Refresh after provisioning so trusted app_metadata is present in the JWT.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    await supabase.auth.signOut({ scope: 'local' });
    return go('/login?error=Please+sign+in+to+continue+workspace+setup.');
  }
  const response = go('/signup/onboarding');
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, provisioned.organizationId, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
