import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  "/yogakulam-tracker.js",
  "/api/leads/capture",
  "/api/analytics/ga4/sync",
  "/api/analytics/gsc/sync",
  "/api/analytics/google-ads/sync",
  "/api/analytics/meta-ads/sync",
  "/api/admissions/auto-tasks",
  "/api/whatsapp/webhook",
  "/api/sync/course-batches",
    "/api/tracking/collect",
  "/api/tracking/consent",
  "/api/tracking/identify",
]);

/*
|--------------------------------------------------------------------------
| Admissions employee routes
|--------------------------------------------------------------------------
|
| Admissions employees should only have access to conversion-focused pages.
|
| Admin:
|   Full CRM
|
| Manager:
|   Full operational CRM, except Admin-only team intelligence pages
|
| Admissions Employee:
|   Dashboard
|   My Leads
|   Assigned Lead Detail
|   Assigned Lead Edit
|   My Pipeline
|   Conversations
|   Follow-ups
|
*/

const ACTIVE_WORKSPACE_COOKIE = "yk-active-workspace";
const WORKSPACE_SELECTION_PATH = "/workspace";

const EMPLOYEE_EXACT_PATHS = new Set([
  "/dashboard",
  "/leads",
  "/pipeline",
  "/conversations",
  "/follow-ups",
]);

/*
|--------------------------------------------------------------------------
| Admin-only pages
|--------------------------------------------------------------------------
|
| These pages remain Admin-only even though the legacy Manager role keeps
| broad operational CRM access elsewhere.
|
*/

const ADMIN_ONLY_EXACT_PATHS = new Set([
  "/team-performance",
  "/contact-intelligence",
]);

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
  const normalizedPath = normalizePathname(pathname);

  if (PUBLIC_EXACT_PATHS.has(normalizedPath)) {
    return true;
  }

  // if (normalizedPath.startsWith("/api/tracking/")) {
  //   return true;
  // }

  return false;
}

