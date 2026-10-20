import type {
  NextRequest,
} from 'next/server';


const INSTAGRAM_OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
];


export function instagramOAuthScopes() {
  return [
    ...INSTAGRAM_OAUTH_SCOPES,
  ];
}


function requiredEnv(
  key: string,
) {
  const value =
    process.env[key]?.trim();

  if (!value) {
    throw new Error(
      `${key} is not configured.`,
    );
  }

  return value;
}


export function instagramLoginConfiguration() {
  return {
    appId:
      requiredEnv(
        'INSTAGRAM_APP_ID',
      ),
  };
}


export function instagramOAuthClient() {
  return {
    appId:
      requiredEnv(
        'INSTAGRAM_APP_ID',
      ),

    appSecret:
      requiredEnv(
        'INSTAGRAM_APP_SECRET',
      ),
  };
}


export function instagramRedirectUri(
  request: NextRequest,
) {
  return new URL(
    '/api/integrations/instagram/callback',
    request.nextUrl.origin,
  ).toString();
}


export function instagramAuthorizationUrl({
  appId,
  redirectUri,
  state,
}: {
  appId: string;
  redirectUri: string;
  state: string;
}) {
  const url =
    new URL(
      'https://www.instagram.com/oauth/authorize',
    );

  url.searchParams.set(
    'force_reauth',
    'true',
  );

  url.searchParams.set(
    'client_id',
    appId,
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
    INSTAGRAM_OAUTH_SCOPES.join(','),
  );

  /*
   * Preserve SalsysOS's one-time OAuth state protection
   * even though Meta's generated Embed URL does not
   * display a state value.
   */
  url.searchParams.set(
    'state',
    state,
  );

  return url;
}


export async function exchangeInstagramAuthorizationCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  const {
    appId,
    appSecret,
  } =
    instagramOAuthClient();


  const body =
    new FormData();

  body.set(
    'client_id',
    appId,
  );

  body.set(
    'client_secret',
    appSecret,
  );

  body.set(
    'grant_type',
    'authorization_code',
  );

  body.set(
    'redirect_uri',
    redirectUri,
  );

  body.set(
    'code',
    code,
  );


  const response =
    await fetch(
      'https://api.instagram.com/oauth/access_token',
      {
        method:
          'POST',

        body,

        cache:
          'no-store',
      },
    );


  let payload:
    | Record<string, unknown>
    | null =
    null;

  try {
    payload =
      (
        await response.json()
      ) as Record<
        string,
        unknown
      >;
  } catch {
    payload =
      null;
  }


  const rawAccessToken =
    payload?.access_token;

  const accessToken =
    typeof rawAccessToken ===
      'string'
      ? rawAccessToken.trim()
      : '';


  const rawUserId =
    payload?.user_id;

  const userId =
    typeof rawUserId ===
      'string' ||
    typeof rawUserId ===
      'number'
      ? String(
          rawUserId,
        ).trim()
      : '';


  if (
    !response.ok ||
    !accessToken ||
    !userId
  ) {
    throw new Error(
      `Instagram token exchange failed (HTTP ${response.status}).`,
    );
  }


  return {
    accessToken,
    userId,
  };
}


export async function exchangeInstagramLongLivedToken(
  shortLivedAccessToken: string,
) {
  const {
    appSecret,
  } =
    instagramOAuthClient();


  const url =
    new URL(
      'https://graph.instagram.com/access_token',
    );

  url.searchParams.set(
    'grant_type',
    'ig_exchange_token',
  );

  url.searchParams.set(
    'client_secret',
    appSecret,
  );

  url.searchParams.set(
    'access_token',
    shortLivedAccessToken,
  );


  const response =
    await fetch(
      url,
      {
        method:
          'GET',

        cache:
          'no-store',
      },
    );


  let payload:
    | Record<string, unknown>
    | null =
    null;

  try {
    payload =
      (
        await response.json()
      ) as Record<
        string,
        unknown
      >;
  } catch {
    payload =
      null;
  }


  const rawAccessToken =
    payload?.access_token;

  const accessToken =
    typeof rawAccessToken ===
      'string'
      ? rawAccessToken.trim()
      : '';


  const rawTokenType =
    payload?.token_type;

  const tokenType =
    typeof rawTokenType ===
      'string'
      ? rawTokenType.trim()
      : 'Bearer';


  const rawExpiresIn =
    payload?.expires_in;

  const expiresIn =
    typeof rawExpiresIn ===
      'number' &&
    Number.isFinite(
      rawExpiresIn,
    )
      ? rawExpiresIn
      : null;


  if (
    !response.ok ||
    !accessToken
  ) {
    throw new Error(
      `Instagram long-lived token exchange failed (HTTP ${response.status}).`,
    );
  }


  return {
    accessToken,
    tokenType,
    expiresIn,
  };
}


export async function getInstagramAccountProfile(
  accessToken: string,
) {
  const url =
    new URL(
      'https://graph.instagram.com/v26.0/me',
    );

  url.searchParams.set(
    'fields',
    'user_id,username,account_type',
  );

  url.searchParams.set(
    'access_token',
    accessToken,
  );


  const response =
    await fetch(
      url,
      {
        method:
          'GET',

        cache:
          'no-store',
      },
    );


  let payload:
    | Record<string, unknown>
    | null =
    null;

  try {
    payload =
      (
        await response.json()
      ) as Record<
        string,
        unknown
      >;
  } catch {
    payload =
      null;
  }


  const rawUserId =
    payload?.user_id;

  const userId =
    typeof rawUserId ===
      'string' ||
    typeof rawUserId ===
      'number'
      ? String(
          rawUserId,
        ).trim()
      : '';


  const rawUsername =
    payload?.username;

  const username =
    typeof rawUsername ===
      'string'
      ? rawUsername.trim()
      : '';


  const rawAccountType =
    payload?.account_type;

  const accountType =
    typeof rawAccountType ===
      'string'
      ? rawAccountType.trim()
      : null;


  if (
    !response.ok ||
    !userId ||
    !username
  ) {
    throw new Error(
      `Instagram account lookup failed (HTTP ${response.status}).`,
    );
  }


  return {
    userId,
    username,
    accountType,
  };
}
