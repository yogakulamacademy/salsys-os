import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createClient,
} from '@/lib/supabase/server';

import {
  createAdminClient,
} from '@/lib/supabase/admin';

import {
  createOAuthState,
  hashOAuthState,
} from '@/lib/integrations/crypto';

import {
  instagramAuthorizationUrl,
  instagramLoginConfiguration,
  instagramRedirectUri,
} from '@/lib/integrations/instagram';


export const dynamic =
  'force-dynamic';


const OAUTH_STATE_TTL_MS =
  10 * 60 * 1000;


function pageUrl(
  request: NextRequest,
  key:
    | 'notice'
    | 'error',
  value: string,
) {
  const url =
    new URL(
      '/settings/integrations',
      request.nextUrl.origin,
    );

  url.searchParams.set(
    key,
    value,
  );

  return url;
}


export async function GET(
  request: NextRequest,
) {
  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error:
      authError,
  } =
    await supabase.auth.getUser();


  if (
    authError ||
    !user
  ) {
    const login =
      new URL(
        '/login',
        request.nextUrl.origin,
      );

    login.searchParams.set(
      'next',
      '/settings/integrations',
    );

    return NextResponse.redirect(
      login,
    );
  }


  const {
    data:
      profile,
    error:
      profileError,
  } =
    await supabase
      .from(
        'profiles',
      )
      .select(
        'id, active',
      )
      .eq(
        'id',
        user.id,
      )
      .maybeSingle();


  if (
    profileError ||
    !profile ||
    profile.active !== true
  ) {
    return NextResponse.redirect(
      new URL(
        '/dashboard',
        request.nextUrl.origin,
      ),
    );
  }


  try {
    const admin =
      createAdminClient();


    /*
     * Resolve the tenant using the same authorization
     * contract as the existing Meta and Google integrations:
     *
     * 1. Explicit organization_id query parameter.
     * 2. Active CRM workspace cookie.
     * 3. Single manageable membership fallback.
     *
     * The requested organization is never trusted by itself.
     * It must match an active owner/admin membership.
     */
    const requestedOrganizationId =
      request.nextUrl.searchParams
        .get(
          'organization_id',
        )
        ?.trim() ||
      null;


    const activeWorkspaceOrganizationId =
      request.cookies
        .get(
          'yk-active-workspace',
        )
        ?.value
        ?.trim() ||
      null;


    const targetOrganizationId =
      requestedOrganizationId ??
      activeWorkspaceOrganizationId;


    let membershipQuery =
      admin
        .from(
          'organization_members',
        )
        .select(
          'organization_id, role',
        )
        .eq(
          'user_id',
          user.id,
        )
        .eq(
          'active',
          true,
        )
        .in(
          'role',
          [
            'owner',
            'admin',
          ],
        );


    if (
      targetOrganizationId
    ) {
      membershipQuery =
        membershipQuery.eq(
          'organization_id',
          targetOrganizationId,
        );
    }


    const {
      data:
        rawMemberships,
      error:
        membershipsError,
    } =
      await membershipQuery;


    if (
      membershipsError
    ) {
      return NextResponse.redirect(
        pageUrl(
          request,
          'error',
          `Unable to resolve workspace access: ${membershipsError.message}`,
        ),
      );
    }


    const memberships =
      (
        rawMemberships ??
        []
      ) as Array<{
        organization_id:
          string;
        role:
          string;
      }>;


    if (
      memberships.length ===
      0
    ) {
      return NextResponse.redirect(
        pageUrl(
          request,
          'error',
          'You do not have permission to manage integrations for this workspace.',
        ),
      );
    }


    if (
      !targetOrganizationId &&
      memberships.length !==
        1
    ) {
      return NextResponse.redirect(
        pageUrl(
          request,
          'error',
          'Select a workspace before connecting Instagram.',
        ),
      );
    }


    const organizationId =
      memberships[0]
        .organization_id;


    const {
      data:
        organization,
      error:
        organizationError,
    } =
      await admin
        .from(
          'organizations',
        )
        .select(
          'id, status',
        )
        .eq(
          'id',
          organizationId,
        )
        .maybeSingle();


    if (
      organizationError ||
      !organization ||
      organization.status !==
        'active'
    ) {
      return NextResponse.redirect(
        pageUrl(
          request,
          'error',
          organizationError
            ?.message ??
            'This workspace is not active.',
        ),
      );
    }


    const {
      appId,
      configId,
    } =
      instagramLoginConfiguration();


    const redirectUri =
      instagramRedirectUri(
        request,
      );


    const state =
      createOAuthState();


    const stateHash =
      hashOAuthState(
        state,
      );


    const expiresAt =
      new Date(
        Date.now() +
          OAUTH_STATE_TTL_MS,
      ).toISOString();


    const popupMode =
      request.nextUrl.searchParams.get(
        'popup',
      ) === '1';


    const returnTo =
      popupMode
        ? '/settings/integrations?oauth_popup=1'
        : '/settings/integrations';


    /*
     * Remove expired Instagram OAuth states belonging
     * to this authenticated user.
     */
    await admin
      .from(
        'integration_oauth_states',
      )
      .delete()
      .eq(
        'created_by',
        user.id,
      )
      .eq(
        'provider',
        'instagram',
      )
      .lt(
        'expires_at',
        new Date().toISOString(),
      );


    const {
      error:
        stateInsertError,
    } =
      await admin
        .from(
          'integration_oauth_states',
        )
        .insert({
          provider:
            'instagram',

          state_hash:
            stateHash,

          created_by:
            user.id,

          organization_id:
            organizationId,

          return_to:
            returnTo,

          expires_at:
            expiresAt,
        });


    if (
      stateInsertError
    ) {
      return NextResponse.redirect(
        pageUrl(
          request,
          'error',
          `Unable to start Instagram authorization: ${stateInsertError.message}`,
        ),
      );
    }


    const authorizationUrl =
      instagramAuthorizationUrl({
        appId,
        configId,
        redirectUri,
        state,
      });


    return NextResponse.redirect(
      authorizationUrl,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to start Instagram authorization.';


    return NextResponse.redirect(
      pageUrl(
        request,
        'error',
        message,
      ),
    );
  }
}
