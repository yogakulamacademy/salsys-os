import { createClient } from "@/lib/supabase/server";

export type SeoOverviewRow = {
  range_start: string | null;
  range_end: string | null;

  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;

  organic_leads: number | string | null;
  organic_qualified_leads: number | string | null;
  organic_enrolled_leads: number | string | null;

  organic_revenue_inr: number | string | null;
  organic_revenue_usd: number | string | null;

  click_to_lead_rate: number | string | null;
};

export type DailyRow = {
  date: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type QueryRow = {
  query: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type PageRow = {
  page: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type CountryRow = {
  country: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type DeviceRow = {
  device: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type SearchAppearanceRow = {
  search_appearance: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
};

export type OpportunityRow = {
  query: string;
  clicks: number | string | null;
  impressions: number | string | null;
  ctr: number | string | null;
  avg_position: number | string | null;
  opportunity_type: string;
  recommendation: string;
};

export type SyncHealthRow = {
  latest_gsc_date: string | null;
  latest_data_update: string | null;
  last_successful_sync: string | null;
  daily_rows: number | string | null;
  query_rows: number | string | null;
  page_rows: number | string | null;
  country_rows: number | string | null;
  device_rows: number | string | null;
  search_appearance_rows: number | string | null;
};

export type SyncRunRow = {
  id: string;
  site_url: string;
  start_date: string;
  end_date: string;
  status: string;
  triggered_by: string;
  total_rows: number | string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export type SeoWorkspace = {
  overview: Partial<SeoOverviewRow>;
  daily: DailyRow[];
  queries: QueryRow[];
  pages: PageRow[];
  countries: CountryRow[];
  devices: DeviceRow[];
  appearances: SearchAppearanceRow[];
  opportunities: OpportunityRow[];
  health: Partial<SyncHealthRow>;
  syncRuns: SyncRunRow[];
  fallback: boolean;
  warning: string | null;
};

type RpcPayload = {
  overview?: Partial<SeoOverviewRow>;
  daily?: DailyRow[];
  queries?: QueryRow[];
  pages?: PageRow[];
  countries?: CountryRow[];
  devices?: DeviceRow[];
  appearances?: SearchAppearanceRow[];
  opportunities?: OpportunityRow[];
  health?: Partial<SyncHealthRow>;
  sync_runs?: SyncRunRow[];
};

export async function getSeoWorkspace(): Promise<SeoWorkspace> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_seo_workspace");

  if (!error) {
    const payload = (data ?? {}) as RpcPayload;

    return {
      overview: payload.overview ?? {},

      daily: Array.isArray(payload.daily) ? payload.daily : [],

      queries: Array.isArray(payload.queries) ? payload.queries : [],

      pages: Array.isArray(payload.pages) ? payload.pages : [],

      countries: Array.isArray(payload.countries) ? payload.countries : [],

      devices: Array.isArray(payload.devices) ? payload.devices : [],

      appearances: Array.isArray(payload.appearances)
        ? payload.appearances
        : [],

      opportunities: Array.isArray(payload.opportunities)
        ? payload.opportunities
        : [],

      health: payload.health ?? {},

      syncRuns: Array.isArray(payload.sync_runs) ? payload.sync_runs : [],

      fallback: false,
      warning: null,
    };
  }

  /*
   * Safe fallback:
   * preserve the existing direct-view reads if the optimized
   * workspace RPC is temporarily unavailable.
   */
  const [
    overviewResult,
    dailyResult,
    queryResult,
    pageResult,
    countryResult,
    deviceResult,
    appearanceResult,
    opportunitiesResult,
    healthResult,
    syncRunsResult,
  ] = await Promise.all([
    supabase
      .from("v_seo_30d_overview")
      .select(
        `
        range_start,
        range_end,
        clicks,
        impressions,
        ctr,
        avg_position,
        organic_leads,
        organic_qualified_leads,
        organic_enrolled_leads,
        organic_revenue_inr,
        organic_revenue_usd,
        click_to_lead_rate
      `,
      )
      .maybeSingle(),

    supabase
      .from("v_seo_daily_30d")
      .select(
        `
        date,
        clicks,
        impressions,
        ctr,
        avg_position
      `,
      )
      .order("date", {
        ascending: true,
      }),

    supabase
      .from("v_seo_query_30d")
      .select(
        `
        query,
        clicks,
        impressions,
        ctr,
        avg_position
      `,
      )
      .order("clicks", {
        ascending: false,
      })
      .limit(30),

    supabase
      .from("v_seo_page_30d")
      .select(
        `
        page,
        clicks,
        impressions,
        ctr,
        avg_position
      `,
      )
      .order("clicks", {
        ascending: false,
      })
      .limit(25),

    supabase
      .from("v_seo_country_30d")
      .select(
        `
        country,
        clicks,
        impressions,
        ctr,
        avg_position
      `,
      )
      .order("clicks", {
        ascending: false,
      })
      .limit(15),

    supabase
      .from("v_seo_device_30d")
      .select(
        `
        device,
        clicks,
        impressions,
        ctr,
        avg_position
      `,
      )
      .order("clicks", {
        ascending: false,
      }),

    supabase
      .from("v_seo_search_appearance_30d")
      .select(
        `
        search_appearance,
        clicks,
        impressions,
        ctr,
        avg_position
      `,
      )
      .order("clicks", {
        ascending: false,
      }),

    supabase
      .from("v_seo_opportunities_30d")
      .select(
        `
        query,
        clicks,
        impressions,
        ctr,
        avg_position,
        opportunity_type,
        recommendation
      `,
      )
      .order("impressions", {
        ascending: false,
      })
      .limit(40),

    supabase
      .from("v_gsc_sync_health")
      .select(
        `
        latest_gsc_date,
        latest_data_update,
        last_successful_sync,
        daily_rows,
        query_rows,
        page_rows,
        country_rows,
        device_rows,
        search_appearance_rows
      `,
      )
      .maybeSingle(),

    supabase
      .from("gsc_sync_runs")
      .select(
        `
        id,
        site_url,
        start_date,
        end_date,
        status,
        triggered_by,
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
    dailyResult.error,
    queryResult.error,
    pageResult.error,
    countryResult.error,
    deviceResult.error,
    appearanceResult.error,
    opportunitiesResult.error,
    healthResult.error,
    syncRunsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load SEO dashboard: ${errors
        .map((item) => item?.message)
        .join(" | ")}`,
    );
  }

  return {
    overview: (overviewResult.data ?? {}) as Partial<SeoOverviewRow>,

    daily: (dailyResult.data ?? []) as DailyRow[],

    queries: (queryResult.data ?? []) as QueryRow[],

    pages: (pageResult.data ?? []) as PageRow[],

    countries: (countryResult.data ?? []) as CountryRow[],

    devices: (deviceResult.data ?? []) as DeviceRow[],

    appearances: (appearanceResult.data ?? []) as SearchAppearanceRow[],

    opportunities: (opportunitiesResult.data ?? []) as OpportunityRow[],

    health: (healthResult.data ?? {}) as Partial<SyncHealthRow>,

    syncRuns: (syncRunsResult.data ?? []) as SyncRunRow[],

    fallback: true,
    warning: `Optimized SEO read model unavailable: ${error.message}`,
  };
}
