import "server-only";

import { cookies } from "next/headers";
import { safeUpstreamErrorMessage } from "@/lib/errors/safe-upstream-error";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_WORKSPACE_COOKIE = "salsys-active-workspace";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type FastWorkspaceContextPayload = {
  organization_id?: unknown;
  active_organization_id?: unknown;
  organization_name?: unknown;
  organization_slug?: unknown;
  role?: unknown;
};

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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

async function bindCurrentTenantSession(
  supabase: ServerSupabaseClient,
  organizationId: string,
) {
  const { error } = await supabase.rpc("bind_current_tenant_session", {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(
      `Unable to bind the authenticated session to its tenant: ${safeUpstreamErrorMessage(
        error,
        "Supabase tenant binding failed",
      )}`,
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
      `Unable to load organization memberships: ${safeUpstreamErrorMessage(
        membershipError,
        "Supabase membership lookup failed",
      )}`,
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
      `Unable to load organizations: ${safeUpstreamErrorMessage(
        organizationError,
        "Supabase organization lookup failed",
      )}`,
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

async function getFastCurrentWorkspaceContext(
  supabase: ServerSupabaseClient,
): Promise<WorkspaceContext | null> {
  const { data, error } = await (supabase as any).rpc(
    "get_current_workspace_context_v1",
  );

  if (
    error ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return null;
  }

  const payload = data as FastWorkspaceContextPayload;
  const organizationId = cleanText(
    payload.active_organization_id ?? payload.organization_id,
  );
  const role = cleanText(payload.role);

  if (!organizationId || !role) {
    return null;
  }

  const activeWorkspace: WorkspaceMembership = {
    organizationId,
    organizationName: cleanText(payload.organization_name),
    organizationSlug: cleanText(payload.organization_slug),
    role,
  };

  return {
    activeOrganizationId: organizationId,
    activeWorkspace,
    memberships: [activeWorkspace],
    selectionRequired: false,
  };
}

async function getFastCurrentOrganizationId(
  supabase: ServerSupabaseClient,
): Promise<string | null> {
  const workspace = await getFastCurrentWorkspaceContext(supabase);
  return workspace?.activeOrganizationId ?? null;
}

export async function requireCurrentOrganizationId(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<string> {
  // Hot path: resolve/refresh the authenticated tenant in one RPC instead of
  // querying memberships + organizations for every server-side data loader.
  // Keep the legacy resolver as a compatibility fallback if the RPC is absent
  // or temporarily unavailable.
  const fastOrganizationId = await getFastCurrentOrganizationId(supabase);

  if (fastOrganizationId) {
    return fastOrganizationId;
  }

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

  // Normal authenticated requests already have one session-bound active tenant.
  // Resolve that tenant, its role and display metadata in one RPC. If the RPC is
  // unavailable, preserve the full legacy membership resolver as a safe fallback.
  const fastWorkspace = await getFastCurrentWorkspaceContext(supabase);

  if (fastWorkspace) {
    return fastWorkspace;
  }

  return getWorkspaceContextForUser(supabase, user.id);
}
