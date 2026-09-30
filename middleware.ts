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
]);

/*
|--------------------------------------------------------------------------
| Employee routes
|--------------------------------------------------------------------------
|
| Admissions employees should only have access to conversion-focused pages.
|
| Admin / Manager:
|   Full CRM
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

const EMPLOYEE_EXACT_PATHS = new Set([
  "/dashboard",
  "/leads",
  "/pipeline",
  "/conversations",
  "/follow-ups",
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

  if (normalizedPath.startsWith("/api/tracking/")) {
    return true;
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
| Middleware
|--------------------------------------------------------------------------
*/

export async function middleware(request: NextRequest) {
  /*
   * Mock mode keeps the existing development behaviour.
   */
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
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
   * Preserve the existing behaviour if environment configuration
   * is unavailable.
   */
  if (!url || !key) {
    return NextResponse.next();
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
   | Unlike the previous middleware, /login is intentionally handled here
   | rather than bypassed before authentication.
   |
   | This means:
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

  const role = String(profile.role ?? "");

  /*
   |--------------------------------------------------------------------------
   | Admin / legacy Manager
   |--------------------------------------------------------------------------
   |
   | Preserve existing Manager behaviour until we intentionally redesign
   | that role.
   */

  const hasFullAccess = role === "admin" || role === "manager";

  if (hasFullAccess) {
    return response;
  }

  /*
   |--------------------------------------------------------------------------
   | Admissions Employee
   |--------------------------------------------------------------------------
   */

  if (role === "admissions") {
    /*
     * Authenticated API routes are not silently redirected.
     *
     * Their database access is already governed by the employee RLS/RPC
     * security we implemented.
     *
     * Known public integration APIs were already handled above.
     */
    if (pathname.startsWith("/api/")) {
      return response;
    }

    if (isEmployeeAllowedPage(pathname)) {
      return response;
    }

    /*
     * Employee manually enters:
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
