import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createOAuthState, hashOAuthState } from '@/lib/integrations/crypto';
import {
  instagramAuthorizationUrl,
  instagramLoginConfiguration,
  instagramRedirectUri,
} from '@/lib/integrations/instagram';
import {
  IntegrationTenantError,
  requireIntegrationAdminTenant,
} from '@/lib/integrations/tenant-context';

export const dynamic = 'force-dynamic';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function pageUrl(
  request: NextRequest,
  key: 'notice' | 'error',
  value: string,
) {
  const url = new URL('/settings/integrations', request.nextUrl.origin);
  url.searchParams.set(key, value);
  return url;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const login = new URL('/login', request.nextUrl.origin);
    login.searchParams.set('next', '/settings/integrations');
    return NextResponse.redirect(login);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    return NextResponse.redirect(
      new URL('/dashboard', request.nextUrl.origin),
    );
  }

  try {
    /*
     * Critical tenant boundary: the organization is resolved only from the
     * authenticated session/workspace context. Browser-supplied
     * organization_id values are intentionally ignored.
     */
    const { admin, organizationId } =
      await requireIntegrationAdminTenant(supabase, user.id);

    const { appId } = instagramLoginConfiguration();
    const redirectUri = instagramRedirectUri(request);
    const state = createOAuthState();
    const stateHash = hashOAuthState(state);
    const expiresAt = new Date(
      Date.now() + OAUTH_STATE_TTL_MS,
    ).toISOString();

    const popupMode = request.nextUrl.searchParams.get('popup') === '1';
    const returnTo = popupMode
      ? '/settings/integrations?oauth_popup=1'
      : '/settings/integrations';

    await admin
      .from('integration_oauth_states')
      .delete()
      .eq('created_by', user.id)
      .eq('provider', 'instagram')
      .lt('expires_at', new Date().toISOString());

    const { error: stateInsertError } = await admin
      .from('integration_oauth_states')
      .insert({
        provider: 'instagram',
        state_hash: stateHash,
        created_by: user.id,
        organization_id: organizationId,
        return_to: returnTo,
        expires_at: expiresAt,
      });

    if (stateInsertError) {
      return NextResponse.redirect(
        pageUrl(
          request,
          'error',
          `Unable to start Instagram authorization: ${stateInsertError.message}`,
        ),
      );
    }

    const authorizationUrl = instagramAuthorizationUrl({
      appId,
      redirectUri,
      state,
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const message =
      error instanceof IntegrationTenantError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unable to start Instagram authorization.';

    return NextResponse.redirect(pageUrl(request, 'error', message));
  }
}
