import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  FUNCTIONAL_WORKSPACE_DEFINITIONS,
  getFunctionalWorkspaceForPathname,
  getFunctionalWorkspaceRootPath,
  isFunctionalWorkspaceRouteAllowed,
  isUsableFunctionalWorkspaceRole,
} from "@/lib/functional-workspaces";

/*
|--------------------------------------------------------------------------
| Public integration routes
|--------------------------------------------------------------------------
|
| These endpoints must be reachable without a normal CRM browser session.
| Each endpoint is responsible for its own route-level authentication,
| webhook validation, secret validation, origin checks, etc.
|
*/

const PUBLIC_EXACT_PATHS = new Set([
  "/salsys.js",
  "/yogakulam-tracker.js",
  "/api/leads/capture",
  "/api/analytics/ga4/sync",
  "/api/analytics/gsc/sync",
  "/api/analytics/google-ads/sync",
  "/api/analytics/meta-ads/sync",
  "/api/admissions/auto-tasks",
  "/api/conversion-feedback/run",
  "/api/whatsapp/webhook",
  "/api/instagram/webhook",
  "/api/sync/course-batches",
  "/api/tracking/collect",
  "/api/tracking/consent",
  "/api/tracking/identify",
]);

const ACTIVE_ORGANIZATION_COOKIE = "yk-active-workspace";
const ORGANIZATION_SELECTION_PATH = "/workspace";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function isPublicPath(pathname: string) {
  return PUBLIC_EXACT_PATHS.has(normalizePathname(pathname));
}

function redirectWithAuthCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
  searchParams?: Record<string, string>,
) {
  const redirectUrl = request.nextUrl.clone();

  redirectUrl.pathname = pathname;
  redirectUrl.search = "";

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  const redirectResponse = NextResponse.redirect(redirectUrl);

  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

function authConfigurationError(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRM authentication is not configured.",
      },
      {
        status: 503,
      },
    );
  }

  return new NextResponse("CRM authentication is not configured.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function accessDenied(pathname: string, message: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 403,
      },
    );
  }

  return new NextResponse(message, {
    status: 403,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

type OrganizationGrant = {
  organizationId: string;
  role: string;
};

type WorkspaceGrant = {
  code: string;
  role: string;
};

type OrganizationMembershipRow = {
  organization_id: string | null;
  role: string | null;
};

type OrganizationRow = {
  id: string;
};

type EnabledWorkspaceRow = {
  workspace_code: string | null;
};

type WorkspaceMembershipRow = {
  workspace_code: string | null;
  role: string | null;
};

async function getActiveOrganizationGrants(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<OrganizationGrant[]> {
  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId)
    .eq("active", true);

  if (membershipError) {
    throw new Error("Unable to resolve organization membership.");
  }

  const organizationIds = Array.from(
    new Set(
      (membershipRows ?? [])
        .map((row: OrganizationMembershipRow) =>
          String(row.organization_id ?? "").trim(),
        )
        .filter(Boolean),
    ),
  );

  if (organizationIds.length === 0) {
    return [];
  }

  const { data: organizationRows, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .in("id", organizationIds)
    .eq("status", "active");

  if (organizationError) {
    throw new Error("Unable to resolve active organizations.");
  }

  const activeOrganizationIds = new Set(
    (organizationRows ?? []).map((row: OrganizationRow) => String(row.id)),
  );

  return (membershipRows ?? []).flatMap(
    (membership: OrganizationMembershipRow) => {
      const organizationId = String(
        membership.organization_id ?? "",
      ).trim();

      if (!activeOrganizationIds.has(organizationId)) {
        return [];
      }

      return [
        {
          organizationId,
          role: String(membership.role ?? "").trim().toLowerCase(),
        },
      ];
    },
  );
}

async function getWorkspaceGrants(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  organization: OrganizationGrant,
): Promise<WorkspaceGrant[]> {
  const { data: enabledRows, error: enabledError } = await supabase
    .from("organization_workspaces")
    .select("workspace_code")
    .eq("organization_id", organization.organizationId)
    .eq("enabled", true);

  if (enabledError) {
    throw new Error("Unable to resolve enabled workspaces.");
  }

  const enabledCodes = new Set(
    (enabledRows ?? [])
      .map((row: EnabledWorkspaceRow) =>
        String(row.workspace_code ?? "").trim().toLowerCase(),
      )
      .filter(Boolean),
  );

  if (organization.role === "owner" || organization.role === "admin") {
    return FUNCTIONAL_WORKSPACE_DEFINITIONS.flatMap((definition) =>
      enabledCodes.has(definition.code)
        ? [{ code: definition.code, role: organization.role }]
        : [],
    );
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("workspace_code,role")
    .eq("organization_id", organization.organizationId)
    .eq("user_id", userId)
    .eq("active", true);

  if (membershipError) {
    throw new Error("Unable to resolve workspace memberships.");
  }

  const rolesByCode = new Map<string, string>();

  for (const membership of (membershipRows ?? []) as WorkspaceMembershipRow[]) {
    const code = String(membership.workspace_code ?? "").trim().toLowerCase();
    const role = String(membership.role ?? "").trim().toLowerCase();

    if (enabledCodes.has(code) && isUsableFunctionalWorkspaceRole(role)) {
      rolesByCode.set(code, role);
    }
  }

  return FUNCTIONAL_WORKSPACE_DEFINITIONS.flatMap((definition) => {
    const role = rolesByCode.get(definition.code);

    return role ? [{ code: definition.code, role }] : [];
  });
}

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

export async function middleware(request: NextRequest) {
  const localMockMode =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  if (localMockMode) {
    return NextResponse.next();
  }

  const pathname = normalizePathname(request.nextUrl.pathname);

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return authConfigurationError(pathname);
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },

      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: claimsResult } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub ?? null;

  if (pathname === "/login") {
    if (!userId) {
      return response;
    }

    const { data: loginProfile } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", userId)
      .maybeSingle();

    if (loginProfile?.active === true) {
      return redirectWithAuthCookies(request, response, "/dashboard");
    }

    return response;
  }

  if (!userId) {
    return redirectWithAuthCookies(request, response, "/login", {
      next: pathname,
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          error: "CRM access is disabled.",
        },
        {
          status: 403,
        },
      );
    }

    return redirectWithAuthCookies(request, response, "/login", {
      error: "access-disabled",
    });
  }

  /*
   * /workspace remains the organization selector. /api/workspace is the
   * compatibility tenant-selection API. Functional workspace routes live at
   * /workspace/<code> and continue through the authorization checks below.
   */
  if (
    pathname === ORGANIZATION_SELECTION_PATH ||
    pathname === "/api/workspace"
  ) {
    return response;
  }

  let organizationGrants: OrganizationGrant[];

  try {
    organizationGrants = await getActiveOrganizationGrants(supabase, userId);
  } catch (error) {
    return accessDenied(
      pathname,
      error instanceof Error
        ? error.message
        : "Organization access unavailable.",
    );
  }

  if (organizationGrants.length === 0) {
    return accessDenied(pathname, "No active organization access is assigned.");
  }

  const selectedOrganizationId =
    request.cookies.get(ACTIVE_ORGANIZATION_COOKIE)?.value?.trim() ?? "";

  const activeOrganization =
    organizationGrants.length === 1
      ? organizationGrants[0]
      : organizationGrants.find(
          (grant) => grant.organizationId === selectedOrganizationId,
        ) ?? null;

  if (!activeOrganization) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          code: "organization_selection_required",
          error: "Select an organization before using this API route.",
        },
        {
          status: 409,
        },
      );
    }

    return redirectWithAuthCookies(
      request,
      response,
      ORGANIZATION_SELECTION_PATH,
      {
        next: pathname,
      },
    );
  }

  let workspaceGrants: WorkspaceGrant[];

  try {
    workspaceGrants = await getWorkspaceGrants(
      supabase,
      userId,
      activeOrganization,
    );
  } catch (error) {
    return accessDenied(
      pathname,
      error instanceof Error ? error.message : "Workspace access unavailable.",
    );
  }

  const requestedWorkspace = getFunctionalWorkspaceForPathname(pathname);

  /*
   * Unknown /workspace/<code> paths should reach the Next.js not-found path
   * rather than being mistaken for the organization selector.
   */
  if (pathname.startsWith("/workspace/") && !requestedWorkspace) {
    return response;
  }

  if (!requestedWorkspace) {
    /*
     * Unmapped private routes keep legacy broad access only for organization
     * owner/admin. Other users fail closed until a route is intentionally
     * assigned to a functional workspace.
     */
    if (
      activeOrganization.role === "owner" ||
      activeOrganization.role === "admin"
    ) {
      return response;
    }

    if (pathname.startsWith("/api/")) {
      return accessDenied(
        pathname,
        "This API route is not assigned to an accessible workspace.",
      );
    }

    const fallback = workspaceGrants[0];
    const fallbackPath = fallback
      ? getFunctionalWorkspaceRootPath(fallback.code)
      : null;

    if (fallbackPath) {
      return redirectWithAuthCookies(request, response, fallbackPath, {
        restricted: "1",
      });
    }

    return accessDenied(pathname, "No functional workspace access is assigned.");
  }

  const workspaceGrant = workspaceGrants.find(
    (grant) => grant.code === requestedWorkspace.code,
  );

  const allowed =
    workspaceGrant &&
    isFunctionalWorkspaceRouteAllowed(
      requestedWorkspace.code,
      workspaceGrant.role,
      pathname,
    );

  if (allowed) {
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return accessDenied(
      pathname,
      `This route is not available in the ${requestedWorkspace.name} workspace for your role.`,
    );
  }

  const fallback = workspaceGrants[0];
  const fallbackPath = fallback
    ? getFunctionalWorkspaceRootPath(fallback.code)
    : null;

  if (fallbackPath) {
    return redirectWithAuthCookies(request, response, fallbackPath, {
      restricted: "1",
    });
  }

  return accessDenied(pathname, "No functional workspace access is assigned.");
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
