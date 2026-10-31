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

const BUILT_IN_AUDIENCES = {
  active_prospects: {
    name: 'Active Prospects',
    description:
      'CRM leads still eligible for prospect retargeting.',
  },
  qualified_prospects: {
    name: 'Qualified Prospects',
    description:
      'CRM leads in qualified or high-intent stages.',
  },
  high_intent_prospects: {
    name: 'High Intent Prospects',
    description:
      'CRM leads with high-intent stage or signal.',
  },
  enrolled_students: {
    name: 'Enrolled Students',
    description:
      'CRM leads whose authoritative stage is enrolled.',
  },
} as const;

type BuiltInAudienceKey =
  keyof typeof BUILT_IN_AUDIENCES;

type CachedMetaCustomAudience = {
  id: string;
  name: string;
  subtype: string | null;
};

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

function objectMetadata(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cachedCustomAudiences(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 500)
    .flatMap(
      (item) => {
        if (
          !item ||
          typeof item !== 'object' ||
          Array.isArray(item)
        ) {
          return [];
        }

        const record =
          item as Record<string, unknown>;

        const id =
          typeof record.id === 'string'
            ? record.id.trim()
            : '';

        const name =
          typeof record.name === 'string'
            ? record.name.trim()
            : '';

        const subtype =
          typeof record.subtype === 'string' &&
          record.subtype.trim()
            ? record.subtype.trim()
            : null;

        if (
          !/^\d+$/.test(id) ||
          !name
        ) {
          return [];
        }

        return [
          {
            id,
            name,
            subtype,
          } satisfies CachedMetaCustomAudience,
        ];
      },
    );
}

