import "server-only";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  verifyMetaConversionDestination,
} from "@/lib/integrations/meta-conversion-destinations";


const META_DESTINATION_KIND =
  "meta_dataset_event";


type RouteRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  integration_asset_id: string;
  destination_kind: string;
  destination_external_id: string | null;
  destination_event_name: string | null;
  status: string;
};


type ConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
  scopes: string[] | null;
};


type AssetRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  asset_type: string;
  status: string;
  is_selected: boolean;
};


export type MetaRouteReadinessCheck = {
  code: string;
  ok: boolean;
  message: string;
};


export type MetaRouteReadiness = {
  organizationId: string;
  routeId: string;
  ready: boolean;
  providerVerificationAttempted: boolean;
  checks: MetaRouteReadinessCheck[];
};


function requiredId(
  value: string,
  label: string,
) {
  const trimmed =
    value?.trim();

  if (!trimmed) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return trimmed;
}


function validMetaId(
  value:
    | string
    | null,
) {
  return Boolean(
    value &&
    /^\d{5,30}$/.test(
      value.trim(),
    ),
  );
}


function validEventName(
  value:
    | string
    | null,
) {
  if (!value) {
    return false;
  }

  const trimmed =
    value.trim();

  return Boolean(
    trimmed &&
    trimmed.length <= 100 &&
    !/[\u0000-\u001F\u007F]/.test(
      trimmed,
    ),
  );
}


function check(
  code: string,
  ok: boolean,
  successMessage: string,
  failureMessage: string,
): MetaRouteReadinessCheck {
  return {
    code,
    ok,
    message:
      ok
        ? successMessage
        : failureMessage,
  };
}


