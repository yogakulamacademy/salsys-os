import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { DashboardPeriodSelection } from "@/lib/dashboard-period-data";

export type QualificationSource = {
  source: string;
  leads: number;
  qualified: number;
};

export type QualificationSnapshot = {
  cohortLeads: number;
  qualifiedLeads: number;
  historyCovered: number;
  sources: QualificationSource[];
  evidence: "historical-milestone";
};

export type PipelineSnapshot = {
  eligibleCount: number;
  valuedCount: number;
  missingValueCount: number;
  missingCurrencyCount: number;
  currencies: { currency: string; amount: number; opportunities: number }[];
  evidence: "current-open-leads";
};

export type HomeV1MetricTruth = {
  qualification: QualificationSnapshot | null;
  pipeline: PipelineSnapshot | null;
};

/**
 * Home V1 uses separate, privileged RPC contracts for period-end qualification
 * and open opportunity value. A missing RPC, denied access, or malformed response
 * must produce unavailable evidence rather than reverting to present-day stages
 * or an unverified legacy pipeline estimate.
 */
export async function getHomeV1MetricTruth(
  period: DashboardPeriodSelection,
): Promise<HomeV1MetricTruth> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    throw new Error("Unable to authenticate Home V1 metric truth.");
  }

  const organizationId = await requireCurrentOrganizationId(
    supabase,
    auth.data.user.id,
  );
  const [qualificationResponse, pipelineResponse] = await Promise.all([
    supabase.rpc("get_home_v1_qualification_snapshot", {
      p_organization_id: organizationId,
      p_start: period.startIso,
      p_end_exclusive: period.endExclusiveIso,
    }),
    supabase.rpc("get_home_v1_pipeline_snapshot", {
      p_organization_id: organizationId,
    }),
  ]);

  return {
    qualification: qualificationResponse.error
      ? null
      : parseQualification(qualificationResponse.data),
    pipeline: pipelineResponse.error
      ? null
      : parseHomePipelineSnapshot(pipelineResponse.data),
  };
}

function nonNegativeInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && value !== null ? n : null;
}

function nonNegativeAmount(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && value !== null ? n : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseQualification(value: unknown): QualificationSnapshot | null {
  const row = object(value);
  if (!row || row.basis !== "reached_qualification_milestone_by_period_end") {
    return null;
  }

  const cohortLeads = nonNegativeInteger(row.cohort_leads);
  const qualifiedLeads = nonNegativeInteger(row.qualified_leads);
  const historyCovered = nonNegativeInteger(row.history_covered);
  const rawSources = row.sources;
  if (cohortLeads == null || qualifiedLeads == null || historyCovered == null ||
      qualifiedLeads > cohortLeads || historyCovered > cohortLeads ||
      !Array.isArray(rawSources)) {
    return null;
  }

  const sources: QualificationSource[] = [];
  for (const item of rawSources) {
    const source = object(item);
    const leads = nonNegativeInteger(source?.leads);
    const qualified = nonNegativeInteger(source?.qualified);
    if (!source || typeof source.source !== "string" ||
        leads == null || qualified == null || qualified > leads) return null;
    sources.push({ source: source.source, leads, qualified });
  }

  // Source rows can be top-N, so do not require their totals to match the cohort.
  return { cohortLeads, qualifiedLeads, historyCovered, sources, evidence: "historical-milestone" };
}

export function parseHomePipelineSnapshot(value: unknown): PipelineSnapshot | null {
  const row = object(value);
  if (!row || row.basis !== "open_eligible_leads_snapshot") return null;
  const eligibleCount = nonNegativeInteger(row.eligible_count);
  const valuedCount = nonNegativeInteger(row.valued_count);
  const missingValueCount = nonNegativeInteger(row.missing_value_count);
  const missingCurrencyCount = nonNegativeInteger(row.missing_currency_count);
  const rawCurrencies = row.currencies;
  if (eligibleCount == null || valuedCount == null ||
      missingValueCount == null || missingCurrencyCount == null ||
      valuedCount + missingValueCount + missingCurrencyCount !== eligibleCount ||
      !Array.isArray(rawCurrencies)) {
    return null;
  }

  const currencies: PipelineSnapshot["currencies"] = [];
  for (const item of rawCurrencies) {
    const valueRow = object(item);
    const amount = nonNegativeAmount(valueRow?.amount);
    const opportunities = nonNegativeInteger(valueRow?.opportunities);
    if (!valueRow || typeof valueRow.currency !== "string" ||
        !/^[A-Z]{3}$/.test(valueRow.currency) ||
        amount == null || opportunities == null) return null;
    currencies.push({ currency: valueRow.currency, amount, opportunities });
  }
  if (currencies.reduce((sum, entry) => sum + entry.opportunities, 0) !== valuedCount) {
    return null;
  }
  return {
    eligibleCount, valuedCount, missingValueCount, missingCurrencyCount,
    currencies, evidence: "current-open-leads",
  };
}
