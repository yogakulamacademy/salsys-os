import type {
  NextRequest,
} from 'next/server';

import {
  metaAuthorizationUrl,
} from '@/lib/integrations/meta';


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
        'META_APP_ID',
      ),

    configId:
      requiredEnv(
        'INSTAGRAM_LOGIN_CONFIG_ID',
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
  configId,
  redirectUri,
  state,
}: {
  appId: string;
  configId: string;
  redirectUri: string;
  state: string;
}) {
  return metaAuthorizationUrl({
    appId,
    configId,
    redirectUri,
    state,
  });
}
