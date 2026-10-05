import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type FunnelMainData = {
  overview: unknown;
  daily: unknown[];
  newReturning: unknown[];
  sources: unknown[];
  firstTouch: unknown[];
  landingPages: unknown[];
  countries: unknown[];
  events: unknown[];
  repeat: unknown;
  distribution: unknown[];
};

export type GoogleAdsBusinessData = {
  overview: unknown;
  campaigns: unknown[];
  coverage: unknown;
  matches: unknown[];
  unmatchedCount: number;
};

export type MetaAdsBusinessData = {
  overview: unknown;
  coverage: unknown;
  campaigns: unknown[];
  adsets: unknown[];
  ads: unknown[];
};

export type FunnelWorkspace = {
  funnel: FunnelMainData;
  googleAds: GoogleAdsBusinessData;
  metaAds: MetaAdsBusinessData;
  fallback: boolean;
  warning: string | null;
};

type RpcPayload = {
  funnel?: {
    overview?: unknown;
    daily?: unknown[];
    new_returning?: unknown[];
    sources?: unknown[];
    first_touch?: unknown[];
    landing_pages?: unknown[];
    countries?: unknown[];
    events?: unknown[];
    repeat?: unknown;
    distribution?: unknown[];
  };

  google_ads?: {
    overview?: unknown;
    campaigns?: unknown[];
    coverage?: unknown;
    matches?: unknown[];
    unmatched_count?: unknown;
  };

  meta_ads?: {
    overview?: unknown;
    coverage?: unknown;
    campaigns?: unknown[];
    adsets?: unknown[];
    ads?: unknown[];
  };
};

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

  return requireCurrentOrganizationId(
    supabase,
    user.id,
  );
}

export async function getFunnelWorkspace(): Promise<FunnelWorkspace> {
  const supabase = await createClient();

  const organizationId = await getCurrentOrganizationId(supabase);

  const { data, error } = await supabase.rpc("get_funnel_workspace", {
    p_organization_id: organizationId,
  });

  if (!error) {
    return parseRpcPayload((data ?? {}) as RpcPayload);
  }

  /*
   * Safe fallback:
   * preserve the current direct-view implementation if
   * the compact workspace RPC is unavailable.
   */
  const fallback = await getLegacyWorkspace(
    supabase,
    organizationId,
  );

  return {
    ...fallback,
    fallback: true,
    warning: `Optimized Funnel read model unavailable: ${error.message}`,
  };
}

function parseRpcPayload(payload: RpcPayload): FunnelWorkspace {
  const funnel = payload.funnel ?? {};

  const google = payload.google_ads ?? {};

  const meta = payload.meta_ads ?? {};

  return {
    funnel: {
      overview: funnel.overview ?? {},
      daily: funnel.daily ?? [],
      newReturning: funnel.new_returning ?? [],
      sources: funnel.sources ?? [],
      firstTouch: funnel.first_touch ?? [],
      landingPages: funnel.landing_pages ?? [],
      countries: funnel.countries ?? [],
      events: funnel.events ?? [],
      repeat: funnel.repeat ?? {},
      distribution: funnel.distribution ?? [],
    },

    googleAds: {
      overview: google.overview ?? {},
      campaigns: google.campaigns ?? [],
      coverage: google.coverage ?? {},
      matches: google.matches ?? [],
      unmatchedCount: toNumber(google.unmatched_count),
    },

    metaAds: {
      overview: meta.overview ?? {},
      coverage: meta.coverage ?? {},
      campaigns: meta.campaigns ?? [],
      adsets: meta.adsets ?? [],
      ads: meta.ads ?? [],
    },

    fallback: false,
    warning: null,
  };
}

