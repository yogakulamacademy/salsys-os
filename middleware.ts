import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/auth/callback",
  "/auth/recovery-confirm",
  "/forgot-password",
  "/yogakulam-tracker.js",
  "/salsys-tracker.js",
  "/salsys-intelligence.js",
  "/salsys-consent.js",
  "/api/leads/capture",
  "/api/events/v1",
  "/api/events/browser/v1",
  "/api/events/client/v1",
  "/api/events/identify/v1",
  "/api/privacy/consent/v1",
  "/api/privacy/consent/client/v1",
  "/api/analytics/ga4/sync",
  "/api/analytics/gsc/sync",
  "/api/analytics/google-ads/sync",
  "/api/analytics/meta-ads/sync",
  "/api/admissions/auto-tasks",
  "/api/automation/runtime-scheduler",
  "/api/automation/runtime-scheduler/controlled-test",
  "/api/conversion-feedback/run",
  "/api/whatsapp/webhook",
  "/api/instagram/webhook",
  "/api/sync/course-batches",
  "/api/tracking/collect",
  "/api/tracking/consent",
  "/api/tracking/identify",
  "/api/search/index/health",
  "/api/search/index/worker",
  "/api/intelligence/system-snapshot",
  "/api/intelligence/lead-scoring-snapshot",
]);

const ACTIVE_WORKSPACE_COOKIE = "yk-active-workspace";
const WORKSPACE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const OAUTH_CALLBACK_PROVIDER_BY_PATH: Record<string, string> = {
  "/api/integrations/google/callback": "google",
  "/api/integrations/meta/callback": "meta",
  "/api/integrations/instagram/callback": "instagram",
};

const EMPLOYEE_EXACT_PATHS = new Set([
  "/dashboard",
  "/leads",
  "/pipeline",
  "/conversations",
  "/follow-ups",
]);

const ADMIN_ONLY_EXACT_PATHS = new Set([
  "/team-performance",
  "/contact-intelligence",
]);

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{12}";

const EMPLOYEE_LEAD_ROUTE = new RegExp(`^/leads/${UUID_PATTERN}(?:/edit)?$`);

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isPublicPath(pathname: string) {
  return PUBLIC_EXACT_PATHS.has(normalizePathname(pathname));
}

function isTenantLoginPath(pathname: string) {
  return /^\/login\/[^/]+$/.test(pathname);
}

function isTenantForgotPasswordPath(pathname: string) {
  return /^\/forgot-password\/[^/]+$/.test(pathname);
}

function isTenantResetPasswordPath(pathname: string) {
  return /^\/reset-password\/[^/]+$/.test(pathname);
}

function isPasswordResetCompletionPath(pathname: string) {
  return pathname === "/reset-password" || isTenantResetPasswordPath(pathname);
}

function isAdminOnlyPage(pathname: string) {
  const normalized = normalizePathname(pathname);
  if (ADMIN_ONLY_EXACT_PATHS.has(normalized)) return true;
  for (const adminPath of ADMIN_ONLY_EXACT_PATHS) {
    if (normalized.startsWith(`${adminPath}/`)) return true;
  }
  return false;
}

function isEmployeeAllowedPage(pathname: string) {
  const normalized = normalizePathname(pathname);
  return EMPLOYEE_EXACT_PATHS.has(normalized) || EMPLOYEE_LEAD_ROUTE.test(normalized);
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
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

function authConfigurationError(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "CRM authentication is not configured." },
      { status: 503 },
    );
  }
  return new NextResponse("CRM authentication is not configured.", { status: 503 });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return authConfigurationError(pathname);
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicAuthPath =
    pathname === "/login" ||
    isTenantLoginPath(pathname) ||
    pathname === "/forgot-password" ||
    isTenantForgotPasswordPath(pathname) ||
    pathname === "/reset-password" ||
    isTenantResetPasswordPath(pathname);

  if (!user) {
    if (publicAuthPath) return response;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (isPasswordResetCompletionPath(pathname)) {
    return response;
  }

  // The production database's canonical tenant contract is the binding RPC,
  // followed by the organization membership row. Do not depend on a separate
  // workspace-context RPC here: preview/custom hostnames need to be able to
  // establish the same tenant session from the authenticated identity alone.
  const { data: boundOrganizationId, error: tenantBindingError } =
    await supabase.rpc("bind_current_tenant_session_for_current_user");

  let role = "";

  if (!tenantBindingError && boundOrganizationId) {
    const organizationId = String(boundOrganizationId);

    request.cookies.set(ACTIVE_WORKSPACE_COOKIE, organizationId);
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: WORKSPACE_COOKIE_MAX_AGE_SECONDS,
    });

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!membershipError && membership) {
      role = String(membership.role ?? "").trim().toLowerCase();
    }
  }

  if (tenantBindingError || !boundOrganizationId || !role) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Workspace access denied." },
        { status: 403 },
      );
    }

    await supabase.auth.signOut();
    const redirectResponse = redirectWithAuthCookies(
      request,
      response,
      "/login",
      {
        error:
          "Unable to establish your organization session. Please sign in again.",
      },
    );
    redirectResponse.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return redirectResponse;
  }

  if (publicAuthPath) {
    return redirectWithAuthCookies(request, response, "/dashboard");
  }

  if (role === "employee" && !isEmployeeAllowedPage(pathname)) {
    return redirectWithAuthCookies(request, response, "/dashboard");
  }

  if (role !== "admin" && isAdminOnlyPage(pathname)) {
    return redirectWithAuthCookies(request, response, "/dashboard");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
