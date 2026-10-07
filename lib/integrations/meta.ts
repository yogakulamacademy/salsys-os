import 'server-only';

import type {
  NextRequest,
} from 'next/server';


const DEFAULT_META_GRAPH_VERSION =
  'v26.0';


type MetaTokenEnvelope = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  data?: {
    access_token?: unknown;
    token_type?: unknown;
    expires_in?: unknown;
  };
};


type MetaDebugEnvelope = {
  data?: {
    app_id?: unknown;
    type?: unknown;
    application?: unknown;
    data_access_expires_at?: unknown;
    expires_at?: unknown;
    is_valid?: unknown;
    issued_at?: unknown;
    scopes?: unknown;
    granular_scopes?: unknown;
    user_id?: unknown;
  };
};


export type MetaAccessTokenInspection = {
  appId: string;
  type: string;
  application: string | null;
  dataAccessExpiresAt: number | null;
  expiresAt: number | null;
  issuedAt: number | null;
  scopes: string[];
  granularScopes: Array<{
    scope: string;
    targetIds: string[];
  }>;
  userId: string;
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


function nonEmptyString(
  value: unknown,
) {
  return typeof value === 'string' &&
    value.trim()
    ? value.trim()
    : null;
}


function finiteNumber(
  value: unknown,
) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' &&
          value.trim()
        ? Number(value)
        : NaN;

  return Number.isFinite(numeric)
    ? numeric
    : null;
}


function stringArray(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(nonEmptyString)
    .filter(
      (
        item,
      ): item is string =>
        Boolean(item),
    );
}


function granularScopes(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 100)
    .flatMap(
      (item) => {
        if (
          !item ||
          typeof item !== 'object'
        ) {
          return [];
        }

        const record =
          item as Record<
            string,
            unknown
          >;

        const scope =
          nonEmptyString(
            record.scope,
          );

        if (!scope) {
          return [];
        }

        return [
          {
            scope,
            targetIds:
              stringArray(
                record.target_ids,
              ).slice(
                0,
                100,
              ),
          },
        ];
      },
    );
}


export function metaGraphVersion() {
  const configured =
    process.env
      .META_API_VERSION
      ?.trim();

  if (!configured) {
    return DEFAULT_META_GRAPH_VERSION;
  }

  if (
    !/^v\d+\.\d+$/.test(
      configured,
    )
  ) {
    throw new Error(
      'META_API_VERSION is invalid.',
    );
  }

  return configured;
}


export function metaLoginConfiguration() {
  return {
    appId:
      requiredEnv(
        'META_APP_ID',
      ),

    configId:
      requiredEnv(
        'META_LOGIN_CONFIG_ID',
      ),
  };
}


export function metaOAuthClient() {
  return {
    ...metaLoginConfiguration(),

    appSecret:
      requiredEnv(
        'META_APP_SECRET',
      ),
  };
}


export function metaRedirectUri(
  request: NextRequest,
) {
  return new URL(
    '/api/integrations/meta/callback',
    request.nextUrl.origin,
  ).toString();
}


export function metaAuthorizationUrl({
  appId,
  configId,
  redirectUri,
  state,
}: {
  appId: string;
  configId: string;
  redirectUri: string;
  state: string;
}) {
  const version =
    metaGraphVersion();

  const url =
    new URL(
      `https://www.facebook.com/${version}/dialog/oauth`,
    );

  /*
   * Facebook Login for Business derives the granted
   * permissions and asset requirements from config_id.
   * Do not add a parallel scope list here.
   */
  url.searchParams.set(
    'client_id',
    appId,
  );

  url.searchParams.set(
    'config_id',
    configId,
  );

  url.searchParams.set(
    'redirect_uri',
    redirectUri,
  );

  url.searchParams.set(
    'state',
    state,
  );

  url.searchParams.set(
    'response_type',
    'code',
  );

  url.searchParams.set(
    'override_default_response_type',
    'true',
  );

  return url;
}


export async function exchangeMetaAuthorizationCode({
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
    metaOAuthClient();

  const version =
    metaGraphVersion();

  const body =
    new URLSearchParams({
      client_id:
        appId,

      client_secret:
        appSecret,

      code,

      redirect_uri:
        redirectUri,
    });


  const response =
    await fetch(
      `https://graph.facebook.com/${version}/oauth/access_token`,
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


  let payload:
    | MetaTokenEnvelope
    | null =
    null;

  try {
    payload =
      (
        await response.json()
      ) as MetaTokenEnvelope;
  } catch {
    payload =
      null;
  }


  const tokenContainer =
    payload?.data &&
    typeof payload.data ===
      'object'
      ? payload.data
      : payload;


  const accessToken =
    nonEmptyString(
      tokenContainer
        ?.access_token,
    );


  if (
    !response.ok ||
    !accessToken
  ) {
    throw new Error(
      `Meta token exchange failed (HTTP ${response.status}).`,
    );
  }


  return {
    accessToken,

    tokenType:
      nonEmptyString(
        tokenContainer
          ?.token_type,
      ) ??
      'Bearer',

    expiresIn:
      finiteNumber(
        tokenContainer
          ?.expires_in,
      ),
  };
}


export async function inspectMetaAccessToken(
  accessToken: string,
): Promise<MetaAccessTokenInspection> {
  if (!accessToken) {
    throw new Error(
      'Meta access token is missing.',
    );
  }


  const {
    appId,
    appSecret,
  } =
    metaOAuthClient();

  const version =
    metaGraphVersion();


  const url =
    new URL(
      `https://graph.facebook.com/${version}/debug_token`,
    );

  url.searchParams.set(
    'input_token',
    accessToken,
  );


  const response =
    await fetch(
      url,
      {
        method:
          'GET',

        headers: {
          Authorization:
            `Bearer ${appId}|${appSecret}`,
        },

        cache:
          'no-store',
      },
    );


  let payload:
    | MetaDebugEnvelope
    | null =
    null;

  try {
    payload =
      (
        await response.json()
      ) as MetaDebugEnvelope;
  } catch {
    payload =
      null;
  }


  const data =
    payload?.data;


  if (
    !response.ok ||
    !data ||
    data.is_valid !== true
  ) {
    throw new Error(
      'Meta returned an invalid access token.',
    );
  }


  const inspectedAppId =
    nonEmptyString(
      data.app_id,
    );

  if (
    !inspectedAppId ||
    inspectedAppId !==
      appId
  ) {
    throw new Error(
      'Meta access token belongs to a different application.',
    );
  }


  const tokenType =
    nonEmptyString(
      data.type,
    );

  if (
    !tokenType ||
    tokenType.toUpperCase() !==
      'SYSTEM_USER'
  ) {
    throw new Error(
      'Meta did not return a system-user access token for this configuration.',
    );
  }


  const userId =
    nonEmptyString(
      data.user_id,
    );

  if (!userId) {
    throw new Error(
      'Meta system-user identity is unavailable.',
    );
  }


  return {
    appId:
      inspectedAppId,

    type:
      tokenType,

    application:
      nonEmptyString(
        data.application,
      ),

    dataAccessExpiresAt:
      finiteNumber(
        data.data_access_expires_at,
      ),

    expiresAt:
      finiteNumber(
        data.expires_at,
      ),

    issuedAt:
      finiteNumber(
        data.issued_at,
      ),

    scopes:
      stringArray(
        data.scopes,
      ),

    granularScopes:
      granularScopes(
        data.granular_scopes,
      ),

    userId,
  };
}