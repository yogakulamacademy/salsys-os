'use server';

import {
  revalidatePath,
} from 'next/cache';
import {
  redirect,
} from 'next/navigation';

import {
  discoverMetaCustomAudiences,
} from '@/lib/integrations/meta-custom-audiences';
import {
  getMetaAccessTokenForOrganizationConnection,
} from '@/lib/integrations/meta-connection';
import {
  createAdminClient,
} from '@/lib/supabase/admin';
import {
  createClient,
} from '@/lib/supabase/server';
import {
  getWorkspaceContextForUser,
} from '@/lib/workspace';

function textValue(
  formData: FormData,
  key: string,
) {
  const value =
    String(
      formData.get(key) ??
      '',
    ).trim();

  return value || null;
}

function integrationsUrl(
  key: 'notice' | 'error',
  value: string,
) {
  const params =
    new URLSearchParams({
      [key]: value,
    });

  return (
    '/settings/integrations?' +
    params.toString()
  );
}

async function requireMetaAdminContext() {
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
    redirect('/login');
  }

  const {
    data: profile,
    error: profileError,
  } =
    await supabase
      .from('profiles')
      .select('id, active')
      .eq('id', user.id)
      .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.active !== true
  ) {
    redirect('/dashboard');
  }

  const workspaceContext =
    await getWorkspaceContextForUser(
      supabase,
      user.id,
    );

  const activeWorkspace =
    workspaceContext.activeWorkspace;

  if (
    !activeWorkspace ||
    ![
      'owner',
      'admin',
    ].includes(
      activeWorkspace.role,
    )
  ) {
    redirect('/dashboard');
  }

  return {
    user,
    organizationId:
      activeWorkspace.organizationId,
  };
}

/**
 * Read-only provider discovery. This action never creates/updates a Meta Custom
 * Audience and never resolves CRM identifiers. It only caches safe audience
 * metadata on the selected ad-account asset for an admin to choose later.
 */
export async function discoverMetaCustomAudiencesAction(
  formData: FormData,
) {
  const {
    user,
    organizationId,
  } =
    await requireMetaAdminContext();

  const connectionId =
    textValue(
      formData,
      'connection_id',
    );

  if (!connectionId) {
    redirect(
      integrationsUrl(
        'error',
        'Meta connection is missing.',
      ),
    );
  }

  const admin =
    createAdminClient();

  const {
    data: connection,
    error: connectionError,
  } =
    await admin
      .from(
        'integration_connections',
      )
      .select(
        'id, organization_id, provider, status',
      )
      .eq(
        'id',
        connectionId,
      )
      .eq(
        'organization_id',
        organizationId,
      )
      .eq(
        'provider',
        'meta',
      )
      .maybeSingle();

  if (
    connectionError ||
    !connection ||
    connection.status !==
      'connected'
  ) {
    redirect(
      integrationsUrl(
        'error',
        'Active Meta connection not found.',
      ),
    );
  }

  const {
    data: rawAsset,
    error: assetError,
  } =
    await admin
      .from(
        'integration_assets',
      )
      .select(
        'id, external_id, metadata, updated_at',
      )
      .eq(
        'organization_id',
        organizationId,
      )
      .eq(
        'connection_id',
        connectionId,
      )
      .eq(
        'asset_type',
        'meta_ad_account',
      )
      .eq(
        'is_selected',
        true,
      )
      .eq(
        'status',
        'selected',
      )
      .maybeSingle();

  if (
    assetError ||
    !rawAsset
  ) {
    redirect(
      integrationsUrl(
        'error',
        'Select a Meta ad account before discovering Custom Audiences.',
      ),
    );
  }

  const existingMetadata =
    rawAsset.metadata &&
    typeof rawAsset.metadata ===
      'object' &&
    !Array.isArray(
      rawAsset.metadata,
    )
      ? rawAsset.metadata as Record<string, unknown>
      : {};

  let discovery:
    | Awaited<
        ReturnType<
          typeof discoverMetaCustomAudiences
        >
      >
    | null = null;

  let failureMessage:
    | string
    | null =
    null;

  try {
    const accessToken =
      await getMetaAccessTokenForOrganizationConnection(
        connectionId,
        organizationId,
      );

    discovery =
      await discoverMetaCustomAudiences({
        accessToken,
        adAccountId:
          rawAsset.external_id,
      });

    const now =
      new Date().toISOString();

    const nextMetadata = {
      ...existingMetadata,
      custom_audiences:
        discovery.audiences,
      custom_audiences_discovered_at:
        now,
      custom_audiences_truncated:
        discovery.truncated,
    };

    const {
      data: updatedRows,
      error: updateError,
    } =
      await admin
        .from(
          'integration_assets',
        )
        .update({
          metadata:
            nextMetadata,
          updated_at:
            now,
        })
        .eq(
          'id',
          rawAsset.id,
        )
        .eq(
          'organization_id',
          organizationId,
        )
        .eq(
          'connection_id',
          connectionId,
        )
        .eq(
          'updated_at',
          rawAsset.updated_at,
        )
        .select('id');

    if (
      updateError ||
      !updatedRows ||
      updatedRows.length !== 1
    ) {
      throw new Error(
        updateError?.message ??
          'Meta ad-account state changed during Custom Audience discovery. Run discovery again.',
      );
    }

    await admin
      .from(
        'integration_audit_log',
      )
      .insert({
        organization_id:
          organizationId,
        connection_id:
          connectionId,
        provider:
          'meta',
        event_type:
          'custom_audiences_discovered',
        actor_user_id:
          user.id,
        detail: {
          ad_account_id:
            discovery.adAccountId,
          discovered_count:
            discovery.audiences.length,
          truncated:
            discovery.truncated,
          read_only:
            true,
        },
      });
  } catch (error) {
    failureMessage =
      error instanceof Error
        ? error.message
        : 'Meta Custom Audience discovery failed.';
  }

  revalidatePath(
    '/settings/integrations',
  );

  if (
    failureMessage ||
    !discovery
  ) {
    redirect(
      integrationsUrl(
        'error',
        failureMessage ??
          'Meta Custom Audience discovery failed.',
      ),
    );
  }

  const suffix =
    discovery.truncated
      ? ' Showing the first 500 safe metadata records.'
      : '';

  redirect(
    integrationsUrl(
      'notice',
      `Discovered ${discovery.audiences.length} Meta Custom Audiences.${suffix}`,
    ),
  );
}