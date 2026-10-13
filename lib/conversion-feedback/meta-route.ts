import "server-only";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  verifyMetaConversionDestination,
} from "@/lib/integrations/meta-conversion-destinations";

import type {
  JsonObject,
} from "@/lib/conversion-feedback/types";


const META_DESTINATION_KIND =
  "meta_dataset_event";

const META_ACTION_SOURCES =
  new Set([
    "website",
    "app",
    "phone_call",
    "chat",
    "email",
    "physical_store",
    "system_generated",
    "other",
  ]);


type ExistingRouteRow = {
  id: string;
  route_key: string;
};


type CreatedMetaRouteRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  integration_asset_id: string;
  route_key: string;
  name: string;
  conversion_type: string;
  destination_kind: string;
  destination_external_id: string | null;
  destination_event_name: string | null;
  status: string;
  provider_config: JsonObject;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};


export type MetaConversionRouteProviderConfig = {
  actionSource?: string | null;
  testEventCode?: string | null;
  eventSourceUrl?: string | null;
};


export type CreateInactiveMetaConversionRouteInput = {
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
  datasetId: string;
  eventName: string;
  conversionType: string;
  routeKey: string;
  name?: string | null;
  createdBy?: string | null;
  providerConfig?: MetaConversionRouteProviderConfig | null;
};


export type CreatedInactiveMetaConversionRoute = {
  id: string;
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
  routeKey: string;
  name: string;
  conversionType: string;
  destinationKind: "meta_dataset_event";
  datasetId: string;
  eventName: string;
  status: "inactive";
  providerConfig: JsonObject;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};


function requiredText(
  value: string,
  label: string,
  maxLength = 200,
) {
  const trimmed =
    value?.trim();

  if (
    !trimmed ||
    trimmed.length > maxLength ||
    /[\u0000-\u001F\u007F]/.test(
      trimmed,
    )
  ) {
    throw new Error(
      `${label} is invalid.`,
    );
  }

  return trimmed;
}


function normalizeRouteKey(
  value: string,
) {
  const routeKey =
    requiredText(
      value,
      "Meta conversion route key",
      120,
    ).toLowerCase();

  if (
    !/^[a-z0-9][a-z0-9_-]{2,119}$/.test(
      routeKey,
    )
  ) {
    throw new Error(
      "Meta conversion route key must use lowercase letters, numbers, underscores or hyphens.",
    );
  }

  return routeKey;
}


function normalizeConversionType(
  value: string,
) {
  const conversionType =
    requiredText(
      value,
      "Meta conversion type",
      100,
    );

  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(
      conversionType,
    )
  ) {
    throw new Error(
      "Meta conversion type is invalid.",
    );
  }

  return conversionType;
}


function normalizeDatasetId(
  value: string,
) {
  const datasetId =
    value?.trim();

  if (
    !datasetId ||
    !/^\d{5,30}$/.test(
      datasetId,
    )
  ) {
    throw new Error(
      "Meta conversion dataset ID is invalid.",
    );
  }

  return datasetId;
}


function normalizeEventName(
  value: string,
) {
  return requiredText(
    value,
    "Meta conversion event name",
    100,
  );
}


function normalizeOptionalUserId(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    trimmed,
  )
    ? trimmed
    : null;
}


function normalizeEventSourceUrl(
  value:
    | string
    | null
    | undefined,
) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed =
      new URL(
        value.trim(),
      );

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return null;
    }

    const normalized =
      parsed.toString();

    return normalized.length <= 2048
      ? normalized
      : null;
  } catch {
    return null;
  }
}


function buildProviderConfig(
  input:
    | MetaConversionRouteProviderConfig
    | null
    | undefined,
): JsonObject {
  const configuredActionSource =
    input?.actionSource
      ?.trim()
      .toLowerCase() ||
    "system_generated";

  if (
    !META_ACTION_SOURCES.has(
      configuredActionSource,
    )
  ) {
    throw new Error(
      "Meta conversion action source is invalid.",
    );
  }

  const providerConfig:
    JsonObject = {
      action_source:
        configuredActionSource,
    };

  const testEventCode =
    input?.testEventCode
      ?.trim();

  if (testEventCode) {
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(
        testEventCode,
      )
    ) {
      throw new Error(
        "Meta test event code is invalid.",
      );
    }

    providerConfig[
      "test_event_code"
    ] =
      testEventCode;
  }

  const eventSourceUrl =
    normalizeEventSourceUrl(
      input?.eventSourceUrl,
    );

  if (
    input?.eventSourceUrl?.trim() &&
    !eventSourceUrl
  ) {
    throw new Error(
      "Meta event source URL is invalid.",
    );
  }

  if (eventSourceUrl) {
    providerConfig[
      "event_source_url"
    ] =
      eventSourceUrl;
  }

  return providerConfig;
}


