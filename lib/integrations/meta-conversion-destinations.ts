import "server-only";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  getMetaAccessTokenForConnection,
} from "@/lib/integrations/meta-connection";

import {
  metaGraphVersion,
} from "@/lib/integrations/meta";


const MAX_PIXEL_PAGES =
  20;

const PAGE_SIZE =
  100;


type MetaConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  status: string;
};


type MetaAdAccountAssetRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  asset_type: string;
  external_id: string;
  status: string;
  is_selected: boolean;
};


type MetaPixelEnvelope = {
  data?: Array<{
    id?: unknown;
    name?: unknown;
    last_fired_time?: unknown;
  }>;

  paging?: {
    cursors?: {
      after?: unknown;
    };
  };

  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
  };
};


export type MetaConversionDestination = {
  datasetId: string;
  name: string;
  lastFiredAt: string | null;
};


export type MetaConversionDestinationDiscovery = {
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
  adAccountId: string;
  destinations: MetaConversionDestination[];
};


function stringValue(
  value: unknown,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed ||
    null;
}


function normalizeMetaId(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return null;
  }

  const digits =
    value
      .replace(
        /^act_/i,
        "",
      )
      .trim();

  return /^\d{5,30}$/.test(
    digits,
  )
    ? digits
    : null;
}


function normalizeTimestamp(
  value: unknown,
) {
  const text =
    stringValue(
      value,
    );

  if (!text) {
    return null;
  }

  const timestamp =
    Date.parse(
      text,
    );

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(
    timestamp,
  ).toISOString();
}


