import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";
import { isMockMode } from "@/lib/data";

export type UnvaluedOpportunity = {
  id: string;
  code: string;
  name: string;
  stage: string;
  createdAt: string | null;
  courseId: string | null;
  preferredBatchId: string | null;
};

export type OpportunityValuationQueue = {
  available: boolean;
  eligibleCount: number | null;
  needsValuationCount: number | null;
  priority: UnvaluedOpportunity[];
  recent: UnvaluedOpportunity[];
};

const PRIORITY_STAGES = ["payment_pending", "high_intent", "qualified"];
const OTHER_STAGES = ["new", "contacted", "engaged"];
const ELIGIBLE_STAGES = [...PRIORITY_STAGES, ...OTHER_STAGES];

/**
 * Read-only and organization-scoped; all changes are made in the existing
 * Lead Edit workflow where a human selects a batch or confirms a manual value.
 *
 * The queue is a triage view, not the canonical pipeline aggregate. The
 * Home V1 metrics RPC remains the source of truth for KPI counts and currency.
 */
export async function getOpportunityValuationQueue(): Promise<OpportunityValuationQueue> {
  if (isMockMode()) {
    return {
      available: false, eligibleCount: null,
      needsValuationCount: null, priority: [], recent: [],
    };
  }

  const workspace = await requirePrivilegedWorkspaceAccess();
  const supabase = await createClient();
  const missingValuePredicate =
    "potential_value.is.null,potential_value.lte.0,potential_currency.is.null";

  const leadColumns =
    "id, lead_code, display_name, first_name, last_name, current_stage, created_at, interested_course_id, preferred_batch_id";

  const [eligibleResult, missingResult, priorityResult, recentResult] =
    await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organization_id", workspace.organizationId)
        .eq("status", "open")
        .in("current_stage", ELIGIBLE_STAGES),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("organization_id", workspace.organizationId)
        .eq("status", "open")
        .in("current_stage", ELIGIBLE_STAGES)
        .or(missingValuePredicate),
      supabase.from("leads").select(leadColumns)
        .eq("organization_id", workspace.organizationId)
        .eq("status", "open")
        .in("current_stage", PRIORITY_STAGES)
        .or(missingValuePredicate)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("leads").select(leadColumns)
        .eq("organization_id", workspace.organizationId)
        .eq("status", "open")
        .in("current_stage", OTHER_STAGES)
        .or(missingValuePredicate)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const firstError = [
    eligibleResult.error, missingResult.error,
    priorityResult.error, recentResult.error,
  ].find(Boolean);
  if (firstError || eligibleResult.count == null || missingResult.count == null) {
    throw new Error("Unable to load organization-scoped opportunity valuation queue.");
  }

  const mapLead = (row: Record<string, unknown>): UnvaluedOpportunity => ({
    id: String(row.id ?? ""),
    code: String(row.lead_code ?? "Uncoded"),
    name: String(
      row.display_name ||
      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
      "Unnamed lead",
    ),
    stage: String(row.current_stage ?? "unknown"),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    courseId: typeof row.interested_course_id === "string" ? row.interested_course_id : null,
    preferredBatchId: typeof row.preferred_batch_id === "string" ? row.preferred_batch_id : null,
  });

  return {
    available: true,
    eligibleCount: eligibleResult.count,
    needsValuationCount: missingResult.count,
    priority: (priorityResult.data ?? []).map(mapLead),
    recent: (recentResult.data ?? []).map(mapLead),
  };
}