function mapCreatedRoute(
  row:
    CreatedMetaRouteRow,
): CreatedInactiveMetaConversionRoute {
  if (
    row.status !== "inactive" ||
    row.destination_kind !==
      META_DESTINATION_KIND ||
    !row.destination_external_id ||
    !row.destination_event_name
  ) {
    throw new Error(
      "Meta conversion route was created in an unexpected state.",
    );
  }

  return {
    id:
      row.id,
    organizationId:
      row.organization_id,
    connectionId:
      row.connection_id,
    integrationAssetId:
      row.integration_asset_id,
    routeKey:
      row.route_key,
    name:
      row.name,
    conversionType:
      row.conversion_type,
    destinationKind:
      "meta_dataset_event",
    datasetId:
      row.destination_external_id,
    eventName:
      row.destination_event_name,
    status:
      "inactive",
    providerConfig:
      row.provider_config,
    createdBy:
      row.created_by,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}


export async function createInactiveMetaConversionRoute(
  input:
    CreateInactiveMetaConversionRouteInput,
): Promise<CreatedInactiveMetaConversionRoute> {
  const organizationId =
    requiredText(
      input.organizationId,
      "Organization ID",
      100,
    );

  const connectionId =
    requiredText(
      input.connectionId,
      "Meta connection ID",
      100,
    );

  const integrationAssetId =
    requiredText(
      input.integrationAssetId,
      "Meta ad account asset ID",
      100,
    );

  const datasetId =
    normalizeDatasetId(
      input.datasetId,
    );

  const eventName =
    normalizeEventName(
      input.eventName,
    );

  const conversionType =
    normalizeConversionType(
      input.conversionType,
    );

  const routeKey =
    normalizeRouteKey(
      input.routeKey,
    );

  const name =
    input.name?.trim()
      ? requiredText(
          input.name,
          "Meta conversion route name",
          200,
        )
      : `Meta - ${conversionType} - ${eventName}`;

  const createdBy =
    normalizeOptionalUserId(
      input.createdBy,
    );

  if (
    input.createdBy?.trim() &&
    !createdBy
  ) {
    throw new Error(
      "Meta conversion route createdBy is invalid.",
    );
  }

  const providerConfig =
    buildProviderConfig(
      input.providerConfig,
    );


  const verifiedDestination =
    await verifyMetaConversionDestination({
      organizationId,
      connectionId,
      integrationAssetId,
      datasetId,
    });

  if (!verifiedDestination) {
    throw new Error(
      "Meta conversion dataset is not available to the selected Meta ad account.",
    );
  }


  const admin =
    createAdminClient();

  const {
    data: rawRouteKeyMatch,
    error: routeKeyError,
  } =
    await admin
      .from(
        "conversion_feedback_routes",
      )
      .select(
        "id,route_key",
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "route_key",
        routeKey,
      )
      .maybeSingle();

  if (routeKeyError) {
    throw new Error(
      `Unable to check Meta conversion route key: ${routeKeyError.message}`,
    );
  }

  const routeKeyMatch =
    rawRouteKeyMatch as unknown as
      | ExistingRouteRow
      | null;

  if (routeKeyMatch) {
    throw new Error(
      `Meta conversion route key already exists (${routeKeyMatch.id}).`,
    );
  }


  const {
    data: rawMappingMatches,
    error: mappingError,
  } =
    await admin
      .from(
        "conversion_feedback_routes",
      )
      .select(
        "id,route_key",
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "connection_id",
        connectionId,
      )
      .eq(
        "integration_asset_id",
        integrationAssetId,
      )
      .eq(
        "conversion_type",
        conversionType,
      )
      .eq(
        "destination_kind",
        META_DESTINATION_KIND,
      )
      .eq(
        "destination_external_id",
        datasetId,
      )
      .eq(
        "destination_event_name",
        eventName,
      )
      .limit(
        1,
      );

  if (mappingError) {
    throw new Error(
      `Unable to check existing Meta conversion route mapping: ${mappingError.message}`,
    );
  }

  const mappingMatches =
    rawMappingMatches as unknown as
      ExistingRouteRow[] | null;

  const existingMapping =
    mappingMatches?.[0] ??
    null;

  if (existingMapping) {
    throw new Error(
      `An equivalent Meta conversion route already exists (${existingMapping.id}).`,
    );
  }


  const {
    data: rawCreated,
    error: insertError,
  } =
    await admin
      .from(
        "conversion_feedback_routes",
      )
      .insert({
        organization_id:
          organizationId,
        connection_id:
          connectionId,
        integration_asset_id:
          integrationAssetId,
        route_key:
          routeKey,
        name,
        conversion_type:
          conversionType,
        destination_kind:
          META_DESTINATION_KIND,
        destination_external_id:
          datasetId,
        destination_event_name:
          eventName,
        status:
          "inactive",
        provider_config:
          providerConfig,
        created_by:
          createdBy,
      })
      .select(
        "id,organization_id,connection_id,integration_asset_id,route_key,name,conversion_type,destination_kind,destination_external_id,destination_event_name,status,provider_config,created_by,created_at,updated_at",
      )
      .single();

  if (
    insertError ||
    !rawCreated
  ) {
    throw new Error(
      `Unable to create Meta conversion route: ${insertError?.message ?? "unknown database error"}`,
    );
  }

  return mapCreatedRoute(
    rawCreated as unknown as
      CreatedMetaRouteRow,
  );
}
