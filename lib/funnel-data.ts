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

  console.error("Funnel V2 read degraded:", v2Result.error.message);

  // Rollback/compatibility path: keep the existing aggregate RPC available while
  // V2 is being deployed or if it ever degrades independently.
  const legacyRpcResult = await supabase.rpc("get_funnel_workspace", {
    p_organization_id: organizationId,
  });

  if (!legacyRpcResult.error) {
    return applyProviderVisibility(
      {
        ...parseRpcPayload((legacyRpcResult.data ?? {}) as RpcPayload),
        fallback: true,
        warning:
          `Funnel V2 unavailable: ${v2Result.error.message}. ` +
          "Loaded the previous aggregate read model.",
      },
      visibility,
    );
  }

  console.error(
    "Funnel compatibility RPC degraded:",
    legacyRpcResult.error.message,
  );

  const fallback = await getMinimalLegacyWorkspace(
    supabase,
    organizationId,
  );

  return applyProviderVisibility(
    {
      ...fallback,
      fallback: true,
      warning:
        `Funnel read models unavailable: ${v2Result.error.message}; ` +
        `${legacyRpcResult.error.message}. ` +
        "Loaded a reduced compatibility view to protect database health.",
    },
    visibility,
  );
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

async function getMinimalLegacyWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Omit<FunnelWorkspace, "fallback" | "warning">> {
  const [overviewResult, dailyResult, sourceResult] = await Promise.all([
    supabase
      .from("v_end_to_end_funnel_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("v_funnel_daily_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("date", { ascending: true }),
    supabase
      .from("v_funnel_source_30d")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sessions", { ascending: false })
      .limit(20),
  ]);

  for (const [label, result] of [
    ["overview", overviewResult],
    ["daily", dailyResult],
    ["source", sourceResult],
  ] as const) {
    if (result.error) {
      console.error(`Funnel fallback ${label} read degraded:`, result.error.message);
    }
  }

  return {
    funnel: {
      overview: overviewResult.error ? {} : overviewResult.data ?? {},
      daily: dailyResult.error ? [] : dailyResult.data ?? [],
      newReturning: [],
      sources: sourceResult.error ? [] : sourceResult.data ?? [],
      firstTouch: [],
      landingPages: [],
      countries: [],
      events: [],
      repeat: {},
      distribution: [],
    },
    googleAds: emptyGoogleAds(),
    metaAds: emptyMetaAds(),
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
      : emptyGoogleAds(),
    metaAds: visibility.metaConnected
      ? workspace.metaAds
      : emptyMetaAds(),
  };
}

function emptyGoogleAds(): GoogleAdsBusinessData {
  return {
    overview: {},
    campaigns: [],
    coverage: {},
    matches: [],
    unmatchedCount: 0,
  };
}

function emptyMetaAds(): MetaAdsBusinessData {
  return {
    overview: {},
    coverage: {},
    campaigns: [],
    adsets: [],
    ads: [],
  };
}

function isStatementTimeout(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");

  return (
    message.includes("statement timeout") ||
    message.includes("canceling statement")
  );
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
