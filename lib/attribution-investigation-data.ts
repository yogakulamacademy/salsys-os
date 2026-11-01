import { useMockData } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type ExactAttributionScope = {
  firstTouchSource?: string;
  creationChannel?: string;
  lastTouchSource?: string;
};

export type RevenueAttributionOpportunity = {
  id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  preferred_location: string | null;
  first_touch_source: string | null;
  lead_creation_channel: string | null;
  last_touch_source: string | null;
  expected_close_date: string | null;
  potential_value: number | string | null;
  currency: string | null;
  weighted_value: number | string | null;
  net_paid: number | string | null;
};

export type RevenueAttributionActionPayload = {
  matchingLeads: number;
  matchingOpenValued: number;
  topOpportunities: RevenueAttributionOpportunity[];
  closingThisMonth: RevenueAttributionOpportunity[];
  warning: string | null;
};

export type AttributionLeadCohort = {
  leadIds: Set<string>;
  matchingLeads: number;
  warning: string | null;
};

type UnknownRecord = Record<string, unknown>;

export function hasLeadCohortAttributionScope(scope: ExactAttributionScope) {
  return Boolean(clean(scope.creationChannel) || clean(scope.lastTouchSource));
}

export function hasRevenueAttributionScope(scope: ExactAttributionScope) {
  return Boolean(
    clean(scope.firstTouchSource) ||
      clean(scope.creationChannel) ||
      clean(scope.lastTouchSource),
  );
}

export async function getAttributionInvestigationLeadCohort(
  scope: ExactAttributionScope,
): Promise<AttributionLeadCohort> {
  if (!hasLeadCohortAttributionScope(scope)) {
    return { leadIds: new Set(), matchingLeads: 0, warning: null };
  }

  if (useMockData) {
    return {
      leadIds: new Set(),
      matchingLeads: 0,
      warning:
        "Exact Lead Creation / Last Marketing Touch cohorts are unavailable in demo data, so no unscoped records are shown.",
    };
  }

  const { supabase, organizationId } = await authorizedClient();
  const { data, error } = await (supabase as any).rpc(
    "get_attribution_investigation_lead_ids_v1",
    {
      p_organization_id: organizationId,
      p_creation_channel: clean(scope.creationChannel) || null,
      p_last_touch_source: clean(scope.lastTouchSource) || null,
    },
  );

  if (error) {
    throw new Error(`Unable to load exact attribution cohort: ${error.message}`);
  }

  const ids = new Set(
    (Array.isArray(data) ? data : [])
      .map((row) => asRecord(row)?.lead_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );

  return { leadIds: ids, matchingLeads: ids.size, warning: null };
}

export async function getRevenueAttributionActions(
  currentMonth: string,
  scope: ExactAttributionScope,
): Promise<RevenueAttributionActionPayload> {
  if (!hasRevenueAttributionScope(scope)) {
    return emptyRevenuePayload(null);
  }

  if (useMockData) {
    return emptyRevenuePayload(
      "Exact attribution Revenue action scope is unavailable in demo data, so unrelated opportunities are not substituted.",
    );
  }

  const { supabase, organizationId } = await authorizedClient();
  const { data, error } = await (supabase as any).rpc(
    "get_revenue_attribution_opportunities_v1",
    {
      p_organization_id: organizationId,
      p_current_month: currentMonth,
      p_first_touch_source: clean(scope.firstTouchSource) || null,
      p_creation_channel: clean(scope.creationChannel) || null,
      p_last_touch_source: clean(scope.lastTouchSource) || null,
    },
  );

  if (error) {
    throw new Error(`Unable to load Revenue attribution actions: ${error.message}`);
  }

  const payload = asRecord(data) ?? {};
  return {
    matchingLeads: toNumber(payload.matching_leads),
    matchingOpenValued: toNumber(payload.matching_open_valued),
    topOpportunities: rows(payload.top_opportunities),
    closingThisMonth: rows(payload.closing_this_month),
    warning: null,
  };
}

async function authorizedClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unable to load attribution investigation: user is not authenticated.");
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  return { supabase, organizationId };
}

function emptyRevenuePayload(warning: string | null): RevenueAttributionActionPayload {
  return {
    matchingLeads: 0,
    matchingOpenValued: 0,
    topOpportunities: [],
    closingThisMonth: [],
    warning,
  };
}

function rows(value: unknown): RevenueAttributionOpportunity[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => asRecord(row))
    .filter((row): row is UnknownRecord => Boolean(row))
    .map((row) => ({
      id: text(row.id),
      lead_code: nullableText(row.lead_code),
      lead_name: nullableText(row.lead_name),
      current_stage: nullableText(row.current_stage),
      preferred_location: nullableText(row.preferred_location),
      first_touch_source: nullableText(row.first_touch_source),
      lead_creation_channel: nullableText(row.lead_creation_channel),
      last_touch_source: nullableText(row.last_touch_source),
      expected_close_date: nullableText(row.expected_close_date),
      potential_value: numberish(row.potential_value),
      currency: nullableText(row.currency),
      weighted_value: numberish(row.weighted_value),
      net_paid: numberish(row.net_paid),
    }));
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function nullableText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || null;
}

function numberish(value: unknown): number | string | null {
  if (value == null || value === "") return null;
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
