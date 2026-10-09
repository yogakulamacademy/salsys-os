import { createClient } from "@/lib/supabase/server";
import { getProviderVisibility } from "@/lib/integrations/provider-visibility";

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

  const visibility =
    await getProviderVisibility(supabase);

  if (!visibility.googleConnected) {
    return {
      overview: {},
      sourceRows: [],
      landingRows: [],
      campaignRows: [],
      countryRows: [],
      reconciliation: [],
      health: {},
      syncRuns: [],
      fallback: false,
      warning: null,
    };
  }

  const { data, error } = await supabase.rpc("get_analytics_workspace", {
    p_organization_id: visibility.organizationId,
  });

  if (!error) {
    return parseWorkspace((data ?? {}) as RpcPayload);
  }

  return {
    overview: {},
    sourceRows: [],
    landingRows: [],
    campaignRows: [],
    countryRows: [],
    reconciliation: [],
    health: {},
    syncRuns: [],
    fallback: false,
    warning: `Unable to load Analytics workspace: ${error.message}`,
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
