import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/auth/callback",
  "/auth/recovery-confirm",
  "/forgot-password",
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
  "/api/search/index/health",
  "/api/search/index/bootstrap",
  "/api/search/index/seo-bootstrap",
  "/api/search/index/pilot",
  "/api/search/index/pilot-verify",
  "/api/search/index/worker",
  "/api/seo/competitors/rank-worker",
  "/api/intelligence/system-snapshot",
  "/api/intelligence/lead-scoring-snapshot",
  "/api/intelligence/lead-predictions",
  "/api/intelligence/lead-model-drift",
  "/api/intelligence/lead-model-retrain",
  "/api/intelligence/lead-model-train",
  "/api/intelligence/lead-model-compare",
  "/api/intelligence/lead-model-promote",
]);

const ACTIVE_WORKSPACE_COOKIE = "yk-active-workspace";

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
    return NextResponse.json({ ok: false, error: "CRM authentication is not configured." }, { status: 503 });
  }
  return new NextResponse("CRM authentication is not configured.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function accessDenied(pathname: string, message: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: message }, { status: 403 });
  }
  return new NextResponse(message, {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const localMockMode =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  if (localMockMode) return NextResponse.next();

  const pathname = normalizePathname(request.nextUrl.pathname);

  if (isPublicPath(pathname)) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return authConfigurationError(pathname);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: claimsResult } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub ?? null;

  if (
    pathname === "/login" ||
    isTenantLoginPath(pathname) ||
    isTenantForgotPasswordPath(pathname)
  ) {
    return response;
  }

  if (!userId) {
    return redirectWithAuthCookies(request, response, "/login", { next: pathname });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.active !== true) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "CRM access is disabled." }, { status: 403 });
    }
    return redirectWithAuthCookies(request, response, "/login", { error: "access-disabled" });
  }

  const cookieOrganizationId =
    request.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value?.trim() ?? "";

  if (cookieOrganizationId) {
    const { error: bindingError } = await supabase.rpc(
      "bind_current_tenant_session",
      { p_organization_id: cookieOrganizationId },
    );

    if (bindingError) {
      return redirectWithAuthCookies(request, response, "/login", {
        error: "tenant-context-invalid",
      });
    }
  }

  const { data: activeOrganizationId, error: tenantContextError } =
    await supabase.rpc("current_tenant_organization_id");

  if (tenantContextError) {
    return accessDenied(pathname, "Unable to resolve tenant context.");
  }

  if (!activeOrganizationId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          code: "tenant_context_required",
          error:
            "Tenant context is not bound. Sign in through your organization-specific login link.",
        },
        { status: 409 },
      );
    }
    return redirectWithAuthCookies(request, response, "/login", {
      error: "tenant-context-required",
    });
  }

  if (isPasswordResetCompletionPath(pathname)) return response;

  const oauthProvider = OAUTH_CALLBACK_PROVIDER_BY_PATH[pathname];

  if (oauthProvider) {
    const state = request.nextUrl.searchParams.get("state")?.trim() ?? "";
    if (!state) {
      return redirectWithAuthCookies(request, response, "/settings/integrations", {
        error: "integration-oauth-state-missing",
      });
    }

    const { data: stateMatches, error: stateMatchError } = await supabase.rpc(
      "oauth_state_matches_current_tenant",
      { p_provider: oauthProvider, p_state: state },
    );

    if (stateMatchError || stateMatches !== true) {
      return redirectWithAuthCookies(request, response, "/settings/integrations", {
        error: "integration-oauth-tenant-mismatch",
      });
    }
  }

  if (pathname === "/workspace" || pathname === "/api/workspace") return response;

  const role = String(profile.role ?? "");
  if (role === "admin") return response;

  if (role === "manager") {
    if (isAdminOnlyPage(pathname)) {
      return redirectWithAuthCookies(request, response, "/dashboard", { restricted: "1" });
    }
    return response;
  }

  if (role === "admissions") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "This API route is not available to Admissions users." }, { status: 403 });
    }
    if (isEmployeeAllowedPage(pathname)) return response;
    return redirectWithAuthCookies(request, response, "/dashboard", { restricted: "1" });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "CRM role is not authorized." }, { status: 403 });
  }

  return redirectWithAuthCookies(request, response, "/login", { error: "role-not-authorized" });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
