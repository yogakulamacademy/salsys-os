import 'server-only';

import type {
  NextRequest,
} from 'next/server';

export const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';

export const GOOGLE_TOKEN_ENDPOINT =
  'https://oauth2.googleapis.com/token';

export const GOOGLE_USERINFO_ENDPOINT =
  'https://openidconnect.googleapis.com/v1/userinfo';

export const GOOGLE_REVOKE_ENDPOINT =
  'https://oauth2.googleapis.com/revoke';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/datamanager',
] as const;

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
};

function requiredEnv(
  name: string,
) {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured.`,
    );
  }

  return value;
}

export function googleOAuthClient() {
  return {
    clientId:
      requiredEnv(
        'GOOGLE_OAUTH_CLIENT_ID',
      ),
    clientSecret:
      requiredEnv(
        'GOOGLE_OAUTH_CLIENT_SECRET',
      ),
  };
}

export function googleRedirectUri(
  request:
    Pick<
      NextRequest,
      'nextUrl'
    >,
) {
  return new URL(
    '/api/integrations/google/callback',
    request.nextUrl.origin,
  ).toString();
}

export function googleAuthorizationUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url =
    new URL(
      GOOGLE_AUTHORIZATION_ENDPOINT,
    );

  url.searchParams.set(
    'client_id',
    clientId,
  );

  url.searchParams.set(
    'redirect_uri',
    redirectUri,
  );

  url.searchParams.set(
    'response_type',
    'code',
  );

  url.searchParams.set(
    'scope',
    GOOGLE_SCOPES.join(' '),
  );

  url.searchParams.set(
    'access_type',
    'offline',
  );

  url.searchParams.set(
    'include_granted_scopes',
    'true',
  );

  // We need a refresh token for background CRM syncs.
  // select_account keeps account switching explicit for Admin.
  url.searchParams.set(
    'prompt',
    'consent select_account',
  );

  url.searchParams.set(
    'state',
    state,
  );

  return url;
}

export async function exchangeGoogleAuthorizationCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  const {
    clientId,
    clientSecret,
  } =
    googleOAuthClient();

  const body =
    new URLSearchParams({
      client_id:
        clientId,
      client_secret:
        clientSecret,
      code,
      grant_type:
        'authorization_code',
      redirect_uri:
        redirectUri,
    });

  const response =
    await fetch(
      GOOGLE_TOKEN_ENDPOINT,
      {
        method:
          'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body:
          body.toString(),
        cache:
          'no-store',
      },
    );

  const payload =
    (
      await response.json()
    ) as GoogleTokenResponse;

  if (
    !response.ok ||
    !payload.access_token
  ) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        'Google token exchange failed.',
    );
  }

  return payload;
}

export async function getGoogleUserInfo(
  accessToken: string,
) {
  const response =
    await fetch(
      GOOGLE_USERINFO_ENDPOINT,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
        cache:
          'no-store',
      },
    );

  if (!response.ok) {
    throw new Error(
      'Unable to read the authorized Google account.',
    );
  }

  const payload =
    (
      await response.json()
    ) as GoogleUserInfo;

  if (!payload.sub) {
    throw new Error(
      'Google account identifier is missing.',
    );
  }

  return payload;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
) {
  const {
    clientId,
    clientSecret,
  } =
    googleOAuthClient();

  const body =
    new URLSearchParams({
      client_id:
        clientId,
      client_secret:
        clientSecret,
      refresh_token:
        refreshToken,
      grant_type:
        'refresh_token',
    });

  const response =
    await fetch(
      GOOGLE_TOKEN_ENDPOINT,
      {
        method:
          'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body:
          body.toString(),
        cache:
          'no-store',
      },
    );

  const payload =
    (
      await response.json()
    ) as GoogleTokenResponse;

  if (
    !response.ok ||
    !payload.access_token
  ) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        'Google access-token refresh failed.',
    );
  }

  return payload;
}

export async function revokeGoogleToken(
  token: string,
) {
  const body =
    new URLSearchParams({
      token,
    });

  const response =
    await fetch(
      GOOGLE_REVOKE_ENDPOINT,
      {
        method:
          'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body:
          body.toString(),
        cache:
          'no-store',
      },
    );

  return response.ok;
}
