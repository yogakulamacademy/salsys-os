import {
  revalidatePath,
} from 'next/cache';

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
  encryptIntegrationSecret,
  hashOAuthState,
} from '@/lib/integrations/crypto';

import {
  exchangeMetaAuthorizationCode,
  inspectMetaAccessToken,
} from '@/lib/integrations/meta';

import {
  instagramRedirectUri,
} from '@/lib/integrations/instagram';


export const dynamic =
  'force-dynamic';


type OAuthStateRow = {
  id: string;
  created_by: string;
  organization_id: string;
  return_to: string;
  expires_at: string;
  used_at: string | null;
};


type ExistingConnection = {
  id: string;
  account_name: string | null;
};


function safeReturnTo(
  value:
    | string
    | null
    | undefined,
) {
  if (
    value &&
    value.startsWith(
      '/settings/integrations',
    )
  ) {
    return value;
  }

  return '/settings/integrations';
}


function redirectToIntegrations(
  request: NextRequest,
  key:
    | 'notice'
    | 'error',
  value: string,
  returnTo =
    '/settings/integrations',
) {
  const url =
    new URL(
      safeReturnTo(
        returnTo,
      ),
      request.nextUrl.origin,
    );

  url.searchParams.set(
    key,
    value,
  );

  return NextResponse.redirect(
    url,
  );
}


function isPopupReturn(
  returnTo:
    | string
    | null
    | undefined,
) {
  if (!returnTo) {
    return false;
  }

  try {
    const url =
      new URL(
        returnTo,
        'https://crm.local',
      );

    return (
      url.pathname ===
        '/settings/integrations' &&
      url.searchParams.get(
        'oauth_popup',
      ) === '1'
    );
  } catch {
    return false;
  }
}


