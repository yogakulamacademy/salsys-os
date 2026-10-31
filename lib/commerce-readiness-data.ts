import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

export type CommerceReadiness = {
  healthStatus: string;
  operationalStatus: string;
  issueCount: number;
  details: Record<string, unknown>;
  canViewSystemHealth: boolean;
};

export async function getCommerceReadinessForCurrentWorkspace(): Promise<CommerceReadiness | null> {
  const workspace = await getCurrentWorkspaceContext();
  const active = workspace.activeWorkspace;

  if (!active) return null;

  /*
   * raw_events intentionally denies direct client access. The service-role
   * client is used only after the signed-in workspace has been resolved, and
   * the read is explicitly constrained to that organization ID.
   */
  const admin = createAdminClient() as any;
  const result = await admin
    .from("v_commerce_event_readiness_v1")
    .select("health_status,operational_status,issue_count,details")
    .eq("organization_id", active.organizationId)
    .maybeSingle();

  if (result.error || !result.data) {
    if (result.error) {
      console.error("Commerce readiness read degraded:", result.error.message);
    }
    return null;
  }

  const role = String(active.role ?? "");

  return {
    healthStatus: String(result.data.health_status ?? "healthy"),
    operationalStatus: String(result.data.operational_status ?? "active"),
    issueCount: Number(result.data.issue_count ?? 0) || 0,
    details:
      result.data.details && typeof result.data.details === "object"
        ? (result.data.details as Record<string, unknown>)
        : {},
    canViewSystemHealth: role === "owner" || role === "admin",
  };
}
