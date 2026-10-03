import 'server-only';

import {
  createAdminClient,
} from '@/lib/supabase/admin';

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '@/lib/integrations/crypto';

import {
  refreshGoogleAccessToken,
} from '@/lib/integrations/google';

type GoogleConnectionRow = {
  id: string;
  organization_id:
    string;
  provider: string;
  status: string;
  access_token_ciphertext:
    | string
    | null;
  refresh_token_ciphertext:
    | string
    | null;
  token_expires_at:
    | string
    | null;
};

type GoogleConnectionTokenOptions = {
  organizationId:
    string;
};

const REFRESH_EARLY_MS =
  5 * 60 * 1000;

/*
 * Trusted low-level token loader.
 *
 * All token retrieval must be scoped to the organization that owns
 * the integration connection.
 */
export async function getGoogleAccessTokenForConnection(
  connectionId: string,
  options:
    GoogleConnectionTokenOptions,
) {
  if (
    !options.organizationId
  ) {
    throw new Error(
      'Unable to load Google connection: organizationId is required.',
    );
  }

  const admin =
    createAdminClient();

  const connectionQuery =
    admin
      .from(
        'integration_connections',
      )
      .select(
        [
          'id',
          'organization_id',
          'provider',
          'status',
          'access_token_ciphertext',
          'refresh_token_ciphertext',
          'token_expires_at',
        ].join(','),
      )
      .eq(
        'id',
        connectionId,
      )
      .eq(
        'organization_id',
        options.organizationId,
      );

  const {
    data:
      rawConnection,
    error:
      connectionError,
  } =
    await connectionQuery
      .maybeSingle();

  if (
    connectionError ||
    !rawConnection
  ) {
    throw new Error(
      connectionError?.message ??
        'Google connection not found.',
    );
  }

  const connection =
    rawConnection as unknown as
      GoogleConnectionRow;

  if (
    !connection.organization_id
  ) {
    throw new Error(
      'Google connection is not assigned to an organization.',
    );
  }

  if (
    connection.organization_id !==
      options.organizationId
  ) {
    throw new Error(
      'Google connection not found.',
    );
  }

  if (
    connection.provider !==
      'google' ||
    connection.status !==
      'connected'
  ) {
    throw new Error(
      'Google connection is not active.',
    );
  }

  const expiresAt =
    connection.token_expires_at
      ? new Date(
          connection.token_expires_at,
        ).getTime()
      : 0;

  if (
    connection.access_token_ciphertext &&
    expiresAt >
      Date.now() +
        REFRESH_EARLY_MS
  ) {
    return decryptIntegrationSecret(
      connection.access_token_ciphertext,
    );
  }

  if (
    !connection.refresh_token_ciphertext
  ) {
    throw new Error(
      'Google refresh token is missing. Reconnect the Google account.',
    );
  }

  const refreshToken =
    decryptIntegrationSecret(
      connection.refresh_token_ciphertext,
    );

  const refreshed =
    await refreshGoogleAccessToken(
      refreshToken,
    );

  const accessToken =
    refreshed.access_token;

  if (!accessToken) {
    throw new Error(
      'Google did not return a refreshed access token.',
    );
  }

  const expiresInSeconds =
    Number(
      refreshed.expires_in ??
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

  const updatePayload: {
    access_token_ciphertext:
      string;
    token_expires_at:
      string;
    token_type:
      string;
    last_verified_at:
      string;
    last_error:
      null;
    refresh_token_ciphertext?:
      string;
  } = {
    access_token_ciphertext:
      encryptIntegrationSecret(
        accessToken,
      ),
    token_expires_at:
      tokenExpiresAt,
    token_type:
      refreshed.token_type ||
      'Bearer',
    last_verified_at:
      new Date().toISOString(),
    last_error:
      null,
  };

  if (
    refreshed.refresh_token
  ) {
    updatePayload.refresh_token_ciphertext =
      encryptIntegrationSecret(
        refreshed.refresh_token,
      );
  }

  const {
    error:
      updateError,
  } =
    await admin
      .from(
        'integration_connections',
      )
      .update(
        updatePayload,
      )
      .eq(
        'id',
        connectionId,
      )
      .eq(
        'organization_id',
        connection.organization_id,
      );

  if (updateError) {
    throw new Error(
      updateError.message,
    );
  }

  return accessToken;
}

/*
 * Use this helper for organization-scoped integration actions and syncs.
 * It guarantees that token retrieval is scoped to the organization
 * already authorized by the calling workflow.
 */
export async function getGoogleAccessTokenForOrganizationConnection(
  connectionId: string,
  organizationId: string,
) {
  return getGoogleAccessTokenForConnection(
    connectionId,
    {
      organizationId,
    },
  );
}