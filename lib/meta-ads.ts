import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getMetaAccessTokenForConnection } from "@/lib/integrations/meta-connection";

const UPSERT_CHUNK_SIZE = 500;

type MetaInsightRow = {
  campaign_id?: string;
  campaign_name?: string;

  adset_id?: string;
  adset_name?: string;

  ad_id?: string;
  ad_name?: string;

  date_start?: string;
  date_stop?: string;

  publisher_platform?: string;
  platform_position?: string;
  country?: string;
  impression_device?: string;

  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;

  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;

  actions?: unknown[];
  action_values?: unknown[];
};

type MetaInsightsResponse = {
  data?: MetaInsightRow[];

  paging?: {
    next?: string;
  };

  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export type MetaAdsSyncCounts = {
  campaignRows: number;
  adsetRows: number;
  adRows: number;
  publisherRows: number;
  countryRows: number;
  deviceRows: number;
  totalRows: number;
};

type SyncMetaAdsOptions = {
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
  adAccountId: string;
  startDate: string;
  endDate: string;
  syncRunId?: string;
};

type MetaAssetRow = {
  id: string;
  organization_id: string | null;
  connection_id: string;
  asset_type: string;
  external_id: string;
  status: string;
  is_selected: boolean;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function normalizeMetaAdAccountId(value: string) {
  return value.replace(/^act_/i, "").trim();
}

export function getMetaAdAccountId() {
  return normalizeMetaAdAccountId(requireEnv("META_AD_ACCOUNT_ID"));
}

export function getMetaApiVersion() {
  return process.env.META_API_VERSION?.trim() || "v26.0";
}

export function createMetaAdsAdminClient(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();

  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase admin environment variables are not configured.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getMetaAccessTokenForSyncContext({
  supabase,
  organizationId,
  connectionId,
  integrationAssetId,
  adAccountId,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  connectionId: string;
  integrationAssetId: string;
  adAccountId: string;
}) {
  const normalizedAdAccountId = normalizeMetaAdAccountId(adAccountId);

  if (
    !organizationId ||
    !connectionId ||
    !integrationAssetId ||
    !normalizedAdAccountId
  ) {
    throw new Error("Meta sync context is incomplete.");
  }

  /*
   * Keep provider-asset authorization here.
   *
   * The generic connection helper intentionally knows nothing
   * about which Meta asset a workflow is authorized to use.
   */
  const { data: rawAsset, error: assetError } = await supabase
    .from("integration_assets")
    .select(
      [
        "id",
        "organization_id",
        "connection_id",
        "asset_type",
        "external_id",
        "status",
        "is_selected",
      ].join(","),
    )
    .eq("id", integrationAssetId)
    .eq("organization_id", organizationId)
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (assetError || !rawAsset) {
    throw new Error(
      assetError?.message ??
        "Meta ad-account asset was not found for this organization.",
    );
  }

  const asset = rawAsset as unknown as MetaAssetRow;

  if (
    asset.asset_type !== "meta_ad_account" ||
    asset.is_selected !== true ||
    asset.status === "unavailable" ||
    normalizeMetaAdAccountId(asset.external_id) !== normalizedAdAccountId
  ) {
    throw new Error(
      "Meta ad-account asset does not match the requested sync context.",
    );
  }

  return getMetaAccessTokenForConnection(
    connectionId,
    {
      organizationId,
    },
  );
}

function numberValue(value: string | number | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function intValue(value: string | number | null | undefined) {
  return Math.round(numberValue(value));
}

async function metaFetchJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",

    headers: {
      Authorization: `Bearer ${token}`,
    },

    cache: "no-store",
  });

  const rawText = await response.text();

  let payload: any = {};

  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(
      `Meta API returned non-JSON data (HTTP ${response.status}).`,
    );
  }

  if (!response.ok || payload?.error) {
    const error = payload?.error;

    const parts = [
      error?.message,
      error?.type ? `type=${error.type}` : null,
      error?.code != null ? `code=${error.code}` : null,
      error?.error_subcode != null ? `subcode=${error.error_subcode}` : null,
      error?.fbtrace_id ? `fbtrace_id=${error.fbtrace_id}` : null,
    ].filter(Boolean);

    throw new Error(
      parts.join(" | ") ||
        rawText ||
        `Meta API request failed with HTTP ${response.status}.`,
    );
  }

  return payload as T;
}