function isAdminOnlyPage(pathname: string) {
  const normalizedPath = normalizePathname(pathname);

  if (ADMIN_ONLY_EXACT_PATHS.has(normalizedPath)) {
    return true;
  }

  /*
   * Future nested routes under these sections stay Admin-only automatically.
   */
  for (const adminPath of ADMIN_ONLY_EXACT_PATHS) {
    if (normalizedPath.startsWith(`${adminPath}/`)) {
      return true;
    }
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Lead route validation
|--------------------------------------------------------------------------
|
| Employees may open:
|
| /leads/<uuid>
| /leads/<uuid>/edit
|
| They may NOT open:
|
| /leads/new
| /leads/import
| /leads/anything-else
|
| Database RLS remains the final authority over whether the employee can
| actually access the UUID supplied in the URL.
|
*/

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{12}";

const EMPLOYEE_LEAD_ROUTE = new RegExp(`^/leads/${UUID_PATTERN}(?:/edit)?$`);

function isEmployeeAllowedPage(pathname: string) {
  const normalizedPath = normalizePathname(pathname);

  if (EMPLOYEE_EXACT_PATHS.has(normalizedPath)) {
    return true;
  }

  if (EMPLOYEE_LEAD_ROUTE.test(normalizedPath)) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Redirect helper
|--------------------------------------------------------------------------
|
| Copies any Supabase auth-cookie updates from the normal middleware
| response to the redirect response.
|
*/

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

  /*
   * Preserve any refreshed Supabase cookies.
   */
  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

/*
|--------------------------------------------------------------------------
| Configuration failure helper
|--------------------------------------------------------------------------
|
| Protected CRM routes must fail closed if Supabase auth configuration is
| missing. Public integration routes were already handled before this point.
|
*/

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

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

export async function middleware(request: NextRequest) {
  /*
   * Mock-mode auth bypass is allowed only during local development.
   *
   * Production must never become public merely because
   * NEXT_PUBLIC_USE_MOCK_DATA is missing or misconfigured.
   */
  const localMockMode =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  if (localMockMode) {
    return NextResponse.next();
  }

  const pathname = normalizePathname(request.nextUrl.pathname);

  /*
   * Public integrations bypass CRM browser authentication.
   *
   * Their individual API routes remain responsible for validating:
   * secrets, signatures, origins, webhook tokens, etc.
   */
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /*
   * Fail closed for protected CRM routes if auth configuration is missing.
   */
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

  /*
  |--------------------------------------------------------------------------
  | Authentication
  |--------------------------------------------------------------------------
  */

  const { data: claimsResult } = await supabase.auth.getClaims();

  const userId = claimsResult?.claims?.sub ?? null;

  /*
  |--------------------------------------------------------------------------
  | Login page
  |--------------------------------------------------------------------------
  |
  | Not logged in
  |   -> login page
  |
  | Active CRM user
  |   -> dashboard
  |
  | Disabled user
  |   -> login page remains available
  |
  */

  if (pathname === "/login") {
    if (!userId) {
      return response;
    }

    const { data: loginProfile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", userId)
      .maybeSingle();

    if (loginProfile?.active === true) {
      return redirectWithAuthCookies(request, response, "/dashboard");
    }

    /*
     * Existing session may still exist, but inactive/missing profile
     * cannot access any protected route.
     */
    return response;
  }

  /*
  |--------------------------------------------------------------------------
  | Require authentication
  |--------------------------------------------------------------------------
  */

  if (!userId) {
    return redirectWithAuthCookies(request, response, "/login", {
      next: pathname,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Load CRM profile
  |--------------------------------------------------------------------------
  */

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", userId)
    .maybeSingle();

  /*
   * Fail closed.
   *
   * A valid Supabase session alone is NOT enough.
   * The user must also have an active CRM profile.
   */
  if (profileError || !profile || profile.active !== true) {
    /*
     * API requests get a proper authorization response
     * instead of receiving HTML from /login.
     */
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
   * Workspace selection is intentionally handled before role routing.
   *
   * /workspace and /api/workspace must remain reachable so an authenticated
   * user can establish the active tenant.
   */
  if (
    pathname === WORKSPACE_SELECTION_PATH ||
    pathname === "/api/workspace"
  ) {
    return response;
  }

  /*
   * All protected CRM pages require an explicit workspace cookie.
   *
   * The cookie itself is not an authorization boundary. Server loaders,
   * organization membership checks and database RLS continue to validate
   * tenant access. This gate prevents server-rendered pages from executing
   * before a workspace has been selected.
   */
  const activeWorkspaceId =
    request.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim() ?? "";

  if (!activeWorkspaceId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          code: "workspace_selection_required",
          error: "Select a workspace before using this API route.",
        },
        {
          status: 409,
        },
      );
    }

    return redirectWithAuthCookies(
      request,
      response,
      WORKSPACE_SELECTION_PATH,
      {
        next: pathname,
      },
    );
  }

  const role = String(profile.role ?? "");

  /*
  |--------------------------------------------------------------------------
  | Admin
  |--------------------------------------------------------------------------
  */

  if (role === "admin") {
    return response;
  }

  /*
  |--------------------------------------------------------------------------
  | Legacy Manager
  |--------------------------------------------------------------------------
  |
  | Keep broad operational access for the legacy Manager role, while enforcing
  | the two Admin-only team intelligence sections at middleware level too.
  |
  */

  if (role === "manager") {
    if (isAdminOnlyPage(pathname)) {
      return redirectWithAuthCookies(request, response, "/dashboard", {
        restricted: "1",
      });
    }

    return response;
  }

  /*
  |--------------------------------------------------------------------------
  | Admissions Employee
  |--------------------------------------------------------------------------
  */

  if (role === "admissions") {
    /*
     * All public integration endpoints were already handled above.
     *
     * The current API audit found no private API route required by the
     * Admissions employee workspace. Therefore every remaining /api/*
     * endpoint is denied for Admissions users at middleware level.
     *
     * This prevents direct access to analytics health/debug endpoints while
     * leaving server actions, Supabase RLS/RPC access and public integrations
     * unchanged.
     */
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          error: "This API route is not available to Admissions users.",
        },
        {
          status: 403,
        },
      );
    }

    if (isEmployeeAllowedPage(pathname)) {
      return response;
    }

    /*
     * Employee manually enters an Admin/Manager URL:
     *
     * /settings
     * /revenue
     * /analytics
     * /funnel
     * /tracking
     * /campaigns
     * /paid-media-leads
     * /attribution
     * /re-engaged
     * /seo
     * /course-management
     * /admissions
     * /team-performance
     * /contact-intelligence
     * /leads/new
     * etc.
     *
     * Send them back to their conversion workspace.
     */
    return redirectWithAuthCookies(request, response, "/dashboard", {
      restricted: "1",
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Undefined legacy roles
  |--------------------------------------------------------------------------
  |
  | analyst / viewer / unknown roles do NOT automatically inherit
  | Admin permissions.
  |
  | We can create intentional access rules for them later if needed.
  |
  */

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRM role is not authorized.",
      },
      {
        status: 403,
      },
    );
  }

  return redirectWithAuthCookies(request, response, "/login", {
    error: "role-not-authorized",
  });
}

/*
|--------------------------------------------------------------------------
| Matcher
|--------------------------------------------------------------------------
*/

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
