import { createClient } from "@/lib/supabase/server";

export type OverviewRow = {
  range_start: string | null;
  range_end: string | null;

  ga4_sessions: number | string | null;
  ga4_page_views: number | string | null;
  ga4_new_users: number | string | null;
  ga4_avg_daily_users: number | string | null;
  ga4_engaged_sessions: number | string | null;
  ga4_engagement_rate: number | string | null;
  ga4_avg_session_duration: number | string | null;
  ga4_key_events: number | string | null;

  crm_sessions: number | string | null;
  crm_visitors: number | string | null;
  crm_page_views: number | string | null;
  crm_form_submits: number | string | null;
  crm_web_leads: number | string | null;
  crm_qualified_leads: number | string | null;
  crm_enrolled_leads: number | string | null;

  website_lead_conversion_rate: number | string | null;
};

type Ga4SourceRow = {
  source: string;
  medium: string;
  sessions: number | string | null;
  new_users: number | string | null;
  user_days: number | string | null;
  engaged_sessions: number | string | null;
  key_events: number | string | null;
};

type CrmSourceRow = {
  source: string;
  medium: string;
  lead_count: number | string | null;
  qualified_count: number | string | null;
  enrolled_count: number | string | null;
};

type CrmSourceRevenueRow = {
  source: string;
  medium: string;
  currency: string;
  net_revenue: number | string | null;
};

type Ga4LandingRow = {
  landing_page: string;
  sessions: number | string | null;
  user_days: number | string | null;
  engaged_sessions: number | string | null;
  key_events: number | string | null;
};

type CrmLandingRow = {
  landing_page: string;
  lead_count: number | string | null;
  qualified_count: number | string | null;
  enrolled_count: number | string | null;
};

type Ga4CampaignRow = {
  campaign: string;
  source: string;
  medium: string;
  sessions: number | string | null;
  engaged_sessions: number | string | null;
  key_events: number | string | null;
};

type CrmCampaignRow = {
  campaign: string;
  lead_count: number | string | null;
  qualified_count: number | string | null;
  enrolled_count: number | string | null;
};

type Ga4CountryRow = {
  country: string;
  sessions: number | string | null;
  user_days: number | string | null;
  engaged_sessions: number | string | null;
  key_events: number | string | null;
};

type CrmCountryRow = {
  country: string;
  lead_count: number | string | null;
  qualified_count: number | string | null;
  enrolled_count: number | string | null;
};

export type ReconciliationRow = {
  analytics_date: string;
  ga4_sessions: number | string | null;
  crm_sessions: number | string | null;
  ga4_page_views: number | string | null;
  crm_page_views: number | string | null;
  crm_visitors: number | string | null;
  crm_form_submits: number | string | null;
  crm_web_leads: number | string | null;
};

export type SyncHealthRow = {
  latest_analytics_date: string | null;
  latest_data_update: string | null;
  last_successful_sync: string | null;
  daily_rows: number | string | null;
  source_rows: number | string | null;
  landing_page_rows: number | string | null;
  campaign_rows: number | string | null;
  country_rows: number | string | null;
};

