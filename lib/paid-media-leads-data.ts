import { createClient } from "@/lib/supabase/server";

export type PaidMediaLead = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  email: string | null;
  phone: string | null;

  platform: string | null;
  platform_label: string | null;

  campaign_id: string | null;
  campaign_name: string | null;

  ad_group_or_adset_id: string | null;
  group_type: string | null;
  ad_id: string | null;

  current_stage: string | null;
  behaviour_temperature: string | null;
  engagement_score: number | string | null;
  is_reengaged: boolean | null;

  payment_status: string | null;
  revenue_inr: number | string | null;
  revenue_usd: number | string | null;
  has_payment: boolean | null;
  is_enrolled: boolean | null;

  allocated_acquisition_cost: number | string | null;
  acquisition_currency: string | null;
  acquisition_cost_method: string | null;

  campaign_spend_30d: number | string | null;
  campaign_crm_leads_30d: number | string | null;
  campaign_roas_30d: number | string | null;
  campaign_matched: boolean | null;

  course_name: string | null;
  course_code: string | null;

  country: string | null;
  region: string | null;
  city: string | null;

  preferred_location: string | null;
  preferred_month: string | null;
  preferred_mode: string | null;

  first_paid_touch_at: string | null;
  landing_page: string | null;

  gclid: string | null;
  fbclid: string | null;
};

export type PaidMediaOverview = {
  paid_media_leads: number | string | null;
  google_leads: number | string | null;
  instagram_leads: number | string | null;
  facebook_leads: number | string | null;
  meta_unspecified_leads: number | string | null;
  qualified_leads: number | string | null;
  hot_leads: number | string | null;
  paid_leads: number | string | null;
  enrolled_leads: number | string | null;
  campaign_matched_leads: number | string | null;
  leads_with_allocated_cost: number | string | null;
  revenue_inr: number | string | null;
  revenue_usd: number | string | null;
};

export type PaidMediaTouchpoint = {
  id: string;
  event_type: string | null;
  source: string | null;
  medium: string | null;
  campaign_name: string | null;
  landing_page: string | null;
  occurred_at: string | null;
};

export type PaidMediaLeadsFilters = {
  query: string;
  platform: string;
  stage: string;
  temperature: string;
  payment: string;
  match: string;
  course: string;
  country: string;
  campaign: string;
  from: string;
  to: string;
  selectedLeadId: string;
  page: number;
  pageSize: number;
};

export type PaidMediaLeadsWorkspace = {
  overview: PaidMediaOverview;
  leads: PaidMediaLead[];
  total: number;
  selectedLead: PaidMediaLead | null;
  selectedTouchpoints: PaidMediaTouchpoint[];
  warning: string | null;
};

type RpcPayload = {
  overview?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  pagination?: Record<string, unknown>;
  selected_lead?: Record<string, unknown> | null;
  selected_touchpoints?: Array<Record<string, unknown>>;
};

export async function getPaidMediaLeadsWorkspace(
  filters: PaidMediaLeadsFilters,
): Promise<PaidMediaLeadsWorkspace> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_paid_media_leads_workspace", {
    p_query: safeOrSearch(filters.query) || null,
    p_platform: normalizedFilter(filters.platform),
    p_stage: normalizedFilter(filters.stage),
    p_temperature: normalizedFilter(filters.temperature),
    p_payment: normalizedFilter(filters.payment),
    p_match: normalizedFilter(filters.match),
    p_course: safeSearch(filters.course) || null,
    p_country: safeSearch(filters.country) || null,
    p_campaign: safeSearch(filters.campaign) || null,
    p_from: validDate(filters.from),
    p_to: validDate(filters.to),
    p_selected_lead_id: filters.selectedLeadId || null,
    p_page: filters.page,
    p_page_size: filters.pageSize,
  });

  if (!error) {
    return parseRpcPayload((data ?? {}) as RpcPayload);
  }

  /*
   * Safety fallback:
   * retain the existing direct-view path if the
   * optimized RPC is unavailable.
   */
  const fallback = await getLegacyWorkspace(supabase, filters);

  return {
    ...fallback,
    warning: `Optimized paid-media read model unavailable: ${error.message}`,
  };
}

function parseRpcPayload(payload: RpcPayload): PaidMediaLeadsWorkspace {
  const overview = (payload.overview ?? {}) as unknown as PaidMediaOverview;

  const leads = (payload.rows ?? []).map(
    (row) => row as unknown as PaidMediaLead,
  );

  const pagination = payload.pagination ?? {};

  const selectedLead = payload.selected_lead
    ? (payload.selected_lead as unknown as PaidMediaLead)
    : null;

  const selectedTouchpoints = (payload.selected_touchpoints ?? []).map(
    (row) => row as unknown as PaidMediaTouchpoint,
  );

  return {
    overview,
    leads,
    total: toNumber(pagination.total),
    selectedLead,
    selectedTouchpoints,
    warning: null,
  };
}

