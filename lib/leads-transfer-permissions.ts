import "server-only";

import { createClient } from "@/lib/supabase/server";
import { canManageLeadsTransferForWorkspace } from "@/lib/leads-transfer-policy";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type LeadsTransferPermissions = {
  canExport: boolean;
  canImport: boolean;
  canExportContacts: boolean;
};

const DENIED: LeadsTransferPermissions = {
  canExport: false,
  canImport: false,
  canExportContacts: false,
};

/**
 * The internal can_manage_sales_workspace RPC is intentionally not callable by
 * authenticated clients (20261014 internal-helper hardening). Do not re-grant
 * it. Instead, derive the same role decision from:
 *   - the authenticated, session-bound workspace context RPC;
 *   - the caller's own RLS-scoped Sales membership (for Sales managers);
 *   - the separate authorized can_view_lead_pii RPC for sensitive fields.
 *
 * A missing/failed check fails closed. Data reads and writes still enforce
 * their own RLS and database-side authorization.
 */
export async function getLeadsTransferPermissions(
  supabase: ServerSupabaseClient,
  userId: string,
  expectedOrganizationId: string,
): Promise<LeadsTransferPermissions> {
  if (!userId || !expectedOrganizationId) return DENIED;

  const { data, error } = await supabase.rpc("get_current_workspace_context_v1");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return DENIED;

  const context = data as Record<string, unknown>;
  const activeOrganizationId = String(context.active_organization_id ?? context.organization_id ?? "");
  const organizationRole = typeof context.role === "string" ? context.role : null;
  const workspaceCodes = context.workspace_codes;

  if (activeOrganizationId !== expectedOrganizationId) return DENIED;
  if (!Array.isArray(workspaceCodes) || !workspaceCodes.includes("sales")) return DENIED;

  let salesMembershipRole: string | null = null;
  const elevatedOrgRole = organizationRole === "owner" || organizationRole === "admin";

  if (!elevatedOrgRole) {
    const membership = await supabase
      .from("workspace_memberships")
      .select("role")
      .eq("organization_id", expectedOrganizationId)
      .eq("workspace_code", "sales")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    if (membership.error) return DENIED;
    salesMembershipRole = membership.data?.role ?? null;
  }

  const canExport = canManageLeadsTransferForWorkspace({
    expectedOrganizationId,
    activeOrganizationId,
    organizationRole,
    workspaceCodes,
    salesMembershipRole,
  });
  if (!canExport) return DENIED;

  const { data: contactGrant, error: contactError } = await supabase.rpc("can_view_lead_pii");
  const canExportContacts = !contactError && contactGrant === true;

  return {
    canExport: true,
    canImport: canExportContacts,
    canExportContacts,
  };
}