export type SyncRunRow = {
  id: string;
  status: string;
  from_date: string | null;
  to_date: string | null;
  total_rows: number | string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export type SourcePerformance = {
  key: string;
  source: string;
  medium: string;
  sessions: number;
  engaged: number;
  leads: number;
  qualified: number;
  enrolled: number;
  inrRevenue: number;
  usdRevenue: number;
};

export type LandingPerformance = {
  key: string;
  page: string;
  sessions: number;
  engaged: number;
  leads: number;
  qualified: number;
  enrolled: number;
};

export type CompactPerformance = {
  name: string;
  sessions: number;
  leads: number;
  enrolled: number;
};

export type AnalyticsWorkspace = {
  overview: Partial<OverviewRow>;
  sourceRows: SourcePerformance[];
  landingRows: LandingPerformance[];
  campaignRows: CompactPerformance[];
  countryRows: CompactPerformance[];
  reconciliation: ReconciliationRow[];
  health: Partial<SyncHealthRow>;
  syncRuns: SyncRunRow[];
  fallback: boolean;
  warning: string | null;
};

type RpcPayload = {
  overview?: Record<string, unknown>;
  ga4_sources?: Array<Record<string, unknown>>;
  crm_sources?: Array<Record<string, unknown>>;
  crm_source_revenue?: Array<Record<string, unknown>>;
  ga4_landing?: Array<Record<string, unknown>>;
  crm_landing?: Array<Record<string, unknown>>;
  ga4_campaigns?: Array<Record<string, unknown>>;
  crm_campaigns?: Array<Record<string, unknown>>;
  ga4_countries?: Array<Record<string, unknown>>;
  crm_countries?: Array<Record<string, unknown>>;
  reconciliation?: Array<Record<string, unknown>>;
  health?: Record<string, unknown>;
  sync_runs?: Array<Record<string, unknown>>;
};

export async function getAnalyticsWorkspace(): Promise<AnalyticsWorkspace> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_analytics_workspace");

  if (!error) {
    return parseWorkspace((data ?? {}) as RpcPayload);
  }

  const fallback = await getLegacyWorkspace(supabase);

  return {
    ...fallback,
    fallback: true,
    warning: `Optimized Analytics read model unavailable: ${error.message}`,
  };
}

function parseWorkspace(payload: RpcPayload): AnalyticsWorkspace {
  const ga4Sources = (payload.ga4_sources ?? []) as unknown as Ga4SourceRow[];

  const crmSources = (payload.crm_sources ?? []) as unknown as CrmSourceRow[];

  const crmSourceRevenue = (payload.crm_source_revenue ??
    []) as unknown as CrmSourceRevenueRow[];

  const ga4Landing = (payload.ga4_landing ?? []) as unknown as Ga4LandingRow[];

  const crmLanding = (payload.crm_landing ?? []) as unknown as CrmLandingRow[];

  const ga4Campaigns = (payload.ga4_campaigns ??
    []) as unknown as Ga4CampaignRow[];

  const crmCampaigns = (payload.crm_campaigns ??
    []) as unknown as CrmCampaignRow[];

  const ga4Countries = (payload.ga4_countries ??
    []) as unknown as Ga4CountryRow[];

  const crmCountries = (payload.crm_countries ??
    []) as unknown as CrmCountryRow[];

  return {
    overview: (payload.overview ?? {}) as Partial<OverviewRow>,

    sourceRows: mergeSources(ga4Sources, crmSources, crmSourceRevenue),

    landingRows: mergeLandingPages(ga4Landing, crmLanding),

    campaignRows: mergeCampaigns(ga4Campaigns, crmCampaigns),

    countryRows: mergeCountries(ga4Countries, crmCountries),

    reconciliation: (payload.reconciliation ??
      []) as unknown as ReconciliationRow[],

    health: (payload.health ?? {}) as Partial<SyncHealthRow>,

    syncRuns: (payload.sync_runs ?? []) as unknown as SyncRunRow[],

    fallback: false,
    warning: null,
  };
}

