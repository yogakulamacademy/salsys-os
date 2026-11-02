import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceContext, getEnabledOrganizationCapabilities } from "@/lib/workspace";

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
    // Use the same session-bound resolver as server pages, including its
    // membership-validated compatibility path when the fast RPC is unavailable.
    const workspace = await getCurrentWorkspaceContext(supabase);
    const organizationId = cleanText(workspace.activeWorkspace?.organizationId);
    const organizationName = cleanText(workspace.activeWorkspace?.organizationName);
    const organizationSlug = cleanText(workspace.activeWorkspace?.organizationSlug);
    const role = cleanText(workspace.activeWorkspace?.role);

    if (!organizationId || !role) {
      throw new Error("Unable to load workspace: workspace access denied.");
    }

    const capabilities = await getEnabledOrganizationCapabilities(
      supabase,
      organizationId,
    );

    const activeWorkspace = {
      organizationId,
      organizationName,
      organizationSlug,
      role,
    };

    // The client receives only the session-bound tenant and its enabled product
    // capabilities. Organization switching and capability mutation are not
    // exposed through this normal workspace endpoint.
    return NextResponse.json(
      {
        activeOrganizationId: organizationId,
        activeWorkspace,
        memberships: [activeWorkspace],
        capabilities,
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
