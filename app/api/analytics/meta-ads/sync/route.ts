import { NextRequest, NextResponse } from "next/server";

import {
  createMetaAdsAdminClient,
  getMetaApiVersion,
  normalizeMetaAdAccountId,
  syncMetaAdsToSupabase,
} from "@/lib/meta-ads";

export const dynamic = "force-dynamic";

export const maxDuration = 300;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SelectedMetaAsset = {
  id: string;
  organization_id: string | null;
  connection_id: string;
  external_id: string;
  status: string;
  is_selected: boolean;
};

type MetaConnection = {
  id: string;
  organization_id: string | null;
  provider: string;
  status: string;
};

type MetaAssetSyncResult = {
  ok: boolean;
  organizationId: string | null;
  connectionId: string;
  integrationAssetId: string;
  adAccountId: string;
  syncRunId: string | null;
  counts?: {
    campaignRows: number;
    adsetRows: number;
    adRows: number;
    publisherRows: number;
    countryRows: number;
    deviceRows: number;
    totalRows: number;
  };
  error?: string;
};

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return isoDate(date);
}

function validateRange(startDate: string, endDate: string) {
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw new Error("Dates must use YYYY-MM-DD.");
  }

  const start = new Date(`${startDate}T00:00:00Z`);

  const end = new Date(`${endDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date range.");
  }

  if (start > end) {
    throw new Error("startDate must be before or equal to endDate.");
  }

  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

  if (days > 93) {
    throw new Error("A single Meta Ads sync can cover at most 93 days.");
  }
}

function isAuthorized(request: NextRequest, allowCron = false) {
  const manualSecret = process.env.META_ADS_SYNC_SECRET?.trim();

  const cronSecret = process.env.CRON_SECRET?.trim();

  const headerSecret = request.headers.get("x-meta-ads-sync-secret")?.trim();

  const authorization = request.headers.get("authorization")?.trim();

  if (manualSecret && headerSecret === manualSecret) {
    return true;
  }

  if (manualSecret && authorization === `Bearer ${manualSecret}`) {
    return true;
  }

  if (allowCron && cronSecret && authorization === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

async function getSelectedMetaAssets() {
  const supabase = createMetaAdsAdminClient();

  const { data, error } = await supabase
    .from("integration_assets")
    .select(
      [
        "id",
        "organization_id",
        "connection_id",
        "external_id",
        "status",
        "is_selected",
      ].join(","),
    )
    .eq("asset_type", "meta_ad_account")
    .eq("is_selected", true)
    .neq("status", "unavailable");

  if (error) {
    throw new Error(
      `Unable to load selected Meta ad accounts: ${error.message}`,
    );
  }

  return (data ?? []) as unknown as SelectedMetaAsset[];
}

async function validateMetaConnection(asset: SelectedMetaAsset) {
  if (!asset.organization_id) {
    throw new Error("Selected Meta asset is missing organization_id.");
  }

  const supabase = createMetaAdsAdminClient();

  const { data, error } = await supabase
    .from("integration_connections")
    .select("id,organization_id,provider,status")
    .eq("id", asset.connection_id)
    .eq("organization_id", asset.organization_id)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      error?.message ??
        "Meta connection was not found for the selected asset organization.",
    );
  }

  const connection = data as unknown as MetaConnection;

  if (connection.provider !== "meta" || connection.status !== "connected") {
    throw new Error(
      "Selected Meta asset is not attached to an active Meta connection.",
    );
  }
}

async function runSyncForAsset({
  asset,
  startDate,
  endDate,
  triggeredBy,
}: {
  asset: SelectedMetaAsset;
  startDate: string;
  endDate: string;
  triggeredBy: string;
}): Promise<MetaAssetSyncResult> {
  await validateMetaConnection(asset);

  const organizationId = asset.organization_id;

  if (!organizationId) {
    throw new Error("Selected Meta asset is missing organization_id.");
  }

  const adAccountId = normalizeMetaAdAccountId(asset.external_id);

  if (!adAccountId) {
    throw new Error("Selected Meta asset is missing an ad account ID.");
  }

  const apiVersion = getMetaApiVersion();

  const supabase = createMetaAdsAdminClient();

  const { data: run, error: runError } = await supabase
    .from("meta_ads_sync_runs")
    .insert({
      organization_id: organizationId,

      connection_id: asset.connection_id,

      integration_asset_id: asset.id,

      ad_account_id: adAccountId,

      start_date: startDate,

      end_date: endDate,

      status: "running",

      triggered_by: triggeredBy,

      request_metadata: {
        api_version: apiVersion,
      },
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(
      `Unable to create Meta Ads sync run: ${runError?.message ?? "Unknown error"}`,
    );
  }

  try {
    const counts = await syncMetaAdsToSupabase({
      organizationId,
      connectionId: asset.connection_id,
      integrationAssetId: asset.id,
      adAccountId,
      startDate,
      endDate,
      syncRunId: run.id,
    });

    const { error: updateError } = await supabase
      .from("meta_ads_sync_runs")
      .update({
        status: "success",

        campaign_rows: counts.campaignRows,

        adset_rows: counts.adsetRows,

        ad_rows: counts.adRows,

        publisher_rows: counts.publisherRows,

        country_rows: counts.countryRows,

        device_rows: counts.deviceRows,

        total_rows: counts.totalRows,

        request_metadata: {
          api_version: apiVersion,
          counts,
        },

        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("organization_id", organizationId);

    if (updateError) {
      throw new Error(
        `Meta Ads data synced, but sync-run status could not be updated: ${updateError.message}`,
      );
    }

    return {
      ok: true,
      organizationId,
      connectionId: asset.connection_id,
      integrationAssetId: asset.id,
      adAccountId: `act_${adAccountId}`,
      syncRunId: run.id,
      counts,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Meta Ads sync error";

    await supabase
      .from("meta_ads_sync_runs")
      .update({
        status: "failed",

        error_message: message,

        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("organization_id", organizationId);

    return {
      ok: false,
      organizationId,
      connectionId: asset.connection_id,
      integrationAssetId: asset.id,
      adAccountId: `act_${adAccountId}`,
      syncRunId: run.id,
      error: message,
    };
  }
}

async function runSelectedMetaAssets({
  startDate,
  endDate,
  triggeredBy,
}: {
  startDate: string;
  endDate: string;
  triggeredBy: string;
}) {
  validateRange(startDate, endDate);

  const assets = await getSelectedMetaAssets();

  if (assets.length === 0) {
    throw new Error("No selected Meta ad-account assets were found.");
  }

  const results: MetaAssetSyncResult[] = [];

  for (const asset of assets) {
    try {
      results.push(
        await runSyncForAsset({
          asset,
          startDate,
          endDate,
          triggeredBy,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Meta Ads sync error";

      results.push({
        ok: false,
        organizationId: asset.organization_id,
        connectionId: asset.connection_id,
        integrationAssetId: asset.id,
        adAccountId: asset.external_id
          ? `act_${normalizeMetaAdAccountId(asset.external_id)}`
          : "",
        syncRunId: null,
        error: message,
      });
    }
  }

  const successful = results.filter((result) => result.ok).length;

  const failed = results.length - successful;

  return {
    ok: failed === 0,
    selectedAssets: assets.length,
    successful,
    failed,
    startDate,
    endDate,
    trigger: triggeredBy,
    results,
  };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request, true)) {
    return NextResponse.json(
      {
        ok: false,

        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      startDate?: string;
      endDate?: string;
    };

    const yesterday = isoDate(new Date(Date.now() - 86400000));

    const endDate = body.endDate ?? yesterday;

    const startDate = body.startDate ?? addUtcDays(endDate, -6);

    const result = await runSelectedMetaAssets({
      startDate,
      endDate,
      triggeredBy: "manual",
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Meta Ads sync error";

    console.error("Meta Ads manual sync failed:", error);

    return NextResponse.json(
      {
        ok: false,

        error: message,
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request, true)) {
    return NextResponse.json(
      {
        ok: false,

        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    /*
     * Refresh the previous seven completed days because Meta can
     * update attributed actions after the original ad interaction.
     */
    const endDate = isoDate(new Date(Date.now() - 86400000));

    const startDate = addUtcDays(endDate, -6);

    const result = await runSelectedMetaAssets({
      startDate,
      endDate,
      triggeredBy: "cron",
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Meta Ads cron error";

    console.error("Meta Ads cron sync failed:", error);

    return NextResponse.json(
      {
        ok: false,

        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