async function getAccountCurrency(
  token: string,
  version: string,
  adAccountId: string,
) {
  const url = new URL(
    `https://graph.facebook.com/${version}/act_${adAccountId}`,
  );

  url.searchParams.set("fields", "currency");

  const payload = await metaFetchJson<{
    currency?: string;
  }>(url.toString(), token);

  return payload.currency ?? null;
}

async function queryInsights({
  token,
  version,
  adAccountId,
  startDate,
  endDate,
  level,
  breakdowns,
}: {
  token: string;
  version: string;
  adAccountId: string;
  startDate: string;
  endDate: string;
  level: "account" | "campaign" | "adset" | "ad";
  breakdowns?: string[];
}) {
  const fields = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "date_start",
    "date_stop",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "inline_link_clicks",
    "ctr",
    "cpc",
    "cpm",
    "frequency",
    "actions",
    "action_values",
  ];

  let nextUrl: string | undefined;

  const firstUrl = new URL(
    `https://graph.facebook.com/${version}/act_${adAccountId}/insights`,
  );

  firstUrl.searchParams.set("fields", fields.join(","));

  firstUrl.searchParams.set("level", level);

  firstUrl.searchParams.set("time_increment", "1");

  firstUrl.searchParams.set(
    "time_range",
    JSON.stringify({
      since: startDate,
      until: endDate,
    }),
  );

  firstUrl.searchParams.set("limit", "500");

  if (breakdowns && breakdowns.length > 0) {
    firstUrl.searchParams.set("breakdowns", breakdowns.join(","));
  }

  nextUrl = firstUrl.toString();

  const rows: MetaInsightRow[] = [];

  while (nextUrl) {
    const payload: MetaInsightsResponse =
      await metaFetchJson<MetaInsightsResponse>(nextUrl, token);

    if (Array.isArray(payload.data)) {
      rows.push(...payload.data);
    }

    nextUrl = payload.paging?.next;
  }

  return rows;
}

async function clearRange(
  supabase: SupabaseClient,
  table: string,
  organizationId: string,
  adAccountId: string,
  startDate: string,
  endDate: string,
) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("organization_id", organizationId)
    .eq("ad_account_id", adAccountId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (error) {
    throw new Error(`Unable to clear ${table}: ${error.message}`);
  }
}

async function upsertInChunks(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  if (rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);

    const { error } = await supabase.from(table).upsert(chunk, {
      onConflict,
    });

    if (error) {
      throw new Error(`Unable to upsert ${table}: ${error.message}`);
    }
  }
}

function commonMetrics(row: MetaInsightRow) {
  return {
    spend: numberValue(row.spend),

    impressions: intValue(row.impressions),

    reach: intValue(row.reach),

    clicks: intValue(row.clicks),

    inline_link_clicks: intValue(row.inline_link_clicks),

    ctr: numberValue(row.ctr),

    cpc: numberValue(row.cpc),

    cpm: numberValue(row.cpm),

    frequency: numberValue(row.frequency),

    actions: Array.isArray(row.actions) ? row.actions : [],

    action_values: Array.isArray(row.action_values) ? row.action_values : [],
  };
}

