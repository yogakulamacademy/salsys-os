import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_WORKSPACE_COOKIE = "yk-active-workspace";

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
    const selectedOrganizationId =
      cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim() ?? "";

    activeWorkspace =
      memberships.find(
        (membership) =>
          membership.organizationId === selectedOrganizationId,
      ) ?? null;
  }

  return {
    activeOrganizationId: activeWorkspace?.organizationId ?? null,
    activeWorkspace,
    memberships,
    selectionRequired: memberships.length > 1 && !activeWorkspace,
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
      "Multiple active organization memberships were found. Workspace selection is required.",
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