async function getLegacyWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: PaidMediaLeadsFilters,
): Promise<Omit<PaidMediaLeadsWorkspace, "warning">> {
  const overviewPromise = supabase
    .from("v_paid_media_leads_overview")
    .select("*")
    .maybeSingle();

  let query = supabase.from("v_paid_media_leads_ui").select("*", {
    count: "exact",
  });

  if (filters.platform && filters.platform !== "all") {
    query = query.eq("platform", filters.platform);
  }

  if (filters.stage && filters.stage !== "all") {
    query = query.eq("current_stage", filters.stage);
  }

  if (filters.temperature && filters.temperature !== "all") {
    query = query.eq("behaviour_temperature", filters.temperature);
  }

  if (filters.payment && filters.payment !== "all") {
    query = query.eq("payment_status", filters.payment);
  }

  if (filters.match === "matched") {
    query = query.eq("campaign_matched", true);
  } else if (filters.match === "unmatched") {
    query = query.eq("campaign_matched", false);
  }

  if (filters.course) {
    query = query.ilike("course_name", `%${safeSearch(filters.course)}%`);
  }

  if (filters.country) {
    query = query.ilike("country", `%${safeSearch(filters.country)}%`);
  }

  if (filters.campaign) {
    query = query.ilike("campaign_name", `%${safeSearch(filters.campaign)}%`);
  }

  if (validDate(filters.from)) {
    query = query.gte("first_paid_touch_at", `${filters.from}T00:00:00`);
  }

  if (validDate(filters.to)) {
    query = query.lte("first_paid_touch_at", `${filters.to}T23:59:59.999`);
  }

  if (filters.query) {
    const s = safeOrSearch(filters.query);

    query = query.or(
      [
        `lead_name.ilike.%${s}%`,
        `lead_code.ilike.%${s}%`,
        `campaign_name.ilike.%${s}%`,
        `course_name.ilike.%${s}%`,
        `email.ilike.%${s}%`,
        `phone.ilike.%${s}%`,
      ].join(","),
    );
  }

  const fromIndex = (filters.page - 1) * filters.pageSize;

  const toIndex = fromIndex + filters.pageSize - 1;

  const leadsPromise = query
    .order("first_paid_touch_at", {
      ascending: false,
      nullsFirst: false,
    })
    .range(fromIndex, toIndex);

  let selectedLeadPromise: PromiseLike<{
    data: unknown | null;
    error: {
      message: string;
    } | null;
  }> | null = null;

  let touchpointsPromise: PromiseLike<{
    data: unknown[] | null;
    error: {
      message: string;
    } | null;
  }> | null = null;

  if (filters.selectedLeadId) {
    selectedLeadPromise = supabase
      .from("v_paid_media_leads_ui")
      .select("*")
      .eq("lead_id", filters.selectedLeadId)
      .maybeSingle();

    touchpointsPromise = supabase
      .from("touchpoints")
      .select(
        "id,event_type,source,medium,campaign_name,landing_page,occurred_at",
      )
      .eq("lead_id", filters.selectedLeadId)
      .order("occurred_at", {
        ascending: false,
      })
      .limit(8);
  }

  const [
    overviewResult,
    leadsResult,
    selectedLeadResult,
    selectedTouchpointsResult,
  ] = await Promise.all([
    overviewPromise,
    leadsPromise,
    selectedLeadPromise,
    touchpointsPromise,
  ]);

  if (overviewResult.error) {
    throw new Error(
      `Unable to load paid-media overview: ${overviewResult.error.message}`,
    );
  }

  if (leadsResult.error) {
    throw new Error(
      `Unable to load paid-media leads: ${leadsResult.error.message}`,
    );
  }

  if (selectedLeadResult?.error) {
    throw new Error(
      `Unable to load selected paid-media lead: ${selectedLeadResult.error.message}`,
    );
  }

  if (selectedTouchpointsResult?.error) {
    throw new Error(
      `Unable to load selected lead journey: ${selectedTouchpointsResult.error.message}`,
    );
  }

  return {
    overview: (overviewResult.data ?? {}) as PaidMediaOverview,

    leads: (leadsResult.data ?? []) as PaidMediaLead[],

    total: leadsResult.count ?? (leadsResult.data ?? []).length,

    selectedLead: (selectedLeadResult?.data ?? null) as PaidMediaLead | null,

    selectedTouchpoints: (selectedTouchpointsResult?.data ??
      []) as PaidMediaTouchpoint[],
  };
}

function normalizedFilter(value: string) {
  const clean = value.trim();

  return clean && clean !== "all" ? clean : null;
}

function safeSearch(value: string) {
  return value.replaceAll("%", "").replaceAll("*", "").trim();
}

function safeOrSearch(value: string) {
  return safeSearch(value)
    .replaceAll(",", " ")
    .replaceAll("(", " ")
    .replaceAll(")", " ");
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}
