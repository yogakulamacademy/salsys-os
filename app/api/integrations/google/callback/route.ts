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
  exchangeGoogleAuthorizationCode,
  getGoogleUserInfo,
  googleRedirectUri,
  GOOGLE_SCOPES,
} from '@/lib/integrations/google';

export const dynamic =
  'force-dynamic';

type OAuthStateRow = {
  id: string;
  created_by: string;
  return_to: string;
  expires_at: string;
  used_at: string | null;
};

type ExistingConnection = {
  id: string;
  refresh_token_ciphertext:
    | string
    | null;
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
        'google',
      ok:
        payload.ok,
      message:
        payload.message,
    });

  const html =
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Google connection</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f7fa;
      color: #1f2937;
    }
    .card {
      width: min(420px, calc(100vw - 32px));
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      background: #fff;
      padding: 24px;
      box-shadow: 0 18px 48px rgba(15, 23, 42, .12);
      text-align: center;
    }
    .mark {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      margin: 0 auto 14px;
      border-radius: 12px;
      background: #f1edff;
      color: #6d4cff;
      font-weight: 800;
    }
    h1 {
      margin: 0;
      font-size: 18px;
    }
    p {
      margin: 9px 0 0;
      color: #6b7280;
      font-size: 13px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark">G</div>
    <h1>${payload.ok ? 'Google connected' : 'Connection failed'}</h1>
    <p>${payload.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    <p>This window will close automatically.</p>
  </div>
  <script>
    (function () {
      var payload = ${message};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, ${JSON.stringify(request.nextUrl.origin)});
      }
      window.setTimeout(function () {
        window.close();
      }, 500);
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
    error: authError,
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
    data: profile,
    error: profileError,
  } =
    await supabase
      .from('profiles')
      .select(
        'id, role, active',
      )
      .eq(
        'id',
        user.id,
      )
      .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.active !== true ||
    profile.role !== 'admin'
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
      'Google authorization state is missing.',
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
        'id, created_by, return_to, expires_at, used_at',
      )
      .eq(
        'provider',
        'google',
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
      'Google authorization session is invalid or expired. Please connect again.',
    );
  }

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
      .select('id');

  if (
    consumeError ||
    !consumeRows ||
    consumeRows.length !== 1
  ) {
    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok: false,
        message:
          'Google authorization session has already been used. Please connect again.',
      },
    );
  }

  const providerError =
    request.nextUrl.searchParams.get(
      'error',
    );

  if (
    providerError
  ) {
    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        provider:
          'google',
        event_type:
          'authorization_denied',
        actor_user_id:
          user.id,
        detail: {
          provider_error:
            providerError,
        },
      });

    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok: false,
        message:
          'Google authorization was cancelled or denied.',
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
        ok: false,
        message:
          'Google did not return an authorization code.',
      },
    );
  }

  try {
    const redirectUri =
      googleRedirectUri(
        request,
      );

    const tokens =
      await exchangeGoogleAuthorizationCode({
        code,
        redirectUri,
      });

    const userInfo =
      await getGoogleUserInfo(
        tokens.access_token!,
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
          'id, refresh_token_ciphertext',
        )
        .eq(
          'provider',
          'google',
        )
        .eq(
          'external_account_id',
          userInfo.sub,
        )
        .maybeSingle();

    if (existingError) {
      throw new Error(
        existingError.message,
      );
    }

    const existing =
      rawExisting as unknown as
        | ExistingConnection
        | null;

    const refreshTokenCiphertext =
      tokens.refresh_token
        ? encryptIntegrationSecret(
            tokens.refresh_token,
          )
        : existing
            ?.refresh_token_ciphertext ??
          null;

    if (
      !refreshTokenCiphertext
    ) {
      throw new Error(
        'Google did not return an offline refresh token. Reconnect after removing the existing Yogakulam CRM grant from your Google Account.',
      );
    }

    const expiresInSeconds =
      Number(
        tokens.expires_in ??
          3600,
      );

    const tokenExpiresAt =
      new Date(
        Date.now() +
          Math.max(
            60,
            expiresInSeconds,
          ) *
            1000,
      ).toISOString();

    const scopes =
      (
        tokens.scope ||
        GOOGLE_SCOPES.join(
          ' ',
        )
      )
        .split(/\s+/)
        .filter(Boolean);

    const now =
      new Date().toISOString();

    const payload = {
      provider:
        'google',
      auth_mode:
        'oauth_user',
      status:
        'connected',
      parent_connection_id:
        null,
      external_account_id:
        userInfo.sub,
      account_name:
        userInfo.name ||
        userInfo.email ||
        'Google Account',
      account_email:
        userInfo.email ??
        null,
      scopes,
      access_token_ciphertext:
        encryptIntegrationSecret(
          tokens.access_token!,
        ),
      refresh_token_ciphertext:
        refreshTokenCiphertext,
      token_expires_at:
        tokenExpiresAt,
      token_type:
        tokens.token_type ||
        'Bearer',
      provider_metadata: {
        email_verified:
          userInfo.email_verified ??
          null,
        locale:
          userInfo.locale ??
          null,
        picture:
          userInfo.picture ??
          null,
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
      const {
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
          );

      if (updateError) {
        throw new Error(
          updateError.message,
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
          .select('id');

      if (insertError) {
        throw new Error(
          insertError.message,
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
        inserted[0]?.id ??
        null;
    }

    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        connection_id:
          connectionId,
        provider:
          'google',
        event_type:
          existing
            ? 'reconnected'
            : 'connected',
        actor_user_id:
          user.id,
        detail: {
          account_email:
            userInfo.email ??
            null,
          granted_scopes:
            scopes,
        },
      });

    revalidatePath(
      '/settings/integrations',
    );

    return finishOAuth(
      request,
      stateRow.return_to,
      {
        ok: true,
        message:
          'Google account connected successfully.',
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Google authorization failed.';

    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        provider:
          'google',
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
        ok: false,
        message,
      },
    );
  }
}
