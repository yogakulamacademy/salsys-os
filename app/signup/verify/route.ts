import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
    return go('/signup?error=Invalid+or+expired+verification+link.');
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return go('/signup?error=Invalid+or+expired+verification+link.');
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || !user.email_confirmed_at || user.is_anonymous) {
    await supabase.auth.signOut({ scope: 'local' });
    return go('/signup?error=Email+verification+could+not+be+confirmed.');
  }
  // Provisioning is not implemented yet. Do not grant workspace access or
  // treat client-editable metadata as proof of registration authorization.
  await supabase.auth.signOut({ scope: 'local' });
  return go('/signup?notice=Email+verified.+Workspace+setup+is+not+available+yet.');
}
