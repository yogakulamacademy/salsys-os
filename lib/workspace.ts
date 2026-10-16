import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_WORKSPACE_COOKIE = "yk-active-workspace";
export const ACTIVE_ORGANIZATION_COOKIE = ACTIVE_WORKSPACE_COOKIE;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type WorkspaceMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

export type WorkspaceContext = {
  activeOrganizationId: string | null;
  activeWorkspace: WorkspaceMembership | null;
  memberships: WorkspaceMembership[];
  selectionRequired: boolean;
};

async function bindCurrentTenantSession(
  supabase: ServerSupabaseClient,
  organizationId: string,
) {
  const { error } = await supabase.rpc("bind_current_tenant_session", {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(
      `Unable to bind the authenticated session to its tenant: ${error.message}`,
    );
  }
}

export async function getWorkspaceContextForUser(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<WorkspaceContext> {
  const cookieStore = await cookies();
  const boundOrganizationId =
    cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim() ?? "";

  if (boundOrganizationId) {
    await bindCurrentTenantSession(supabase, boundOrganizationId);
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId)
    .eq("active", true);

  if (membershipError) {
    throw new Error(
      `Unable to load organization memberships: ${membershipError.message}`,
    );
  }

  const organizationIds = Array.from(
    new Set(
      (membershipRows ?? [])
        .map((row) => String(row.organization_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (organizationIds.length === 0) {
    return {
      activeOrganizationId: null,
      activeWorkspace: null,
      memberships: [],
      selectionRequired: false,
    };
  }

  const { data: organizationRows, error: organizationError } = await supabase
    .from("organizations")
    .select("id,name,slug,status")
    .in("id", organizationIds)
    .eq("status", "active");

  if (organizationError) {
    throw new Error(
      `Unable to load organizations: ${organizationError.message}`,
    );
  }

  const organizationsById = new Map(
    (organizationRows ?? []).map((organization) => [
      String(organization.id),
      organization,
    ]),
  );

  const memberships: WorkspaceMembership[] = (membershipRows ?? [])
    .flatMap((membership) => {
      const organizationId = String(membership.organization_id ?? "").trim();
      const organization = organizationsById.get(organizationId);

      if (!organization) {
        return [];
      }

      return [
        {
          organizationId,
          organizationName: String(organization.name ?? "").trim(),
          organizationSlug: String(organization.slug ?? "").trim(),
          role: String(membership.role ?? "").trim(),
        },
      ];
    })
    .sort((left, right) =>
      left.organizationName.localeCompare(right.organizationName),
    );

  let activeWorkspace: WorkspaceMembership | null = null;

  if (memberships.length === 1) {
    activeWorkspace = memberships[0];
  } else if (memberships.length > 1) {
    activeWorkspace =
      memberships.find(
        (membership) => membership.organizationId === boundOrganizationId,
      ) ?? null;
  }

  if (
    activeWorkspace &&
    activeWorkspace.organizationId !== boundOrganizationId
  ) {
    await bindCurrentTenantSession(supabase, activeWorkspace.organizationId);
  }

  return {
    activeOrganizationId: activeWorkspace?.organizationId ?? null,
    activeWorkspace,
    memberships,
    selectionRequired: false,
  };
}

export async function requireCurrentOrganizationId(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<string> {
  const workspace = await getWorkspaceContextForUser(supabase, userId);

  if (workspace.memberships.length === 0) {
    throw new Error("No active organization membership was found.");
  }

  if (!workspace.activeOrganizationId) {
    throw new Error(
      "Tenant context is not bound. Sign in through your organization-specific login link.",
    );
  }

  return workspace.activeOrganizationId;
}

export async function getCurrentWorkspaceContext(
  suppliedSupabase?: ServerSupabaseClient,
): Promise<WorkspaceContext> {
  const supabase = suppliedSupabase ?? (await createClient());

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to resolve current organization: user is not authenticated.",
    );
  }

  return getWorkspaceContextForUser(supabase, user.id);
}
