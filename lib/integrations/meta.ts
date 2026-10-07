import 'server-only';

import type {
  NextRequest,
} from 'next/server';


const DEFAULT_META_GRAPH_VERSION =
  'v26.0';


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

  /*
   * Required for the authorization-code/system-user flow.
   */
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