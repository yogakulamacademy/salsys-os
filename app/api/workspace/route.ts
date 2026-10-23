import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type WorkspaceRpcPayload = {
  organization_id?: unknown;
  active_organization_id?: unknown;
  organization_name?: unknown;
  organization_slug?: unknown;
  role?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

async function getAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return {
    supabase,
    user: error ? null : user,
  };
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const { data, error } = await supabase.rpc(
      "get_current_workspace_context_v1",
    );

    if (error) {
      throw new Error(`Unable to load workspace: ${error.message}`);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Unable to load workspace: invalid workspace context.");
    }

    const payload = data as WorkspaceRpcPayload;
    const organizationId = cleanText(
      payload.active_organization_id ?? payload.organization_id,
    );
    const organizationName = cleanText(payload.organization_name);
    const organizationSlug = cleanText(payload.organization_slug);
    const role = cleanText(payload.role);

    if (!organizationId || !role) {
      throw new Error("Unable to load workspace: workspace access denied.");
    }

    const activeWorkspace = {
      organizationId,
      organizationName,
      organizationSlug,
      role,
    };

    // The client receives only the session-bound tenant. Organization switching
    // is intentionally not exposed in the normal SalsysOS UI/API.
    return NextResponse.json(
      {
        activeOrganizationId: organizationId,
        activeWorkspace,
        memberships: [activeWorkspace],
        selectionRequired: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load workspace.";

    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
