/**
 * Evaluate the scoped Sales transfer role from the authenticated workspace
 * context. This is presentation/endpoint authorization, not a replacement for
 * RLS and each underlying write RPC's tenant and role validation.
 */
export function canManageLeadsTransferForWorkspace({
  expectedOrganizationId,
  activeOrganizationId,
  organizationRole,
  workspaceCodes,
  salesMembershipRole,
}: {
  expectedOrganizationId: string;
  activeOrganizationId: string | null;
  organizationRole: string | null;
  workspaceCodes: unknown;
  salesMembershipRole: string | null;
}): boolean {
  if (!expectedOrganizationId || activeOrganizationId !== expectedOrganizationId) return false;
  if (
    !Array.isArray(workspaceCodes) ||
    !workspaceCodes.includes("sales")
  ) return false;

  const orgRole = organizationRole?.trim().toLowerCase();
  if (orgRole === "owner" || orgRole === "admin") return true;

  return salesMembershipRole?.trim().toLowerCase() === "manager";
}
