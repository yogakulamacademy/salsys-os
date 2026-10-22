import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  unit: "people" | "sessions";
};

export type FunnelJourney = {
  key: "business" | "website" | "whatsapp" | string;
  label: string;
  description: string;
  stages: FunnelStage[];
};

export type FunnelSourceEvidence = {
  source: string;
  leads: number;
  qualified: number;
  paid: number;
  enrolled: number;
  revenue_inr: number;
  revenue_usd: number;
};

export type FunnelDailyEvidence = {
  date: string;
  sessions: number;
  leads: number;
  qualified: number;
  enrolled: number;
};

export type FunnelMeasurement = {
  total_leads: number;
  known_first_touch: number;
  unknown_first_touch: number;
  first_touch_coverage: number | null;
  web_linked_leads: number;
  website_created_leads: number;
  form_submit_sessions: number;
};

export type FunnelOverviewV2 = {
  visitors: number;
  sessions: number;
  leads: number;
  qualified: number;
  payment_pending: number;
  paid: number;
  enrolled: number;
  revenue_inr: number;
  revenue_usd: number;
};

export type FunnelIntelligenceWorkspace = {
  status: {
    available: boolean;
    window_days: number;
    generated_at: string | null;
    message?: string;
  };
  overview: FunnelOverviewV2 | null;
  journeys: FunnelJourney[];
  sources: FunnelSourceEvidence[];
  daily: FunnelDailyEvidence[];
  measurement: FunnelMeasurement | null;
};

const unavailableWorkspace = (message: string): FunnelIntelligenceWorkspace => ({
  status: {
    available: false,
    window_days: 30,
    generated_at: null,
    message,
  },
  overview: null,
  journeys: [],
  sources: [],
  daily: [],
  measurement: null,
});

export async function getFunnelIntelligenceWorkspace(): Promise<FunnelIntelligenceWorkspace> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return unavailableWorkspace("Conversion data is temporarily unavailable. Please try again.");
  }

  try {
    const organizationId = await requireCurrentOrganizationId(supabase, user.id);
    const { data, error } = await supabase.rpc("get_funnel_intelligence_workspace_v2", {
      p_organization_id: organizationId,
      p_days: 30,
    });

    if (error) {
      console.error("Funnel intelligence read unavailable:", error.message);
      return unavailableWorkspace("Conversion data is temporarily unavailable. Please try again.");
    }

    const payload = (data ?? {}) as Partial<FunnelIntelligenceWorkspace>;
    if (!payload.status?.available || !payload.overview) {
      return unavailableWorkspace("Conversion data is temporarily unavailable. Please try again.");
    }

    return {
      status: {
        available: true,
        window_days: number(payload.status.window_days, 30),
        generated_at: payload.status.generated_at ?? null,
      },
      overview: normalizeOverview(payload.overview),
      journeys: Array.isArray(payload.journeys)
        ? payload.journeys.map(normalizeJourney)
        : [],
      sources: Array.isArray(payload.sources)
        ? payload.sources.map(normalizeSource)
        : [],
      daily: Array.isArray(payload.daily)
        ? payload.daily.map(normalizeDaily)
        : [],
      measurement: payload.measurement
        ? normalizeMeasurement(payload.measurement)
        : null,
    };
  } catch (error) {
    console.error(
      "Funnel intelligence workspace failed:",
      error instanceof Error ? error.message : String(error),
    );
    return unavailableWorkspace("Conversion data is temporarily unavailable. Please try again.");
  }
}

function normalizeOverview(value: FunnelOverviewV2): FunnelOverviewV2 {
  return {
    visitors: number(value.visitors),
    sessions: number(value.sessions),
    leads: number(value.leads),
    qualified: number(value.qualified),
    payment_pending: number(value.payment_pending),
    paid: number(value.paid),
    enrolled: number(value.enrolled),
    revenue_inr: number(value.revenue_inr),
    revenue_usd: number(value.revenue_usd),
  };
}

function normalizeJourney(value: FunnelJourney): FunnelJourney {
  return {
    key: value.key,
    label: value.label,
    description: value.description,
    stages: Array.isArray(value.stages)
      ? value.stages.map((stage) => ({
          key: stage.key,
          label: stage.label,
          count: number(stage.count),
          unit: stage.unit === "sessions" ? "sessions" : "people",
        }))
      : [],
  };
}

function normalizeSource(value: FunnelSourceEvidence): FunnelSourceEvidence {
  return {
    source: value.source || "unknown",
    leads: number(value.leads),
    qualified: number(value.qualified),
    paid: number(value.paid),
    enrolled: number(value.enrolled),
    revenue_inr: number(value.revenue_inr),
    revenue_usd: number(value.revenue_usd),
  };
}

function normalizeDaily(value: FunnelDailyEvidence): FunnelDailyEvidence {
  return {
    date: value.date,
    sessions: number(value.sessions),
    leads: number(value.leads),
    qualified: number(value.qualified),
    enrolled: number(value.enrolled),
  };
}

function normalizeMeasurement(value: FunnelMeasurement): FunnelMeasurement {
  return {
    total_leads: number(value.total_leads),
    known_first_touch: number(value.known_first_touch),
    unknown_first_touch: number(value.unknown_first_touch),
    first_touch_coverage:
      value.first_touch_coverage == null ? null : number(value.first_touch_coverage),
    web_linked_leads: number(value.web_linked_leads),
    website_created_leads: number(value.website_created_leads),
    form_submit_sessions: number(value.form_submit_sessions),
  };
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
