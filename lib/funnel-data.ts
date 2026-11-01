import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import {
  getProviderVisibility,
  type ProviderVisibility,
} from "@/lib/integrations/provider-visibility";

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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function getCurrentOrganizationId(
  supabase: SupabaseClient,
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

  return requireCurrentOrganizationId(supabase, user.id);
}

export async function getFunnelWorkspace(): Promise<FunnelWorkspace> {
  const supabase = await createClient();
  const organizationId = await getCurrentOrganizationId(supabase);

  let visibility: ProviderVisibility = {
    organizationId,
    googleConnected: false,
    metaConnected: false,
    instagramConnected: false,
    whatsappConnected: false,
  };

  try {
    visibility = await getProviderVisibility(supabase);
  } catch (error) {
    if (!isStatementTimeout(error)) {
      throw error;
    }

    console.error(
      "Funnel provider visibility degraded:",
      error instanceof Error ? error.message : String(error),
    );
  }

  const v2Result = await supabase.rpc("get_funnel_workspace_v2", {
    p_organization_id: organizationId,
  });

  if (!v2Result.error) {
    return applyProviderVisibility(
      parseRpcPayload((v2Result.data ?? {}) as RpcPayload),
      visibility,
    );
  }

  if (!isStatementTimeout(v2Result.error)) {
    throw new Error(`Unable to load funnel workspace: ${v2Result.error.message}`);
  }

  console.error(
    "Funnel workspace v2 timed out; using bounded fallback:",
    v2Result.error.message,
  );

  return applyProviderVisibility(
    await getBoundedFallbackWorkspace(supabase, organizationId),
    visibility,
  );
}

function parseRpcPayload(payload: RpcPayload): FunnelWorkspace {
  return {
    funnel: {
      overview: payload.funnel?.overview ?? {},
      daily: payload.funnel?.daily ?? [],
      newReturning: payload.funnel?.new_returning ?? [],
      sources: payload.funnel?.sources ?? [],
      firstTouch: payload.funnel?.first_touch ?? [],
      landingPages: payload.funnel?.landing_pages ?? [],
      countries: payload.funnel?.countries ?? [],
      events: payload.funnel?.events ?? [],
      repeat: payload.funnel?.repeat ?? {},
      distribution: payload.funnel?.distribution ?? [],
    },
    googleAds: {
      overview: payload.google_ads?.overview ?? {},
      campaigns: payload.google_ads?.campaigns ?? [],
      coverage: payload.google_ads?.coverage ?? {},
      matches: payload.google_ads?.matches ?? [],
      unmatchedCount: Number(payload.google_ads?.unmatched_count ?? 0),
    },
    metaAds: {
      overview: payload.meta_ads?.overview ?? {},
      coverage: payload.meta_ads?.coverage ?? {},
      campaigns: payload.meta_ads?.campaigns ?? [],
      adsets: payload.meta_ads?.adsets ?? [],
      ads: payload.meta_ads?.ads ?? [],
    },
    fallback: false,
    warning: null,
  };
}

function applyProviderVisibility(
  workspace: FunnelWorkspace,
  visibility: ProviderVisibility,
): FunnelWorkspace {
  return {
    ...workspace,
    googleAds: visibility.googleConnected
      ? workspace.googleAds
      : {
          overview: {},
          campaigns: [],
          coverage: {},
          matches: [],
          unmatchedCount: 0,
        },
    metaAds: visibility.metaConnected
      ? workspace.metaAds
      : {
          overview: {},
          coverage: {},
          campaigns: [],
          adsets: [],
          ads: [],
        },
  };
}

async function getBoundedFallbackWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<FunnelWorkspace> {
  const [summaryResult, dailyResult, sourcesResult, countriesResult] =
    await Promise.all([
      supabase
        .from("analytics_daily_funnel")
        .select("sessions, users, leads, cta_clicks, form_starts, form_submits")
        .eq("organization_id", organizationId)
        .order("date", { ascending: false })
        .limit(90),
      supabase
        .from("analytics_daily_funnel")
        .select("date, sessions, users, leads, cta_clicks, form_starts, form_submits")
        .eq("organization_id", organizationId)
        .order("date", { ascending: false })
        .limit(90),
      supabase
        .from("analytics_source_summary")
        .select("source, medium, sessions, users, leads")
        .eq("organization_id", organizationId)
        .order("sessions", { ascending: false })
        .limit(100),
      supabase
        .from("analytics_country_summary")
        .select("country, sessions, users, leads")
        .eq("organization_id", organizationId)
        .order("sessions", { ascending: false })
        .limit(100),
    ]);

  for (const result of [
    summaryResult,
    dailyResult,
    sourcesResult,
    countriesResult,
  ]) {
    if (result.error && !isMissingRelation(result.error)) {
      throw new Error(`Unable to load funnel fallback: ${result.error.message}`);
    }
  }

  const summaryRows = summaryResult.data ?? [];
  const overview = summaryRows.reduce(
    (acc, row) => ({
      sessions: acc.sessions + Number(row.sessions ?? 0),
      users: acc.users + Number(row.users ?? 0),
      leads: acc.leads + Number(row.leads ?? 0),
      cta_clicks: acc.cta_clicks + Number(row.cta_clicks ?? 0),
      form_starts: acc.form_starts + Number(row.form_starts ?? 0),
      form_submits: acc.form_submits + Number(row.form_submits ?? 0),
    }),
    {
      sessions: 0,
      users: 0,
      leads: 0,
      cta_clicks: 0,
      form_starts: 0,
      form_submits: 0,
    },
  );

  return {
    funnel: {
      overview,
      daily: (dailyResult.data ?? []).slice().reverse(),
      newReturning: [],
      sources: sourcesResult.data ?? [],
      firstTouch: [],
      landingPages: [],
      countries: countriesResult.data ?? [],
      events: [],
      repeat: {},
      distribution: [],
    },
    googleAds: {
      overview: {},
      campaigns: [],
      coverage: {},
      matches: [],
      unmatchedCount: 0,
    },
    metaAds: {
      overview: {},
      coverage: {},
      campaigns: [],
      adsets: [],
      ads: [],
    },
    fallback: true,
    warning:
      "The canonical funnel RPC timed out. SalsysOS is showing a bounded analytics fallback; Ads detail is hidden unless provider visibility confirms the connection.",
  };
}

function isStatementTimeout(error: unknown) {
  const record = error as { code?: string; message?: string } | null;
  return (
    record?.code === "57014" ||
    String(record?.message ?? "").toLowerCase().includes("statement timeout")
  );
}

function isMissingRelation(error: unknown) {
  return (error as { code?: string } | null)?.code === "42P01";
}
