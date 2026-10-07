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
  metaRedirectUri,
} from '@/lib/integrations/meta';


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


type LegacyConnectionCandidate = {
  id: string;
  account_name: string | null;
  auth_mode: string;
  status: string;
  external_account_id: string | null;
  provider_metadata: Record<string, unknown> | null;
};


function isAdoptableLegacyMetaConnection(
  connection: LegacyConnectionCandidate,
) {
  const metadata =
    connection.provider_metadata;

  return (
    connection.auth_mode ===
      'system_user' &&
    connection.status ===
      'disconnected' &&
    connection.external_account_id ===
      null &&
    metadata !== null &&
    typeof metadata ===
      'object' &&
    metadata[
      'credential_source'
    ] ===
      'vercel_env' &&
    metadata[
      'token_env'
    ] ===
      'META_ACCESS_TOKEN'
  );
}


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
        'meta',

      ok:
        payload.ok,

      message:
        payload.message,
    });


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
  <title>Meta connection</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:32px;text-align:center">
  <h2>${payload.ok ? 'Meta connected' : 'Connection failed'}</h2>
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
      'Meta authorization state is missing.',
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
        'meta',
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
      'Meta authorization session is invalid or expired. Please connect again.',
    );
  }


  /*
   * Authorization is checked again at callback time.
   * Starting OAuth does not grant permanent authority to
   * mutate the organization.
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
   * Atomically consume the one-time state before performing
   * the provider exchange.
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
          'Meta authorization session has already been used. Please connect again.',
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
          'meta',

        event_type:
          'authorization_denied',

        actor_user_id:
          user.id,

        detail: {
          provider_error:
            providerError
              .slice(
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
          'Meta authorization was cancelled or denied.',
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
          'Meta did not return an authorization code.',
      },
    );
  }


  try {
    const redirectUri =
      metaRedirectUri(
        request,
      );


    const token =
      await exchangeMetaAuthorizationCode({
        code,
        redirectUri,
      });


    /*
     * Validate the token before it is encrypted or associated
     * with any CRM organization.
     *
     * This verifies:
     * - token is valid,
     * - token belongs to this SalsysOS Meta app,
     * - Login for Business returned the configured SYSTEM_USER
     *   token type,
     * - a stable Meta system-user subject exists.
     */
    const inspection =
      await inspectMetaAccessToken(
        token.accessToken,
      );


    /*
     * Prefer an exact tenant + provider + Meta subject match.
     *
     * Reauthorization of an already migrated connection must
     * always resolve the same connection row.
     */
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
          'meta',
        )
        .eq(
          'external_account_id',
          inspection.userId,
        )
        .maybeSingle();


    if (existingError) {
      throw new Error(
        'Unable to resolve the existing Meta connection.',
      );
    }


    const exactExisting =
      rawExisting as unknown as
        | ExistingConnection
        | null;


    let existing =
      exactExisting;

    let legacyConnectionAdopted =
      false;


    /*
     * Migration compatibility:
     *
     * Older SalsysOS Meta integrations used one tenant-scoped
     * connection row whose credential came from META_ACCESS_TOKEN.
     *
     * The first successful tenant authorization may adopt that
     * row only when it is unambiguously identifiable as the
     * disconnected legacy environment-backed connection.
     *
     * We never choose arbitrarily between multiple candidates.
     */
    if (!existing) {
      const {
        data:
          rawLegacyCandidates,
        error:
          legacyCandidatesError,
      } =
        await admin
          .from(
            'integration_connections',
          )
          .select(
            [
              'id',
              'account_name',
              'auth_mode',
              'status',
              'external_account_id',
              'provider_metadata',
            ].join(','),
          )
          .eq(
            'organization_id',
            stateRow.organization_id,
          )
          .eq(
            'provider',
            'meta',
          )
          .is(
            'external_account_id',
            null,
          );


      if (legacyCandidatesError) {
        throw new Error(
          'Unable to resolve the legacy Meta connection.',
        );
      }


      const legacyCandidates =
        (
          rawLegacyCandidates ??
          []
        ) as unknown as
          LegacyConnectionCandidate[];


      const adoptableLegacyConnections =
        legacyCandidates.filter(
          isAdoptableLegacyMetaConnection,
        );


      if (
        adoptableLegacyConnections.length >
        1
      ) {
        throw new Error(
          'Multiple legacy Meta connections require manual resolution before authorization.',
        );
      }


      const legacyExisting =
        adoptableLegacyConnections[0] ??
        null;


      if (legacyExisting) {
        existing = {
          id:
            legacyExisting.id,

          account_name:
            legacyExisting.account_name,
        };

        legacyConnectionAdopted =
          true;
      }
    }


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
        'meta',

      auth_mode:
        'system_user',

      status:
        'connected',

      parent_connection_id:
        null,

      external_account_id:
        inspection.userId,

      account_name:
        existing
          ?.account_name
          ?.trim() ||
        'Meta Business Integration',

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
       * Treat connection resolution and persistence as a
       * compare-and-swap operation.
       *
       * The row must still match the identity/legacy state that
       * was inspected above when the UPDATE executes.
       */
      let updateQuery =
        admin
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
            'meta',
          );


      if (legacyConnectionAdopted) {
        updateQuery =
          updateQuery
            .eq(
              'auth_mode',
              'system_user',
            )
            .eq(
              'status',
              'disconnected',
            )
            .is(
              'external_account_id',
              null,
            )
            .contains(
              'provider_metadata',
              {
                credential_source:
                  'vercel_env',

                token_env:
                  'META_ACCESS_TOKEN',
              },
            );
      } else {
        /*
         * Normal reconnects must still belong to the inspected
         * Meta system-user subject at update time.
         */
        updateQuery =
          updateQuery.eq(
            'external_account_id',
            inspection.userId,
          );
      }


      const {
        data:
          updatedRows,
        error:
          updateError,
      } =
        await updateQuery
          .select(
            'id',
          );


      if (updateError) {
        throw new Error(
          'Meta connection could not be updated.',
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
          'Meta connection changed during authorization. Please reconnect.',
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
          'Meta connection could not be saved.',
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
        'Meta connection could not be saved.',
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
          'meta',

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

          legacy_connection_adopted:
            legacyConnectionAdopted,
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
          'Meta account connected successfully.',
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Meta authorization failed.';


    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        organization_id:
          stateRow.organization_id,

        provider:
          'meta',

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