export async function assessMetaConversionRouteReadiness({
  organizationId,
  routeId,
}: {
  organizationId: string;
  routeId: string;
}): Promise<MetaRouteReadiness> {
  const normalizedOrganizationId =
    requiredId(
      organizationId,
      "Organization ID",
    );

  const normalizedRouteId =
    requiredId(
      routeId,
      "Meta conversion route ID",
    );

  const admin =
    createAdminClient();

  const checks:
    MetaRouteReadinessCheck[] =
    [];


  const {
    data: rawRoute,
    error: routeError,
  } =
    await admin
      .from(
        "conversion_feedback_routes",
      )
      .select(
        "id,organization_id,connection_id,integration_asset_id,destination_kind,destination_external_id,destination_event_name,status",
      )
      .eq(
        "id",
        normalizedRouteId,
      )
      .eq(
        "organization_id",
        normalizedOrganizationId,
      )
      .maybeSingle();

  if (routeError) {
    throw new Error(
      `Unable to read Meta conversion route: ${routeError.message}`,
    );
  }

  const route =
    rawRoute as unknown as
      | RouteRow
      | null;

  if (!route) {
    return {
      organizationId:
        normalizedOrganizationId,
      routeId:
        normalizedRouteId,
      ready:
        false,
      providerVerificationAttempted:
        false,
      checks: [
        {
          code:
            "route_found",
          ok:
            false,
          message:
            "Meta conversion route was not found for this organization.",
        },
      ],
    };
  }

  checks.push(
    check(
      "route_found",
      true,
      "Meta conversion route exists in the requested organization.",
      "Meta conversion route was not found for this organization.",
    ),
  );

  checks.push(
    check(
      "route_inactive",
      route.status ===
        "inactive",
      "Meta conversion route is inactive and can be evaluated for activation.",
      "Meta conversion route must be inactive before activation readiness is evaluated.",
    ),
  );

  checks.push(
    check(
      "destination_kind",
      route.destination_kind ===
        META_DESTINATION_KIND,
      "Meta conversion route uses meta_dataset_event.",
      "Meta conversion route does not use meta_dataset_event.",
    ),
  );

  const datasetConfigured =
    validMetaId(
      route.destination_external_id,
    );

  checks.push(
    check(
      "dataset_configured",
      datasetConfigured,
      "Meta Dataset/Pixel ID is configured.",
      "Meta Dataset/Pixel ID is missing or invalid.",
    ),
  );

  const eventNameConfigured =
    validEventName(
      route.destination_event_name,
    );

  checks.push(
    check(
      "event_name_configured",
      eventNameConfigured,
      "Meta destination event name is configured.",
      "Meta destination event name is missing or invalid.",
    ),
  );


  const {
    data: rawConnection,
    error: connectionError,
  } =
    await admin
      .from(
        "integration_connections",
      )
      .select(
        "id,organization_id,provider,status,scopes",
      )
      .eq(
        "id",
        route.connection_id,
      )
      .eq(
        "organization_id",
        normalizedOrganizationId,
      )
      .maybeSingle();

  if (connectionError) {
    throw new Error(
      `Unable to read Meta connection readiness: ${connectionError.message}`,
    );
  }

  const connection =
    rawConnection as unknown as
      | ConnectionRow
      | null;

  const connectionIsMeta =
    Boolean(
      connection &&
      connection.provider ===
        "meta",
    );

  checks.push(
    check(
      "meta_connection",
      connectionIsMeta,
      "Route is bound to a Meta connection.",
      "Route is not bound to a valid Meta connection.",
    ),
  );

  const connectionConnected =
    Boolean(
      connectionIsMeta &&
      connection?.status ===
        "connected",
    );

  checks.push(
    check(
      "connection_connected",
      connectionConnected,
      "Meta connection is connected.",
      "Meta connection is not connected.",
    ),
  );

  const normalizedScopes =
    new Set(
      (connection?.scopes ??
        [])
        .map(
          (scope) =>
            scope.trim().toLowerCase(),
        )
        .filter(Boolean),
    );

  const hasAdsRead =
    normalizedScopes.has(
      "ads_read",
    );

  checks.push(
    check(
      "ads_read_granted",
      hasAdsRead,
      "Meta token includes ads_read.",
      "Meta token does not include ads_read; Marketing API access is not ready.",
    ),
  );


  const {
    data: rawAsset,
    error: assetError,
  } =
    await admin
      .from(
        "integration_assets",
      )
      .select(
        "id,organization_id,connection_id,asset_type,status,is_selected",
      )
      .eq(
        "id",
        route.integration_asset_id,
      )
      .eq(
        "organization_id",
        normalizedOrganizationId,
      )
      .eq(
        "connection_id",
        route.connection_id,
      )
      .maybeSingle();

  if (assetError) {
    throw new Error(
      `Unable to read Meta ad account readiness: ${assetError.message}`,
    );
  }

  const asset =
    rawAsset as unknown as
      | AssetRow
      | null;

  const assetIsMetaAdAccount =
    Boolean(
      asset &&
      asset.asset_type ===
        "meta_ad_account",
    );

  checks.push(
    check(
      "meta_ad_account",
      assetIsMetaAdAccount,
      "Route is bound to a Meta ad account asset.",
      "Route is not bound to a valid Meta ad account asset.",
    ),
  );

  const assetSelectedAndAvailable =
    Boolean(
      assetIsMetaAdAccount &&
      asset?.is_selected ===
        true &&
      asset?.status !==
        "unavailable",
    );

  checks.push(
    check(
      "asset_selected_available",
      assetSelectedAndAvailable,
      "Meta ad account is selected and available.",
      "Meta ad account must be selected and available.",
    ),
  );


  const localChecksPass =
    checks.every(
      (entry) =>
        entry.ok,
    );

  let providerVerificationAttempted =
    false;

  let destinationVerified =
    false;

  if (
    localChecksPass &&
    route.destination_external_id
  ) {
    providerVerificationAttempted =
      true;

    try {
      const verifiedDestination =
        await verifyMetaConversionDestination({
          organizationId:
            normalizedOrganizationId,
          connectionId:
            route.connection_id,
          integrationAssetId:
            route.integration_asset_id,
          datasetId:
            route.destination_external_id,
        });

      destinationVerified =
        Boolean(
          verifiedDestination,
        );
    } catch {
      destinationVerified =
        false;
    }
  }

  checks.push(
    check(
      "destination_verified",
      destinationVerified,
      "Meta Dataset/Pixel is verified against the selected ad account.",
      providerVerificationAttempted
        ? "Meta Dataset/Pixel could not be verified against the selected ad account."
        : "Meta Dataset/Pixel verification was not attempted because local readiness checks are incomplete.",
    ),
  );


  return {
    organizationId:
      normalizedOrganizationId,
    routeId:
      normalizedRouteId,
    ready:
      checks.every(
        (entry) =>
          entry.ok,
      ),
    providerVerificationAttempted,
    checks,
  };
}
