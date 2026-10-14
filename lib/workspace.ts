import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Tenant binding cookie. It is set only after organization-specific sign-in and
// is always revalidated against an active organization membership server-side.
// Keep the legacy cookie name for session compatibility during the migration.
export const ACTIVE_ORGANIZATION_COOKIE = "yk-active-workspace";

/** @deprecated Use ACTIVE_ORGANIZATION_COOKIE. */
export const ACTIVE_WORKSPACE_COOKIE = ACTIVE_ORGANIZATION_COOKIE;

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type WorkspaceMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
};

export type FunctionalWorkspaceAccess = {
  organizationId: string;
  code: string;
  name: string;
  description: string;
  role: string;
  sortOrder: number;
};

export type WorkspaceContext = {
  activeOrganizationId: string | null;
  activeWorkspace: WorkspaceMembership | null;
  memberships: WorkspaceMembership[];
  functionalWorkspaces: FunctionalWorkspaceAccess[];
  selectionRequired: boolean;
};

async function getFunctionalWorkspacesForUser(
  supabase: ServerSupabaseClient,
  userId: string,
  activeWorkspace: WorkspaceMembership,
): Promise<FunctionalWorkspaceAccess[]> {
  const organizationId = activeWorkspace.organizationId;
  const organizationRole = activeWorkspace.role;

  const {
    data: organizationWorkspaceRows,
    error: organizationWorkspaceError,
  } = await supabase
    .from("organization_workspaces")
    .select("workspace_code")
    .eq("organization_id", organizationId)
    .eq("enabled", true);

  if (organizationWorkspaceError) {
    throw new Error(
      `Unable to load enabled workspaces: ${organizationWorkspaceError.message}`,
    );
  }

  const enabledCodes = Array.from(
    new Set(
      (organizationWorkspaceRows ?? [])
        .map((row) => String(row.workspace_code ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (enabledCodes.length === 0) {
    return [];
  }

  const { data: catalogRows, error: catalogError } = await supabase
    .from("workspace_catalog")
    .select("code,name,description,sort_order,status")
    .in("code", enabledCodes)
    .eq("status", "active");

  if (catalogError) {
    throw new Error(
      `Unable to load workspace catalog: ${catalogError.message}`,
    );
  }

  const effectiveRoles = new Map<string, string>();

  if (organizationRole === "owner" || organizationRole === "admin") {
    for (const code of enabledCodes) {
      effectiveRoles.set(code, organizationRole);
    }
  } else {
    const { data: workspaceMembershipRows, error: workspaceMembershipError } =
      await supabase
        .from("workspace_memberships")
        .select("workspace_code,role")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .eq("active", true)
        .in("workspace_code", enabledCodes);

    if (workspaceMembershipError) {
      throw new Error(
        `Unable to load workspace memberships: ${workspaceMembershipError.message}`,
      );
    }

    for (const membership of workspaceMembershipRows ?? []) {
      const code = String(membership.workspace_code ?? "").trim();
      const role = String(membership.role ?? "").trim();

      if (code && role) {
        effectiveRoles.set(code, role);
      }
    }
  }

  return (catalogRows ?? [])
    .flatMap((workspace) => {
      const code = String(workspace.code ?? "").trim();
      const role = effectiveRoles.get(code);

      if (!code || !role) {
        return [];
      }

      return [
        {
          organizationId,
          code,
          name: String(workspace.name ?? "").trim(),
          description: String(workspace.description ?? "").trim(),
          role,
          sortOrder: Number(workspace.sort_order ?? 100),
        },
      ];
    })
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name);
    });
}

export async function getWorkspaceContextForUser(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<WorkspaceContext> {
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
      functionalWorkspaces: [],
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
    const cookieStore = await cookies();
    const boundOrganizationId =
      cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value?.trim() ?? "";

    // The cookie never grants membership. It only identifies which already-
    // authorized tenant login established this session context.
    activeWorkspace =
      memberships.find(
        (membership) => membership.organizationId === boundOrganizationId,
      ) ?? null;
  }

  const functionalWorkspaces = activeWorkspace
    ? await getFunctionalWorkspacesForUser(supabase, userId, activeWorkspace)
    : [];

  return {
    activeOrganizationId: activeWorkspace?.organizationId ?? null,
    activeWorkspace,
    memberships,
    functionalWorkspaces,
    selectionRequired: false,
  };
}

export async function requireCurrentOrganizationId(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<string> {
  const workspace = await getWorkspaceContextForUser(
    supabase,
    userId,
  );

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

export async function getCurrentWorkspaceContext(): Promise<WorkspaceContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to resolve current organization: user is not authenticated.",
    );
  }

  return getWorkspaceContextForUser(
    supabase,
    user.id,
  );
}
