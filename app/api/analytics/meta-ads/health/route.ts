import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getCurrentOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to resolve current organization: user is not authenticated.",
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(2);

  if (membershipError) {
    throw new Error(
      `Unable to resolve current organization: ${membershipError.message}`,
    );
  }

  if (!memberships || memberships.length === 0) {
    throw new Error(
      "Unable to resolve current organization: no active organization membership found.",
    );
  }

  if (memberships.length > 1) {
    throw new Error(
      "Unable to resolve current organization: multiple active organization memberships found. Workspace switching is required.",
    );
  }

  return memberships[0].organization_id;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const organizationId = await getCurrentOrganizationId(supabase);

    const [
      healthResult,
      overviewResult,
      campaignsResult,
      adsetsResult,
      adsResult,
      publishersResult,
      countriesResult,
      devicesResult,
      runsResult,
    ] = await Promise.all([
      supabase
        .from("v_meta_ads_sync_health")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle(),

      supabase
        .from("v_meta_ads_30d_overview")
        .select("*")
        .eq("organization_id", organizationId),

      supabase
        .from("v_meta_ads_campaign_30d")
        .select("*", {
          count: "exact",

          head: true,
        })
        .eq("organization_id", organizationId),

      supabase
        .from("v_meta_ads_adset_30d")
        .select("*", {
          count: "exact",

          head: true,
        })
        .eq("organization_id", organizationId),

      supabase
        .from("v_meta_ads_ad_30d")
        .select("*", {
          count: "exact",

          head: true,
        })
        .eq("organization_id", organizationId),

      supabase
        .from("v_meta_ads_publisher_30d")
        .select("*", {
          count: "exact",

          head: true,
        })
        .eq("organization_id", organizationId),

      supabase
        .from("v_meta_ads_country_30d")
        .select("*", {
          count: "exact",

          head: true,
        })
        .eq("organization_id", organizationId),

      supabase
        .from("v_meta_ads_device_30d")
        .select("*", {
          count: "exact",

          head: true,
        })
        .eq("organization_id", organizationId),

      supabase
        .from("meta_ads_sync_runs")
        .select(
          `
            id,
            ad_account_id,
            start_date,
            end_date,
            status,
            triggered_by,
            campaign_rows,
            adset_rows,
            ad_rows,
            publisher_rows,
            country_rows,
            device_rows,
            total_rows,
            error_message,
            request_metadata,
            started_at,
            completed_at
          `,
        )
        .eq("organization_id", organizationId)
        .order("started_at", {
          ascending: false,
        })
        .limit(10),
    ]);

    const errors = [
      healthResult.error,
      overviewResult.error,
      campaignsResult.error,
      adsetsResult.error,
      adsResult.error,
      publishersResult.error,
      countriesResult.error,
      devicesResult.error,
      runsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors.map((error) => error?.message).join(" | "));
    }

    return NextResponse.json({
      ok: true,

      health: healthResult.data ?? null,

      overview: overviewResult.data ?? [],

      counts: {
        campaigns: campaignsResult.count ?? 0,

        adsets: adsetsResult.count ?? 0,

        ads: adsResult.count ?? 0,

        publishers: publishersResult.count ?? 0,

        countries: countriesResult.count ?? 0,

        devices: devicesResult.count ?? 0,
      },

      recentRuns: runsResult.data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Meta Ads health error";

    console.error("Meta Ads health check failed:", error);

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
