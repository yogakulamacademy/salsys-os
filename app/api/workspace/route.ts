import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContextForUser } from "@/lib/workspace";

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
  const { supabase, user } =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  try {
    const workspace =
      await getWorkspaceContextForUser(
        supabase,
        user.id,
      );

    return NextResponse.json({
      activeOrganizationId: workspace.activeOrganizationId,
      activeWorkspace: workspace.activeWorkspace,
      functionalWorkspaces: workspace.functionalWorkspaces,
      selectionRequired: false,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load workspace.";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}