import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type R5RevenueReconciliationRow = {
  currency: string;
  ledger_actual: number;
  reported_actual: number;
  difference: number;
};

export type R5MeasurementHealth = {
  integrityOk: boolean;
  hardIssueCount: number;
  leadCount: number;
  attributionFactCount: number;
  attributionModelRowCount: number;
  expectedAttributionModelRowCount: number;
  revenueStatusRowCount: number;
  duplicateAttributionCount: number;
  touchpointPointerMismatchCount: number;
  firstTouchCoveragePct: number;
  lastTouchCoveragePct: number;
  revenueReconciliationIssueCount: number;
  revenueReconciliation: R5RevenueReconciliationRow[];
  note: string;
};

type RpcPayload = Record<string, unknown>;

export async function getR5MeasurementHealth(): Promise<R5MeasurementHealth | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    const organizationId = await requireCurrentOrganizationId(supabase, user.id);

    const { data, error } = await supabase.rpc("get_r5_measurement_health_v1", {
      p_organization_id: organizationId,
    });

    if (error || !data || typeof data !== "object") {
      console.warn("R5_MEASUREMENT_HEALTH_FAILED", error?.message ?? "empty response");
      return null;
    }

    return mapPayload(data as RpcPayload);
  } catch (error) {
    console.warn(
      "R5_MEASUREMENT_HEALTH_FAILED",
      error instanceof Error ? error.message : "unknown",
    );
    return null;
  }
}

function mapPayload(payload: RpcPayload): R5MeasurementHealth {
  return {
    integrityOk: payload.integrity_ok === true,
    hardIssueCount: numberValue(payload.hard_issue_count),
    leadCount: numberValue(payload.lead_count),
    attributionFactCount: numberValue(payload.attribution_fact_count),
    attributionModelRowCount: numberValue(payload.attribution_model_row_count),
    expectedAttributionModelRowCount: numberValue(
      payload.expected_attribution_model_row_count,
    ),
    revenueStatusRowCount: numberValue(payload.revenue_status_row_count),
    duplicateAttributionCount: numberValue(payload.duplicate_attribution_count),
    touchpointPointerMismatchCount: numberValue(
      payload.touchpoint_pointer_mismatch_count,
    ),
    firstTouchCoveragePct: numberValue(payload.first_touch_coverage_pct),
    lastTouchCoveragePct: numberValue(payload.last_touch_coverage_pct),
    revenueReconciliationIssueCount: numberValue(
      payload.revenue_reconciliation_issue_count,
    ),
    revenueReconciliation: reconciliationRows(payload.revenue_reconciliation),
    note: String(payload.note ?? ""),
  };
}

function reconciliationRows(value: unknown): R5RevenueReconciliationRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      currency: String(row.currency ?? ""),
      ledger_actual: numberValue(row.ledger_actual),
      reported_actual: numberValue(row.reported_actual),
      difference: numberValue(row.difference),
    }));
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