function providerErrorMessage(
  payload:
    MetaPixelEnvelope | null,
  status: number,
) {
  const message =
    stringValue(
      payload?.error?.message,
    );

  const type =
    stringValue(
      payload?.error?.type,
    );

  const codeRaw =
    payload?.error?.code;

  const subcodeRaw =
    payload?.error
      ?.error_subcode;

  const code =
    typeof codeRaw === "number" ||
    typeof codeRaw === "string"
      ? String(codeRaw)
      : null;

  const subcode =
    typeof subcodeRaw === "number" ||
    typeof subcodeRaw === "string"
      ? String(subcodeRaw)
      : null;

  const detail =
    [
      message,
      type
        ? `type=${type}`
        : null,
      code
        ? `code=${code}`
        : null,
      subcode
        ? `subcode=${subcode}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

  return (
    detail ||
    `Meta pixel discovery failed (HTTP ${status}).`
  );
}


async function parseMetaPixelResponse(
  response: Response,
) {
  let payload:
    MetaPixelEnvelope | null =
    null;

  try {
    const raw =
      await response.json();

    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw)
    ) {
      payload =
        raw as MetaPixelEnvelope;
    }
  } catch {
    payload =
      null;
  }

  if (
    !response.ok ||
    payload?.error
  ) {
    throw new Error(
      providerErrorMessage(
        payload,
        response.status,
      ),
    );
  }

  if (!payload) {
    throw new Error(
      `Meta returned invalid data while discovering conversion destinations (HTTP ${response.status}).`,
    );
  }

  return payload;
}


async function resolveSelectedMetaAdAccount({
  organizationId,
  connectionId,
  integrationAssetId,
}: {
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
}) {
  const admin =
    createAdminClient();

  const {
    data: rawConnection,
    error: connectionError,
  } =
    await admin
      .from(
        "integration_connections",
      )
      .select(
        "id,organization_id,provider,status",
      )
      .eq(
        "id",
        connectionId,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .maybeSingle();

  const connection =
    rawConnection as unknown as
      | MetaConnectionRow
      | null;

  if (
    connectionError ||
    !connection ||
    connection.provider !== "meta" ||
    connection.status !== "connected"
  ) {
    throw new Error(
      "Meta conversion destination discovery requires an active Meta connection.",
    );
  }


  const {
    data: rawAsset,
    error: assetError,
  } =
    await admin
      .from(
        "integration_assets",
      )
      .select(
        "id,organization_id,connection_id,asset_type,external_id,status,is_selected",
      )
      .eq(
        "id",
        integrationAssetId,
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "connection_id",
        connectionId,
      )
      .maybeSingle();

  const asset =
    rawAsset as unknown as
      | MetaAdAccountAssetRow
      | null;

  if (
    assetError ||
    !asset ||
    asset.asset_type !==
      "meta_ad_account" ||
    asset.is_selected !== true ||
    asset.status ===
      "unavailable"
  ) {
    throw new Error(
      "Meta conversion destination discovery requires the selected Meta ad account.",
    );
  }


  const adAccountId =
    normalizeMetaId(
      asset.external_id,
    );

  if (!adAccountId) {
    throw new Error(
      "Selected Meta ad account has an invalid account ID.",
    );
  }


  return {
    connection,
    asset,
    adAccountId,
  };
}


export async function discoverMetaConversionDestinations({
  organizationId,
  connectionId,
  integrationAssetId,
}: {
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
}): Promise<
  MetaConversionDestinationDiscovery
> {
  if (
    !organizationId?.trim() ||
    !connectionId?.trim() ||
    !integrationAssetId?.trim()
  ) {
    throw new Error(
      "Meta conversion destination discovery requires organizationId, connectionId and integrationAssetId.",
    );
  }


  const resolved =
    await resolveSelectedMetaAdAccount({
      organizationId,
      connectionId,
      integrationAssetId,
    });

  const accessToken =
    await getMetaAccessTokenForConnection(
      connectionId,
      {
        organizationId,
      },
    );

  const version =
    metaGraphVersion();

  const destinations:
    MetaConversionDestination[] =
    [];

  const seen =
    new Set<string>();

  let after:
    | string
    | null =
    null;


  for (
    let page = 0;
    page < MAX_PIXEL_PAGES;
    page += 1
  ) {
    const url =
      new URL(
        `https://graph.facebook.com/${version}/act_${resolved.adAccountId}/adspixels`,
      );

    url.searchParams.set(
      "fields",
      "id,name,last_fired_time",
    );

    url.searchParams.set(
      "limit",
      String(PAGE_SIZE),
    );

    if (after) {
      url.searchParams.set(
        "after",
        after,
      );
    }


    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          cache:
            "no-store",
        },
      );

    const payload =
      await parseMetaPixelResponse(
        response,
      );


    for (
      const pixel of
        payload.data ??
        []
    ) {
      const datasetId =
        normalizeMetaId(
          stringValue(
            pixel.id,
          ),
        );

      if (
        !datasetId ||
        seen.has(datasetId)
      ) {
        continue;
      }

      seen.add(
        datasetId,
      );

      destinations.push({
        datasetId,

        name:
          stringValue(
            pixel.name,
          ) ??
          `Meta Dataset ${datasetId}`,

        lastFiredAt:
          normalizeTimestamp(
            pixel.last_fired_time,
          ),
      });
    }


    const nextAfter =
      stringValue(
        payload.paging
          ?.cursors
          ?.after,
      );

    if (
      !nextAfter ||
      nextAfter === after ||
      (
        payload.data ??
        []
      ).length < PAGE_SIZE
    ) {
      break;
    }

    after =
      nextAfter;
  }


  return {
    organizationId,
    connectionId,
    integrationAssetId,
    adAccountId:
      resolved.adAccountId,
    destinations,
  };
}


export async function verifyMetaConversionDestination({
  organizationId,
  connectionId,
  integrationAssetId,
  datasetId,
}: {
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
  datasetId: string;
}) {
  const normalizedDatasetId =
    normalizeMetaId(
      datasetId,
    );

  if (!normalizedDatasetId) {
    return null;
  }

  const discovery =
    await discoverMetaConversionDestinations({
      organizationId,
      connectionId,
      integrationAssetId,
    });

  return (
    discovery.destinations.find(
      (destination) =>
        destination.datasetId ===
        normalizedDatasetId,
    ) ??
    null
  );
}