async function getLegacyWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Omit<AnalyticsWorkspace, "fallback" | "warning">> {
  const [
    overviewResult,
    ga4SourceResult,
    crmSourceResult,
    crmSourceRevenueResult,
    ga4LandingResult,
    crmLandingResult,
    ga4CampaignResult,
    crmCampaignResult,
    ga4CountryResult,
    crmCountryResult,
    reconciliationResult,
    healthResult,
    syncRunsResult,
  ] = await Promise.all([
    supabase
      .from("v_analytics_30d_overview")
      .select(
        `
        range_start,
        range_end,
        ga4_sessions,
        ga4_page_views,
        ga4_new_users,
        ga4_avg_daily_users,
        ga4_engaged_sessions,
        ga4_engagement_rate,
        ga4_avg_session_duration,
        ga4_key_events,
        crm_sessions,
        crm_visitors,
        crm_page_views,
        crm_form_submits,
        crm_web_leads,
        crm_qualified_leads,
        crm_enrolled_leads,
        website_lead_conversion_rate
      `,
      )
      .maybeSingle(),

    supabase
      .from("v_ga4_source_30d")
      .select(
        `
        source,
        medium,
        sessions,
        new_users,
        user_days,
        engaged_sessions,
        key_events
      `,
      )
      .order("sessions", {
        ascending: false,
      })
      .limit(50),

    supabase
      .from("v_crm_source_30d")
      .select(
        `
        source,
        medium,
        lead_count,
        qualified_count,
        enrolled_count
      `,
      )
      .order("lead_count", {
        ascending: false,
      })
      .limit(100),

    supabase.from("v_crm_source_revenue_30d").select(`
        source,
        medium,
        currency,
        net_revenue
      `),

    supabase
      .from("v_ga4_landing_page_30d")
      .select(
        `
        landing_page,
        sessions,
        user_days,
        engaged_sessions,
        key_events
      `,
      )
      .order("sessions", {
        ascending: false,
      })
      .limit(50),

    supabase
      .from("v_crm_landing_page_30d")
      .select(
        `
        landing_page,
        lead_count,
        qualified_count,
        enrolled_count
      `,
      )
      .order("lead_count", {
        ascending: false,
      })
      .limit(250),

    supabase
      .from("v_ga4_campaign_30d")
      .select(
        `
        campaign,
        source,
        medium,
        sessions,
        engaged_sessions,
        key_events
      `,
      )
      .order("sessions", {
        ascending: false,
      })
      .limit(50),

    supabase
      .from("v_crm_campaign_30d")
      .select(
        `
        campaign,
        lead_count,
        qualified_count,
        enrolled_count
      `,
      )
      .order("lead_count", {
        ascending: false,
      })
      .limit(100),

    supabase
      .from("v_ga4_country_30d")
      .select(
        `
        country,
        sessions,
        user_days,
        engaged_sessions,
        key_events
      `,
      )
      .order("sessions", {
        ascending: false,
      })
      .limit(50),

    supabase
      .from("v_crm_country_30d")
      .select(
        `
        country,
        lead_count,
        qualified_count,
        enrolled_count
      `,
      )
      .order("lead_count", {
        ascending: false,
      })
      .limit(100),

    supabase
      .from("v_analytics_reconciliation_daily_30d")
      .select(
        `
        analytics_date,
        ga4_sessions,
        crm_sessions,
        ga4_page_views,
        crm_page_views,
        crm_visitors,
        crm_form_submits,
        crm_web_leads
      `,
      )
      .order("analytics_date", {
        ascending: false,
      }),

    supabase
      .from("v_ga4_sync_health")
      .select(
        `
        latest_analytics_date,
        latest_data_update,
        last_successful_sync,
        daily_rows,
        source_rows,
        landing_page_rows,
        campaign_rows,
        country_rows
      `,
      )
      .maybeSingle(),

    supabase
      .from("ga4_sync_runs")
      .select(
        `
        id,
        status,
        from_date,
        to_date,
        total_rows,
        error_message,
        started_at,
        completed_at
      `,
      )
      .order("started_at", {
        ascending: false,
      })
      .limit(6),
  ]);

  const errors = [
    overviewResult.error,
    ga4SourceResult.error,
    crmSourceResult.error,
    crmSourceRevenueResult.error,
    ga4LandingResult.error,
    crmLandingResult.error,
    ga4CampaignResult.error,
    crmCampaignResult.error,
    ga4CountryResult.error,
    crmCountryResult.error,
    reconciliationResult.error,
    healthResult.error,
    syncRunsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load Analytics dashboard: ${errors
        .map((item) => item?.message)
        .join(" | ")}`,
    );
  }

  const ga4Sources = (ga4SourceResult.data ?? []) as Ga4SourceRow[];

  const crmSources = (crmSourceResult.data ?? []) as CrmSourceRow[];

  const revenueRows = (crmSourceRevenueResult.data ??
    []) as CrmSourceRevenueRow[];

  const ga4Landing = (ga4LandingResult.data ?? []) as Ga4LandingRow[];

  const crmLanding = (crmLandingResult.data ?? []) as CrmLandingRow[];

  const ga4Campaigns = (ga4CampaignResult.data ?? []) as Ga4CampaignRow[];

  const crmCampaigns = (crmCampaignResult.data ?? []) as CrmCampaignRow[];

  const ga4Countries = (ga4CountryResult.data ?? []) as Ga4CountryRow[];

  const crmCountries = (crmCountryResult.data ?? []) as CrmCountryRow[];

  return {
    overview: (overviewResult.data ?? {}) as Partial<OverviewRow>,

    sourceRows: mergeSources(ga4Sources, crmSources, revenueRows),

    landingRows: mergeLandingPages(ga4Landing, crmLanding),

    campaignRows: mergeCampaigns(ga4Campaigns, crmCampaigns),

    countryRows: mergeCountries(ga4Countries, crmCountries),

    reconciliation: (reconciliationResult.data ?? []) as ReconciliationRow[],

    health: (healthResult.data ?? {}) as Partial<SyncHealthRow>,

    syncRuns: (syncRunsResult.data ?? []) as SyncRunRow[],
  };
}

function mergeSources(
  ga4Rows: Ga4SourceRow[],
  crmRows: CrmSourceRow[],
  revenueRows: CrmSourceRevenueRow[],
): SourcePerformance[] {
  const map = new Map<string, SourcePerformance>();

  for (const row of ga4Rows) {
    const source = cleanSource(row.source);

    const medium = cleanMedium(row.medium);

    const key = sourceMediumKey(source, medium);

    map.set(key, {
      key,
      source,
      medium,
      sessions: toNumber(row.sessions),
      engaged: toNumber(row.engaged_sessions),
      leads: 0,
      qualified: 0,
      enrolled: 0,
      inrRevenue: 0,
      usdRevenue: 0,
    });
  }

  for (const row of crmRows) {
    const source = cleanSource(row.source);

    const medium = cleanMedium(row.medium);

    const key = sourceMediumKey(source, medium);

    const item = map.get(key) ?? {
      key,
      source,
      medium,
      sessions: 0,
      engaged: 0,
      leads: 0,
      qualified: 0,
      enrolled: 0,
      inrRevenue: 0,
      usdRevenue: 0,
    };

    item.leads += toNumber(row.lead_count);

    item.qualified += toNumber(row.qualified_count);

    item.enrolled += toNumber(row.enrolled_count);

    map.set(key, item);
  }

  for (const row of revenueRows) {
    const source = cleanSource(row.source);

    const medium = cleanMedium(row.medium);

    const key = sourceMediumKey(source, medium);

    const item = map.get(key) ?? {
      key,
      source,
      medium,
      sessions: 0,
      engaged: 0,
      leads: 0,
      qualified: 0,
      enrolled: 0,
      inrRevenue: 0,
      usdRevenue: 0,
    };

    const currency = String(row.currency || "").toUpperCase();

    if (currency === "INR") {
      item.inrRevenue += toNumber(row.net_revenue);
    }

    if (currency === "USD") {
      item.usdRevenue += toNumber(row.net_revenue);
    }

    map.set(key, item);
  }

  return [...map.values()]
    .sort((a, b) => b.sessions - a.sessions || b.leads - a.leads)
    .slice(0, 20);
}

function mergeLandingPages(
  ga4Rows: Ga4LandingRow[],
  crmRows: CrmLandingRow[],
): LandingPerformance[] {
  const map = new Map<string, LandingPerformance>();

  for (const row of ga4Rows) {
    const page = normalizeLandingPage(row.landing_page);

    map.set(page, {
      key: page,
      page,
      sessions: toNumber(row.sessions),
      engaged: toNumber(row.engaged_sessions),
      leads: 0,
      qualified: 0,
      enrolled: 0,
    });
  }

  for (const row of crmRows) {
    const page = normalizeLandingPage(row.landing_page);

    const item = map.get(page) ?? {
      key: page,
      page,
      sessions: 0,
      engaged: 0,
      leads: 0,
      qualified: 0,
      enrolled: 0,
    };

    item.leads += toNumber(row.lead_count);

    item.qualified += toNumber(row.qualified_count);

    item.enrolled += toNumber(row.enrolled_count);

    map.set(page, item);
  }

  return [...map.values()]
    .sort((a, b) => b.sessions - a.sessions || b.leads - a.leads)
    .slice(0, 20);
}

function mergeCampaigns(
  ga4Rows: Ga4CampaignRow[],
  crmRows: CrmCampaignRow[],
): CompactPerformance[] {
  const map = new Map<string, CompactPerformance>();

  for (const row of ga4Rows) {
    const name = cleanCampaign(row.campaign);

    const key = normalizeText(name);

    const item = map.get(key) ?? {
      name,
      sessions: 0,
      leads: 0,
      enrolled: 0,
    };

    item.sessions += toNumber(row.sessions);

    map.set(key, item);
  }

  for (const row of crmRows) {
    const name = cleanCampaign(row.campaign);

    const key = normalizeText(name);

    const item = map.get(key) ?? {
      name,
      sessions: 0,
      leads: 0,
      enrolled: 0,
    };

    item.leads += toNumber(row.lead_count);

    item.enrolled += toNumber(row.enrolled_count);

    map.set(key, item);
  }

  return [...map.values()]
    .filter(
      (row) =>
        !["(not set)", "(direct)", "unattributed", "unknown"].includes(
          normalizeText(row.name),
        ),
    )
    .sort((a, b) => b.sessions - a.sessions || b.leads - a.leads)
    .slice(0, 12);
}

function mergeCountries(
  ga4Rows: Ga4CountryRow[],
  crmRows: CrmCountryRow[],
): CompactPerformance[] {
  const map = new Map<string, CompactPerformance>();

  for (const row of ga4Rows) {
    const name = cleanLabel(row.country);

    const key = normalizeText(name);

    map.set(key, {
      name,
      sessions: toNumber(row.sessions),
      leads: 0,
      enrolled: 0,
    });
  }

  for (const row of crmRows) {
    const name = cleanLabel(row.country);

    const key = normalizeText(name);

    const item = map.get(key) ?? {
      name,
      sessions: 0,
      leads: 0,
      enrolled: 0,
    };

    item.leads += toNumber(row.lead_count);

    item.enrolled += toNumber(row.enrolled_count);

    map.set(key, item);
  }

  return [...map.values()]
    .sort((a, b) => b.sessions - a.sessions || b.leads - a.leads)
    .slice(0, 12);
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function cleanSource(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized || normalized === "(not set)") {
    return "Unknown";
  }

  if (normalized === "(direct)" || normalized === "direct") {
    return "Direct";
  }

  return String(value).trim();
}

function cleanMedium(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized || normalized === "(not set)") {
    return "Unknown";
  }

  if (normalized === "(none)" || normalized === "none") {
    return "None";
  }

  return String(value).trim();
}

function cleanCampaign(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "Unattributed";
  }

  return String(value).trim();
}

function cleanLabel(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized || normalized === "(not set)") {
    return "Unknown";
  }

  return String(value).trim();
}

function sourceMediumKey(source: string, medium: string) {
  return `${normalizeText(source)}||${normalizeText(medium)}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeLandingPage(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const raw = String(value).trim();

  if (!raw) {
    return "Unknown";
  }

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const url = new URL(raw);

      return url.pathname + url.search || "/";
    }
  } catch {
    return raw;
  }

  return raw;
}
