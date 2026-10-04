import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  getWorkspaceContextForUser,
} from "@/lib/workspace";

const WORKSPACE_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 30;

function workspaceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE_SECONDS,
  };
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

    return NextResponse.json(workspace);
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

export async function POST(request: Request) {
  const { supabase, user } =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const organizationId =
    body &&
    typeof body === "object" &&
    "organizationId" in body &&
    typeof body.organizationId === "string"
      ? body.organizationId.trim()
      : "";

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required." },
      { status: 400 },
    );
  }

  try {
    const workspace =
      await getWorkspaceContextForUser(
        supabase,
        user.id,
      );

    const selectedWorkspace =
      workspace.memberships.find(
        (membership) =>
          membership.organizationId ===
          organizationId,
      );

    if (!selectedWorkspace) {
      return NextResponse.json(
        {
          error:
            "You do not have an active membership in that workspace.",
        },
        { status: 403 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      activeOrganizationId:
        selectedWorkspace.organizationId,
      activeWorkspace: selectedWorkspace,
    });

    response.cookies.set(
      ACTIVE_WORKSPACE_COOKIE,
      selectedWorkspace.organizationId,
      workspaceCookieOptions(),
    );

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to switch workspace.";

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