export async function syncMetaAdsToSupabase({
  organizationId,
  connectionId,
  integrationAssetId,
  adAccountId: requestedAdAccountId,
  startDate,
  endDate,
  syncRunId,
}: SyncMetaAdsOptions): Promise<MetaAdsSyncCounts> {
  const adAccountId = normalizeMetaAdAccountId(requestedAdAccountId);

  const supabase = createMetaAdsAdminClient();

  const token = await getMetaAccessTokenForSyncContext({
    supabase,
    organizationId,
    connectionId,
    integrationAssetId,
    adAccountId,
  });

  const version = getMetaApiVersion();

  const currencyCode = await getAccountCurrency(token, version, adAccountId);

  /*
   * Fetch all report types before deleting any cached rows.
   * Existing data remains intact if Meta rejects a query.
   */
  const [
    campaignApiRows,
    adsetApiRows,
    adApiRows,
    publisherApiRows,
    countryApiRows,
    deviceApiRows,
  ] = await Promise.all([
    queryInsights({
      token,
      version,
      adAccountId,
      startDate,
      endDate,
      level: "campaign",
    }),

    queryInsights({
      token,
      version,
      adAccountId,
      startDate,
      endDate,
      level: "adset",
    }),

    queryInsights({
      token,
      version,
      adAccountId,
      startDate,
      endDate,
      level: "ad",
    }),

    queryInsights({
      token,
      version,
      adAccountId,
      startDate,
      endDate,
      level: "account",
      breakdowns: ["publisher_platform", "platform_position"],
    }),

    queryInsights({
      token,
      version,
      adAccountId,
      startDate,
      endDate,
      level: "account",
      breakdowns: ["country"],
    }),

    queryInsights({
      token,
      version,
      adAccountId,
      startDate,
      endDate,
      level: "account",
      breakdowns: ["impression_device"],
    }),
  ]);

  const campaignRows = campaignApiRows
    .map((row) => ({
      organization_id: organizationId,

      ad_account_id: adAccountId,

      date: row.date_start,

      campaign_id: row.campaign_id ?? "",

      campaign_name: row.campaign_name ?? null,

      objective: null,

      currency_code: currencyCode,

      ...commonMetrics(row),

      sync_run_id: syncRunId ?? null,
    }))
    .filter((row) => Boolean(row.date && row.campaign_id));

  const adsetRows = adsetApiRows
    .map((row) => ({
      organization_id: organizationId,

      ad_account_id: adAccountId,

      date: row.date_start,

      campaign_id: row.campaign_id ?? "",

      campaign_name: row.campaign_name ?? null,

      adset_id: row.adset_id ?? "",

      adset_name: row.adset_name ?? null,

      currency_code: currencyCode,

      ...commonMetrics(row),

      sync_run_id: syncRunId ?? null,
    }))
    .filter((row) => Boolean(row.date && row.campaign_id && row.adset_id));

  const adRows = adApiRows
    .map((row) => ({
      organization_id: organizationId,

      ad_account_id: adAccountId,

      date: row.date_start,

      campaign_id: row.campaign_id ?? "",

      campaign_name: row.campaign_name ?? null,

      adset_id: row.adset_id ?? "",

      adset_name: row.adset_name ?? null,

      ad_id: row.ad_id ?? "",

      ad_name: row.ad_name ?? null,

      currency_code: currencyCode,

      ...commonMetrics(row),

      sync_run_id: syncRunId ?? null,
    }))
    .filter((row) =>
      Boolean(row.date && row.campaign_id && row.adset_id && row.ad_id),
    );

  const publisherRows = publisherApiRows
    .map((row) => ({
      organization_id: organizationId,

      ad_account_id: adAccountId,

      date: row.date_start,

      publisher_platform: row.publisher_platform ?? "unknown",

      platform_position: row.platform_position ?? "unknown",

      currency_code: currencyCode,

      spend: numberValue(row.spend),

      impressions: intValue(row.impressions),

      reach: intValue(row.reach),

      clicks: intValue(row.clicks),

      inline_link_clicks: intValue(row.inline_link_clicks),

      ctr: numberValue(row.ctr),

      cpc: numberValue(row.cpc),

      cpm: numberValue(row.cpm),

      actions: Array.isArray(row.actions) ? row.actions : [],

      action_values: Array.isArray(row.action_values) ? row.action_values : [],

      sync_run_id: syncRunId ?? null,
    }))
    .filter((row) => Boolean(row.date && row.publisher_platform));

  const countryRows = countryApiRows
    .map((row) => ({
      organization_id: organizationId,

      ad_account_id: adAccountId,

      date: row.date_start,

      country: row.country ?? "unknown",

      currency_code: currencyCode,
      spend: numberValue(row.spend),

      impressions: intValue(row.impressions),

      reach: intValue(row.reach),

      clicks: intValue(row.clicks),

      inline_link_clicks: intValue(row.inline_link_clicks),

      ctr: numberValue(row.ctr),

      cpc: numberValue(row.cpc),

      cpm: numberValue(row.cpm),

      actions: Array.isArray(row.actions) ? row.actions : [],

      action_values: Array.isArray(row.action_values) ? row.action_values : [],

      sync_run_id: syncRunId ?? null,
    }))
    .filter((row) => Boolean(row.date && row.country));

  const deviceRows = deviceApiRows
    .map((row) => ({
      organization_id: organizationId,

      ad_account_id: adAccountId,

      date: row.date_start,

      impression_device: row.impression_device ?? "unknown",

      currency_code: currencyCode,

      spend: numberValue(row.spend),

      impressions: intValue(row.impressions),

      reach: intValue(row.reach),

      clicks: intValue(row.clicks),

      inline_link_clicks: intValue(row.inline_link_clicks),

      ctr: numberValue(row.ctr),

      cpc: numberValue(row.cpc),

      cpm: numberValue(row.cpm),

      actions: Array.isArray(row.actions) ? row.actions : [],

      action_values: Array.isArray(row.action_values) ? row.action_values : [],

      sync_run_id: syncRunId ?? null,
    }))
    .filter((row) => Boolean(row.date && row.impression_device));

  const tables = [
    "meta_ads_campaign_daily",
    "meta_ads_adset_daily",
    "meta_ads_ad_daily",
    "meta_ads_publisher_daily",
    "meta_ads_country_daily",
    "meta_ads_device_daily",
  ];

  for (const table of tables) {
    await clearRange(
      supabase,
      table,
      organizationId,
      adAccountId,
      startDate,
      endDate,
    );
  }

  await upsertInChunks(
    supabase,
    "meta_ads_campaign_daily",
    campaignRows,
    "organization_id,ad_account_id,date,campaign_id",
  );

  await upsertInChunks(
    supabase,
    "meta_ads_adset_daily",
    adsetRows,
    "organization_id,ad_account_id,date,campaign_id,adset_id",
  );

  await upsertInChunks(
    supabase,
    "meta_ads_ad_daily",
    adRows,
    "organization_id,ad_account_id,date,campaign_id,adset_id,ad_id",
  );

  await upsertInChunks(
    supabase,
    "meta_ads_publisher_daily",
    publisherRows,
    "organization_id,ad_account_id,date,publisher_platform,platform_position",
  );

  await upsertInChunks(
    supabase,
    "meta_ads_country_daily",
    countryRows,
    "organization_id,ad_account_id,date,country",
  );

  await upsertInChunks(
    supabase,
    "meta_ads_device_daily",
    deviceRows,
    "organization_id,ad_account_id,date,impression_device",
  );

  return {
    campaignRows: campaignRows.length,

    adsetRows: adsetRows.length,

    adRows: adRows.length,

    publisherRows: publisherRows.length,

    countryRows: countryRows.length,

    deviceRows: deviceRows.length,

    totalRows:
      campaignRows.length +
      adsetRows.length +
      adRows.length +
      publisherRows.length +
      countryRows.length +
      deviceRows.length,
  };
}