function isBuiltInAudienceKey(
  value: string,
): value is BuiltInAudienceKey {
  return Object.prototype.hasOwnProperty.call(
    BUILT_IN_AUDIENCES,
    value,
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
    objectMetadata(
      rawAsset.metadata,
    );

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

/**
 * Map one already-discovered Meta Custom Audience to one built-in CRM cohort.
 *
 * This is intentionally an internal-only staging action:
 * - it performs no Meta API request;
 * - it never resolves or hashes a CRM person's identifiers;
 * - the destination is always created/left INACTIVE;
 * - an ACTIVE or PAUSED destination cannot be silently repointed.
 */
export async function stageMetaCustomAudienceDestinationAction(
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

  const audienceKey =
    textValue(
      formData,
      'audience_key',
    );

  const externalAudienceId =
    textValue(
      formData,
      'external_audience_id',
    );

  if (
    !connectionId ||
    !audienceKey ||
    !externalAudienceId ||
    !isBuiltInAudienceKey(
      audienceKey,
    ) ||
    !/^\d+$/.test(
      externalAudienceId,
    )
  ) {
    redirect(
      integrationsUrl(
        'error',
        'Choose a valid CRM cohort and discovered Meta Custom Audience.',
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
        'id,status,provider,scopes',
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

  const grantedScopes =
    new Set(
      Array.isArray(
        connection?.scopes,
      )
        ? connection.scopes
            .filter(
              (scope): scope is string =>
                typeof scope === 'string',
            )
            .map(
              (scope) =>
                scope.trim().toLowerCase(),
            )
        : [],
    );

  if (
    connectionError ||
    !connection ||
    connection.status !== 'connected' ||
    !grantedScopes.has(
      'ads_management',
    )
  ) {
    redirect(
      integrationsUrl(
        'error',
        'Reconnect Meta with ads_management before staging a Custom Audience destination.',
      ),
    );
  }

  const {
    data: selectedAsset,
    error: assetError,
  } =
    await admin
      .from(
        'integration_assets',
      )
      .select(
        'id,external_id,metadata',
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
    !selectedAsset ||
    !/^\d+$/.test(
      selectedAsset.external_id,
    )
  ) {
    redirect(
      integrationsUrl(
        'error',
        'Select a valid Meta ad account before staging the destination.',
      ),
    );
  }

  const metadata =
    objectMetadata(
      selectedAsset.metadata,
    );

  const discoveredAudiences =
    cachedCustomAudiences(
      metadata.custom_audiences,
    );

  const selectedAudience =
    discoveredAudiences.find(
      (audience) =>
        audience.id ===
        externalAudienceId,
    );

  if (!selectedAudience) {
    redirect(
      integrationsUrl(
        'error',
        'That Meta Custom Audience is not in the latest safe discovery cache. Run discovery again.',
      ),
    );
  }

  const definition =
    BUILT_IN_AUDIENCES[
      audienceKey
    ];

  const {
    error: definitionUpsertError,
  } =
    await admin
      .from(
        'ad_audience_definitions',
      )
      .upsert(
        {
          organization_id:
            organizationId,
          audience_key:
            audienceKey,
          name:
            definition.name,
          description:
            definition.description,
          status:
            'active',
          rules: {
            system:
              'crm_stage_intent_v1',
          },
          created_by:
            user.id,
        },
        {
          onConflict:
            'organization_id,audience_key',
          ignoreDuplicates:
            true,
        },
      );

  if (definitionUpsertError) {
    redirect(
      integrationsUrl(
        'error',
        'Unable to prepare the internal CRM audience definition.',
      ),
    );
  }

  const {
    data: audienceDefinition,
    error: definitionReadError,
  } =
    await admin
      .from(
        'ad_audience_definitions',
      )
      .select(
        'id,status',
      )
      .eq(
        'organization_id',
        organizationId,
      )
      .eq(
        'audience_key',
        audienceKey,
      )
      .maybeSingle();

  if (
    definitionReadError ||
    !audienceDefinition
  ) {
    redirect(
      integrationsUrl(
        'error',
        'Unable to resolve the internal CRM audience definition.',
      ),
    );
  }

  if (
    audienceDefinition.status !==
    'active'
  ) {
    redirect(
      integrationsUrl(
        'error',
        'This CRM audience definition is paused or archived. Reactivate it before staging a Meta destination.',
      ),
    );
  }

  const {
    data: existingDestination,
    error: existingDestinationError,
  } =
    await admin
      .from(
        'ad_audience_destinations',
      )
      .select(
        'id,status,external_audience_id',
      )
      .eq(
        'organization_id',
        organizationId,
      )
      .eq(
        'audience_id',
        audienceDefinition.id,
      )
      .eq(
        'connection_id',
        connectionId,
      )
      .eq(
        'destination_kind',
        'custom_audience',
      )
      .maybeSingle();

  if (existingDestinationError) {
    redirect(
      integrationsUrl(
        'error',
        'Unable to inspect the existing Meta audience destination.',
      ),
    );
  }

  if (
    existingDestination &&
    [
      'active',
      'paused',
    ].includes(
      existingDestination.status,
    ) &&
    existingDestination.external_audience_id !==
      selectedAudience.id
  ) {
    redirect(
      integrationsUrl(
        'error',
        'An active or paused destination cannot be silently repointed to a different Meta audience.',
      ),
    );
  }

  const destinationConfig = {
    adAccountId:
      selectedAsset.external_id,
    discoverySource:
      'meta_custom_audience_discovery_v1',
    subtype:
      selectedAudience.subtype,
    customAudienceTosAccepted:
      metadata.custom_audience_tos_accepted === true
        ? true
        : metadata.custom_audience_tos_accepted === false
          ? false
          : null,
  };

  if (existingDestination) {
    const {
      error: updateError,
    } =
      await admin
        .from(
          'ad_audience_destinations',
        )
        .update({
          integration_asset_id:
            selectedAsset.id,
          external_audience_id:
            selectedAudience.id,
          external_audience_name:
            selectedAudience.name,
          status:
            existingDestination.status === 'error'
              ? 'inactive'
              : existingDestination.status,
          sync_mode:
            'incremental',
          config:
            destinationConfig,
          last_error:
            null,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          existingDestination.id,
        )
        .eq(
          'organization_id',
          organizationId,
        );

    if (updateError) {
      redirect(
        integrationsUrl(
          'error',
          'Unable to update the inactive Meta audience destination.',
        ),
      );
    }
  } else {
    const {
      error: insertError,
    } =
      await admin
        .from(
          'ad_audience_destinations',
        )
        .insert({
          organization_id:
            organizationId,
          audience_id:
            audienceDefinition.id,
          connection_id:
            connectionId,
          integration_asset_id:
            selectedAsset.id,
          destination_kind:
            'custom_audience',
          external_audience_id:
            selectedAudience.id,
          external_audience_name:
            selectedAudience.name,
          status:
            'inactive',
          sync_mode:
            'incremental',
          config:
            destinationConfig,
          created_by:
            user.id,
        });

    if (insertError) {
      redirect(
        integrationsUrl(
          'error',
          'Unable to stage the Meta audience destination.',
        ),
      );
    }
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
        'custom_audience_destination_staged',
      actor_user_id:
        user.id,
      detail: {
        audience_key:
          audienceKey,
        external_audience_id:
          selectedAudience.id,
        ad_account_id:
          selectedAsset.external_id,
        destination_status:
          'inactive',
        provider_write:
          false,
      },
    });

  revalidatePath(
    '/settings/integrations',
  );

  redirect(
    integrationsUrl(
      'notice',
      `Staged ${selectedAudience.name} as an inactive Meta destination for ${definition.name}. No customer data was sent.`,
    ),
  );
}