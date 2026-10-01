import { NextRequest, NextResponse } from "next/server";

import {
  createGa4AdminClient,
  resolveGa4Runtime,
  syncGa4ToSupabase,
} from "@/lib/ga4";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export const maxDuration = 60;

type SyncRange = {
  startDate: string;
  endDate: string;
};

/* =========================================================
   AUTHORIZATION
========================================================= */

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  const secrets = [process.env.GA4_SYNC_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    throw new Error("GA4_SYNC_SECRET or CRON_SECRET is not configured.");
  }

  return secrets.some((secret) => authorization === `Bearer ${secret}`);
}

/* =========================================================
   DATE HELPERS
========================================================= */

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): SyncRange {
  /*
   * Re-sync the latest 7 completed UTC days.
   *
   * GA4 can revise recent historical data, so using a rolling
   * 7-day window is safer than importing only yesterday.
   */
  const now = new Date();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );

  const start = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 6),
  );

  return {
    startDate: isoDate(start),

    endDate: isoDate(end),
  };
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateRange(startDate: string, endDate: string) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("startDate and endDate must use YYYY-MM-DD.");
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
    throw new Error("A single GA4 sync is limited to 93 days.");
  }
}

/* =========================================================
   SHARED SYNC RUNNER
========================================================= */

async function executeSync(range: SyncRange) {
  const { startDate, endDate } = range;

  validateRange(startDate, endDate);

  /*
   * Resolve the selected GA4 property + Google credential.
   *
   * During migration this prefers Account Integrations OAuth,
   * but lib/ga4.ts retains the legacy Vercel OIDC/WIF path as
   * a safe fallback until production OAuth has been verified.
   */
  const ga4Runtime = await resolveGa4Runtime();

  const propertyId = ga4Runtime.propertyId;

  if (ga4Runtime.authSource === "legacy_wif" && ga4Runtime.fallbackReason) {
    console.warn("GA4 integration fallback:", ga4Runtime.fallbackReason);
  }

  const supabase = createGa4AdminClient();

  const {
    data: syncRun,

    error: insertError,
  } = await supabase
    .from("ga4_sync_runs")
    .insert({
      property_id: propertyId,

      status: "running",

      from_date: startDate,

      to_date: endDate,
    })
    .select("id")
    .single();

  if (insertError || !syncRun) {
    throw new Error(
      `Unable to create GA4 sync log: ${
        insertError?.message || "Unknown error"
      }`,
    );
  }

  try {
    const counts = await syncGa4ToSupabase(
      {
        startDate,
        endDate,
      },
      ga4Runtime,
    );

    const { error: updateError } = await supabase
      .from("ga4_sync_runs")
      .update({
        status: "completed",

        overview_rows: counts.overviewRows,

        source_rows: counts.sourceRows,

        landing_page_rows: counts.landingPageRows,

        campaign_rows: counts.campaignRows,

        country_rows: counts.countryRows,

        total_rows: counts.totalRows,

        completed_at: new Date().toISOString(),

        error_message: null,
      })
      .eq("id", syncRun.id);

    if (updateError) {
      throw new Error(
        `GA4 data synced, but the sync log could not be finalized: ${updateError.message}`,
      );
    }

    return {
      ok: true,
      propertyId,
      authSource: ga4Runtime.authSource,
      fallbackReason:
        ga4Runtime.authSource === "legacy_wif"
          ? (ga4Runtime.fallbackReason ??
            "Unknown integration fallback reason.")
          : null,
      startDate,
      endDate,
      counts,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown GA4 sync error";

    await supabase
      .from("ga4_sync_runs")
      .update({
        status: "failed",

        completed_at: new Date().toISOString(),

        error_message: message,
      })
      .eq("id", syncRun.id);

    throw error;
  }
}

/* =========================================================
   GET
   Used automatically by Vercel Cron.
========================================================= */

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const result = await executeSync(defaultRange());

    return NextResponse.json({
      ...result,
      trigger: "cron",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown GA4 sync error";

    console.error("GA4 cron sync failed:", error);

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

/* =========================================================
   POST
   Preserves your existing manual sync endpoint.
========================================================= */

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const defaults = defaultRange();

    let body: {
      startDate?: string;
      endDate?: string;
    } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const result = await executeSync({
      startDate: body.startDate || defaults.startDate,

      endDate: body.endDate || defaults.endDate,
    });

    return NextResponse.json({
      ...result,
      trigger: "manual",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown GA4 sync error";

    console.error("GA4 manual sync failed:", error);

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
