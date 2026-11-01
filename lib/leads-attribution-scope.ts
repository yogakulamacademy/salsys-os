import { useMockData } from "@/lib/config";
import {
  LEADS_PAGE_SIZE,
  getLeadsWorkspacePage,
  type LeadListIntelligence,
  type LeadsWorkspaceFilters,
  type LeadsWorkspacePageData,
} from "@/lib/leads-data";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { LeadOverview } from "@/types/crm";

type SearchParamValue = string | string[] | undefined;
type SearchParamsLike = Record<string, SearchParamValue>;
type UnknownRecord = Record<string, unknown>;

export type LeadsAttributionScope = {
  creationChannel: string;
  lastTouchSource: string;
};

export function parseLeadsAttributionScope(params: SearchParamsLike): LeadsAttributionScope {
  return {
    creationChannel: one(params.creation_channel).trim(),
    lastTouchSource: one(params.last_touch_source).trim(),
  };
}

export function hasLeadsAttributionScope(scope: LeadsAttributionScope) {
  return Boolean(scope.creationChannel || scope.lastTouchSource);
}

export async function getLeadsWorkspacePageWithAttributionScope(
  filters: LeadsWorkspaceFilters,
  scope: LeadsAttributionScope,
): Promise<LeadsWorkspacePageData> {
  if (!hasLeadsAttributionScope(scope)) {
    return getLeadsWorkspacePage(filters);
  }

  // Demo data does not carry a canonical last-marketing-touch field. Never
  // pretend an exact attribution filter was applied to an unscoped mock cohort.
  if (useMockData) {
    const base = await getLeadsWorkspacePage(filters);
    return {
      ...base,
      leads: [],
      intelligence: [],
      pagination: {
        page: 1,
        pageSize: base.pagination.pageSize,
        total: 0,
        totalPages: 1,
        from: 0,
        to: 0,
      },
      warning:
        "Exact Lead Creation / Last Marketing Touch scope is unavailable in demo data, so no unscoped records are shown.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unable to load scoped Leads workspace: user is not authenticated.");
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  const { data, error } = await (supabase as any).rpc("get_leads_workspace_page_v3", {
    p_organization_id: organizationId,
    p_page: filters.page,
    p_page_size: LEADS_PAGE_SIZE,
    p_query: valueOrNull(filters.query),
    p_stage: valueOrNull(filters.stage),
    p_source: valueOrNull(filters.source),
    p_channel: valueOrNull(filters.channel),
    p_owner: valueOrNull(filters.owner),
    p_course: valueOrNull(filters.course),
    p_aging: valueOrNull(filters.aging),
    p_quick_view: filters.quickView,
    p_sort: filters.sort,
    p_creation_channel: valueOrNull(scope.creationChannel),
    p_last_touch_source: valueOrNull(scope.lastTouchSource),
  });

  if (error) {
    throw new Error(`Unable to apply exact attribution scope in Leads: ${error.message}`);
  }

  const payload = asRecord(data);
  if (!payload) {
    throw new Error("Unable to load scoped Leads workspace: the read model returned an invalid payload.");
  }

  const rows = arrayFrom(payload.rows);
  const summaryRow = asRecord(payload.summary) ?? {};
  const optionsRow = asRecord(payload.options) ?? {};
  const paginationRow = asRecord(payload.pagination) ?? {};

  return {
    leads: rows.map(mapLeadRow),
    intelligence: rows.map(mapIntelligenceRow),
    summary: {
      all: toNumber(summaryRow.all),
      unassigned: toNumber(summaryRow.unassigned),
      stuck: toNumber(summaryRow.stuck),
      followupOverdue: toNumber(summaryRow.followup_overdue),
      paymentPending: toNumber(summaryRow.payment_pending),
    },
    options: {
      stages: stringArray(optionsRow.stages),
      sources: stringArray(optionsRow.sources),
      channels: stringArray(optionsRow.channels),
      owners: stringArray(optionsRow.owners),
      courses: stringArray(optionsRow.courses),
    },
    pagination: {
      page: Math.max(1, toNumber(paginationRow.page, 1)),
      pageSize: Math.max(1, toNumber(paginationRow.page_size, LEADS_PAGE_SIZE)),
      total: Math.max(0, toNumber(paginationRow.total)),
      totalPages: Math.max(1, toNumber(paginationRow.total_pages, 1)),
      from: Math.max(0, toNumber(paginationRow.from)),
      to: Math.max(0, toNumber(paginationRow.to)),
    },
    warning: null,
  };
}

function mapLeadRow(input: unknown): LeadOverview {
  const row = asRecord(input) ?? {};
  return {
    id: String(row.id ?? ""),
    leadCode: stringValue(row.lead_code),
    name:
      stringValue(row.lead_name) ||
      stringValue(row.display_name) ||
      stringValue(row.lead_code),
    email: optionalString(row.email),
    phone: optionalString(row.phone),
    course: stringValue(row.course_name) || "Not selected",
    location: stringValue(row.preferred_location) || "—",
    country: stringValue(row.country) || "—",
    stage: row.current_stage as LeadOverview["stage"],
    intent: row.intent as LeadOverview["intent"],
    firstTouchSource: stringValue(row.first_touch_source) || "Unknown",
    firstTouchMedium: stringValue(row.first_touch_medium) || "Unknown",
    firstTouchCampaign: stringValue(row.first_touch_campaign) || "Unattributed",
    leadCreationChannel: (row.lead_creation_channel ?? "other") as LeadOverview["leadCreationChannel"],
    currentContactChannel: (row.current_contact_channel ?? "other") as LeadOverview["currentContactChannel"],
    owner: stringValue(row.owner_name) || (row.owner_user_id ? "Assigned" : "Unassigned"),
    lastContactedAt: optionalString(row.last_contacted_at),
    nextFollowupAt: optionalString(row.next_followup_at),
    createdAt: stringValue(row.created_at),
    value: row.enrollment_value == null ? undefined : toNumber(row.enrollment_value),
    currency: optionalString(row.enrollment_currency),
  };
}

function mapIntelligenceRow(input: unknown): LeadListIntelligence {
  const row = asRecord(input) ?? {};
  const agingStatus = stringValue(row.aging_status);
  return {
    lead_id: stringValue(row.id),
    owner_user_id: nullableString(row.owner_user_id),
    owner_name: nullableString(row.owner_name),
    aging_status: isAgingStatus(agingStatus) ? agingStatus : null,
    stage_entered_at: nullableString(row.stage_entered_at),
    stage_age_hours: numberish(row.stage_age_hours),
    stage_age_days: numberish(row.stage_age_days),
    warning_after_days: numberish(row.warning_after_days),
    stuck_after_days: numberish(row.stuck_after_days),
    days_over_stuck_threshold: numberish(row.days_over_stuck_threshold),
    days_since_last_contact: numberish(row.days_since_last_contact),
    preferred_batch_id: nullableString(row.preferred_batch_id),
    batch_code: nullableString(row.batch_code),
    batch_location: nullableString(row.batch_location),
    batch_start_date: nullableString(row.batch_start_date),
    batch_end_date: nullableString(row.batch_end_date),
  };
}

function one(value: SearchParamValue) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function valueOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function optionalString(value: unknown) {
  const text = stringValue(value).trim();
  return text || undefined;
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim();
  return text || null;
}

function numberish(value: unknown): number | string | null {
  if (value == null || value === "") return null;
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isAgingStatus(
  value: string,
): value is "healthy" | "warning" | "stuck" | "untracked" {
  return ["healthy", "warning", "stuck", "untracked"].includes(value);
}