async function getLegacyWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<Omit<FunnelWorkspace, "fallback" | "warning">> {
  const [
    overviewResult,
    dailyResult,
    newReturningResult,
    sourceResult,
    firstTouchResult,
    landingResult,
    countryResult,
    eventResult,
    repeatResult,
    distributionResult,

    googleOverviewResult,
    googleCampaignsResult,
    googleCoverageResult,
    googleMatchesResult,
    googleUnmatchedResult,

    metaOverviewResult,
    metaCoverageResult,
    metaCampaignsResult,
    metaAdsetsResult,
    metaAdsResult,
  ] = await Promise.all([
    supabase
      .from("v_end_to_end_funnel_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),

    supabase
      .from("v_funnel_daily_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("date", {
        ascending: true,
      }),

    supabase
      .from("v_funnel_new_returning_30d")
      .select("*")
      .eq("organization_id", organizationId),

    supabase
      .from("v_funnel_source_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sessions", {
        ascending: false,
      })
      .limit(20),

    supabase
      .from("v_first_touch_source_funnel_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("leads", {
        ascending: false,
      })
      .limit(20),

    supabase
      .from("v_funnel_landing_page_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sessions", {
        ascending: false,
      })
      .limit(20),

    supabase
      .from("v_funnel_country_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sessions", {
        ascending: false,
      })
      .limit(20),

    supabase
      .from("v_funnel_event_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("event_count", {
        ascending: false,
      }),

    supabase
      .from("v_repeat_visit_summary")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),

    supabase
      .from("v_conversion_visit_distribution")
      .select("*")
      .eq("organization_id", organizationId),

    supabase
      .from("v_google_ads_crm_overview_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),

    supabase
      .from("v_google_ads_campaign_crm_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("spend", {
        ascending: false,
      }),

    supabase
      .from("v_google_ads_attribution_coverage")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),

    supabase
      .from("v_google_ads_campaign_match_diagnostic")
      .select("*")
      .eq("organization_id", organizationId)
      .order("touchpoints", {
        ascending: false,
      })
      .limit(12),

    supabase
      .from("v_google_ads_unmatched_paid_leads")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", organizationId),

    supabase
      .from("v_meta_ads_crm_overview_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),

    supabase
      .from("v_meta_ads_attribution_coverage")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),

    supabase
      .from("v_meta_ads_campaign_crm_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("spend", {
        ascending: false,
      }),

    supabase
      .from("v_meta_ads_adset_crm_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("spend", {
        ascending: false,
      })
      .limit(12),

    supabase
      .from("v_meta_ads_ad_crm_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("spend", {
        ascending: false,
      })
      .limit(12),
  ]);

  const errors = [
    overviewResult.error,
    dailyResult.error,
    newReturningResult.error,
    sourceResult.error,
    firstTouchResult.error,
    landingResult.error,
    countryResult.error,
    eventResult.error,
    repeatResult.error,
    distributionResult.error,

    googleOverviewResult.error,
    googleCampaignsResult.error,
    googleCoverageResult.error,
    googleMatchesResult.error,
    googleUnmatchedResult.error,

    metaOverviewResult.error,
    metaCoverageResult.error,
    metaCampaignsResult.error,
    metaAdsetsResult.error,
    metaAdsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load Funnel workspace: ${errors
        .map((item) => item?.message)
        .join(" | ")}`,
    );
  }

  return {
    funnel: {
      overview: overviewResult.data ?? {},
      daily: dailyResult.data ?? [],
      newReturning: newReturningResult.data ?? [],
      sources: sourceResult.data ?? [],
      firstTouch: firstTouchResult.data ?? [],
      landingPages: landingResult.data ?? [],
      countries: countryResult.data ?? [],
      events: eventResult.data ?? [],
      repeat: repeatResult.data ?? {},
      distribution: distributionResult.data ?? [],
    },

    googleAds: {
      overview: googleOverviewResult.data ?? {},
      campaigns: googleCampaignsResult.data ?? [],
      coverage: googleCoverageResult.data ?? {},
      matches: googleMatchesResult.data ?? [],
      unmatchedCount: googleUnmatchedResult.count ?? 0,
    },

    metaAds: {
      overview: metaOverviewResult.data ?? {},
      coverage: metaCoverageResult.data ?? {},
      campaigns: metaCampaignsResult.data ?? [],
      adsets: metaAdsetsResult.data ?? [],
      ads: metaAdsResult.data ?? [],
    },
  };
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}