function popupResponse(
  request: NextRequest,
  payload: {
    ok: boolean;
    message: string;
  },
) {
  const message =
    JSON.stringify({
      type:
        'yogakulam:integration-oauth',

      provider:
        'instagram',

      ok:
        payload.ok,

      message:
        payload.message,
    }).replace(
      /</g,
      '\\u003c',
    );


  const safeMessage =
    payload.message
      .replace(
        /&/g,
        '&amp;',
      )
      .replace(
        /</g,
        '&lt;',
      )
      .replace(
        />/g,
        '&gt;',
      );


  const html =
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Instagram connection</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:32px;text-align:center">
  <h2>${payload.ok ? 'Instagram connected' : 'Connection failed'}</h2>
  <p>${safeMessage}</p>
  <p>This window will close automatically.</p>
  <script>
    (function () {
      var payload = ${message};

      if (
        window.opener &&
        !window.opener.closed
      ) {
        window.opener.postMessage(
          payload,
          ${JSON.stringify(request.nextUrl.origin)}
        );
      }

      window.setTimeout(
        function () {
          window.close();
        },
        500
      );
    })();
  </script>
</body>
</html>`;


  return new NextResponse(
    html,
    {
      status:
        payload.ok
          ? 200
          : 400,

      headers: {
        'Content-Type':
          'text/html; charset=utf-8',

        'Cache-Control':
          'no-store',
      },
    },
  );
}


function finishOAuth(
  request: NextRequest,
  returnTo:
    | string
    | null
    | undefined,
  payload: {
    ok: boolean;
    message: string;
  },
) {
  if (
    isPopupReturn(
      returnTo,
    )
  ) {
    return popupResponse(
      request,
      payload,
    );
  }

  return redirectToIntegrations(
    request,
    payload.ok
      ? 'notice'
      : 'error',
    payload.message,
    returnTo ??
      '/settings/integrations',
  );
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


  const state =
    request.nextUrl.searchParams.get(
      'state',
    );


  if (!state) {
    return redirectToIntegrations(
      request,
      'error',
      'Instagram authorization state is missing.',
    );
  }


  const admin =
    createAdminClient();


  const stateHash =
    hashOAuthState(
      state,
    );


  const {
    data:
      rawStateRow,
    error:
      stateReadError,
  } =
    await admin
      .from(
        'integration_oauth_states',
      )
      .select(
        'id, created_by, organization_id, return_to, expires_at, used_at',
      )
      .eq(
        'provider',
        'instagram',
      )
      .eq(
        'state_hash',
        stateHash,
      )
      .maybeSingle();


  const stateRow =
    rawStateRow as unknown as
      | OAuthStateRow
      | null;


  if (
    stateReadError ||
    !stateRow ||
    !stateRow.organization_id ||
    stateRow.created_by !==
      user.id ||
    stateRow.used_at ||
    new Date(
      stateRow.expires_at,
    ).getTime() <=
      Date.now()
  ) {
    return redirectToIntegrations(
      request,
      'error',
      'Instagram authorization session is invalid or expired. Please connect again.',
    );
  }


  /*
   * Re-check authorization at callback time.
   * Starting OAuth does not grant permanent authority
   * to modify this workspace.
   */
  const {
    data:
      membership,
    error:
      membershipError,
  } =
    await admin
      .from(
        'organization_members',
      )
      .select(
        'id, role, active',
      )
      .eq(
        'organization_id',
        stateRow.organization_id,
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
      )
      .maybeSingle();


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
        stateRow.organization_id,
      )
      .maybeSingle();


  if (
    membershipError ||
    !membership ||
    organizationError ||
    !organization ||
    organization.status !==
      'active'
  ) {
    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok:
          false,

        message:
          'You no longer have permission to manage integrations for this workspace.',
      },
    );
  }


  /*
   * Consume the OAuth state atomically before talking
   * to Meta. This prevents replay of the callback.
   */
  const {
    data:
      consumeRows,
    error:
      consumeError,
  } =
    await admin
      .from(
        'integration_oauth_states',
      )
      .update({
        used_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        stateRow.id,
      )
      .is(
        'used_at',
        null,
      )
      .select(
        'id',
      );


  if (
    consumeError ||
    !consumeRows ||
    consumeRows.length !==
      1
  ) {
    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok:
          false,

        message:
          'Instagram authorization session has already been used. Please connect again.',
      },
    );
  }


  const providerError =
    request.nextUrl.searchParams.get(
      'error',
    );


  if (providerError) {
    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        organization_id:
          stateRow.organization_id,

        provider:
          'instagram',

        event_type:
          'authorization_denied',

        actor_user_id:
          user.id,

        detail: {
          provider_error:
            providerError.slice(
              0,
              120,
            ),
        },
      });


    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok:
          false,

        message:
          'Instagram authorization was cancelled or denied.',
      },
    );
  }


  const code =
    request.nextUrl.searchParams.get(
      'code',
    );


  if (!code) {
    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok:
          false,

        message:
          'Instagram did not return an authorization code.',
      },
    );
  }


  try {
    const redirectUri =
      instagramRedirectUri(
        request,
      );


    /*
     * Instagram Facebook Login for Business uses the
     * same Meta authorization-code token endpoint.
     */
    const token =
      await exchangeMetaAuthorizationCode({
        code,
        redirectUri,
      });


    /*
     * Validate the credential before storing it:
     * - valid token
     * - belongs to this Meta application
     * - SYSTEM_USER credential
     * - stable Meta system-user subject
     */
    const inspection =
      await inspectMetaAccessToken(
        token.accessToken,
      );


    const {
      data:
        rawExisting,
      error:
        existingError,
    } =
      await admin
        .from(
          'integration_connections',
        )
        .select(
          'id, account_name',
        )
        .eq(
          'organization_id',
          stateRow.organization_id,
        )
        .eq(
          'provider',
          'instagram',
        )
        .eq(
          'external_account_id',
          inspection.userId,
        )
        .maybeSingle();


    if (existingError) {
      throw new Error(
        'Unable to resolve the existing Instagram connection.',
      );
    }


    const existing =
      rawExisting as unknown as
        | ExistingConnection
        | null;


    const tokenExpiresAt =
      inspection.expiresAt &&
      inspection.expiresAt > 0
        ? new Date(
            inspection.expiresAt *
              1000,
          ).toISOString()
        : null;


    const now =
      new Date().toISOString();


    const payload = {
      organization_id:
        stateRow.organization_id,

      provider:
        'instagram',

      auth_mode:
        'system_user',

      status:
        'connected',

      parent_connection_id:
        null,

      /*
       * This identifies the authenticated Meta
       * system-user credential. The selected Instagram
       * professional account will be stored separately
       * during Instagram asset discovery.
       */
      external_account_id:
        inspection.userId,

      account_name:
        existing
          ?.account_name
          ?.trim() ||
        'Instagram Business Integration',

      account_email:
        null,

      scopes:
        inspection.scopes,

      access_token_ciphertext:
        encryptIntegrationSecret(
          token.accessToken,
        ),

      refresh_token_ciphertext:
        null,

      token_expires_at:
        tokenExpiresAt,

      token_type:
        token.tokenType,

      provider_metadata: {
        credential_source:
          'encrypted_connection',

        login_product:
          'facebook_login_for_business',

        token_subject_type:
          inspection.type,

        application:
          inspection.application,

        issued_at:
          inspection.issuedAt,

        data_access_expires_at:
          inspection.dataAccessExpiresAt,

        granular_scopes:
          inspection.granularScopes,
      },

      connected_by:
        user.id,

      connected_at:
        now,

      last_verified_at:
        now,

      last_error:
        null,
    };


    let connectionId:
      | string
      | null =
      existing?.id ??
      null;


    if (existing) {
      /*
       * Compare-and-swap style reconnect protection:
       * the connection must still belong to this tenant,
       * provider and inspected system-user subject.
       */
      const {
        data:
          updatedRows,
        error:
          updateError,
      } =
        await admin
          .from(
            'integration_connections',
          )
          .update(
            payload,
          )
          .eq(
            'id',
            existing.id,
          )
          .eq(
            'organization_id',
            stateRow.organization_id,
          )
          .eq(
            'provider',
            'instagram',
          )
          .eq(
            'external_account_id',
            inspection.userId,
          )
          .select(
            'id',
          );


      if (updateError) {
        throw new Error(
          'Instagram connection could not be updated.',
        );
      }


      const updatedConnections =
        (
          updatedRows ??
          []
        ) as unknown as Array<{
          id: string;
        }>;


      if (
        updatedConnections.length !==
        1
      ) {
        throw new Error(
          'Instagram connection changed during authorization. Please reconnect.',
        );
      }
    } else {
      const {
        data:
          insertedRows,
        error:
          insertError,
      } =
        await admin
          .from(
            'integration_connections',
          )
          .insert(
            payload,
          )
          .select(
            'id',
          );


      if (insertError) {
        throw new Error(
          'Instagram connection could not be saved.',
        );
      }


      const inserted =
        (
          insertedRows ??
          []
        ) as unknown as Array<{
          id: string;
        }>;


      connectionId =
        inserted[0]
          ?.id ??
        null;
    }


    if (!connectionId) {
      throw new Error(
        'Instagram connection could not be saved.',
      );
    }


    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        organization_id:
          stateRow.organization_id,

        connection_id:
          connectionId,

        provider:
          'instagram',

        event_type:
          existing
            ? 'reconnected'
            : 'connected',

        actor_user_id:
          user.id,

        detail: {
          auth_mode:
            'system_user',

          granted_scopes:
            inspection.scopes,

          token_subject_type:
            inspection.type,

          token_expires:
            Boolean(
              tokenExpiresAt,
            ),
        },
      });


    revalidatePath(
      '/settings/integrations',
    );


    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok:
          true,

        message:
          'Instagram account connected successfully.',
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Instagram authorization failed.';


    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        organization_id:
          stateRow.organization_id,

        provider:
          'instagram',

        event_type:
          'authorization_error',

        actor_user_id:
          user.id,

        detail: {
          message:
            message.slice(
              0,
              500,
            ),
        },
      });


    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok:
          false,

        message,
      },
    );
  }
}
