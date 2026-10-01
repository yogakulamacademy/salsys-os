import 'server-only';

import {
  createAdminClient,
} from '@/lib/supabase/admin';

import type {
  IntegrationAsset,
  IntegrationConnection,
  IntegrationWorkspace,
} from './types';

const MISSING_RELATION_CODE =
  '42P01';

export async function getIntegrationWorkspace():
  Promise<IntegrationWorkspace> {
  const admin =
    createAdminClient();

  const [
    connectionsResult,
    assetsResult,
  ] =
    await Promise.all([
      admin
        .from(
          'integration_connections',
        )
        .select(
          [
            'id',
            'provider',
            'auth_mode',
            'status',
            'parent_connection_id',
            'external_account_id',
            'account_name',
            'account_email',
            'scopes',
            'token_expires_at',
            'token_type',
            'provider_metadata',
            'connected_by',
            'connected_at',
            'last_verified_at',
            'last_error',
            'created_at',
            'updated_at',
          ].join(','),
        )
        .order(
          'updated_at',
          {
            ascending: false,
          },
        ),

      admin
        .from(
          'integration_assets',
        )
        .select(
          [
            'id',
            'connection_id',
            'asset_type',
            'external_id',
            'name',
            'status',
            'is_selected',
            'metadata',
            'discovered_at',
            'updated_at',
          ].join(','),
        )
        .order(
          'asset_type',
          {
            ascending: true,
          },
        )
        .order(
          'name',
          {
            ascending: true,
          },
        ),
    ]);

  const error =
    connectionsResult.error ??
    assetsResult.error;

  if (
    error?.code ===
    MISSING_RELATION_CODE
  ) {
    return {
      installed: false,
      error:
        'Integration foundation tables are not installed yet.',
      connections: [],
      assets: [],
    };
  }

  if (error) {
    return {
      installed: true,
      error:
        error.message,
      connections: [],
      assets: [],
    };
  }

  return {
    installed: true,
    error: null,
    connections:
      (
        connectionsResult.data ??
        []
      ) as unknown as IntegrationConnection[],
    assets:
      (
        assetsResult.data ??
        []
      ) as unknown as IntegrationAsset[],
  };
}
