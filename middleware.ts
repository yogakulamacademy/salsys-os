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
  "/salsys-intelligence-core-v1.6.0.js",
  "/salsys-intelligence-submit-fallback.js",
  "/salsys-consent.js",
  "/api/leads/capture",
  "/api/leads/browser/v1",
  "/api/tracking/forms/browser/v1",
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

const ACTIVE_WORKSPACE_COOKIE = "salsys-active-workspace";
const WORKSPACE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Keep the entire protected-route middleware path below Vercel's own timeout.
// Critical auth/workspace checks fail closed; optional onboarding lookup fails open.
const MIDDLEWARE_TOTAL_BUDGET_MS = 3200;
const AUTH_LOOKUP_MAX_MS = 1400;
const WORKSPACE_LOOKUP_MAX_MS = 1400;
const ONBOARDING_LOOKUP_MAX_MS = 300;

const EMPLOYEE_EXACT_PATHS = new Set([
  "/dashboard",
  "/work-queue",
  "/work-queue/mine",
  "/work-queue/team",
  "/opportunities",
  "/leads",
  "/pipeline",
  "/conversations",
  "/follow-ups",
]);

const ADMIN_ONLY_EXACT_PATHS = new Set([
  "/team-performance",
  "/contact-intelligence",
]);

const ONBOARDING_SETUP_PATHS = [
  "/onboarding",
  "/tracking",
  "/settings/integrations",
  "/settings/team",
] as const;

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{4}-" +
  "[0-9a-fA-F]{12}";

const EMPLOYEE_LEAD_ROUTE = new RegExp(`^/leads/${UUID_PATTERN}(?:/edit)?$`);

class MiddlewareDependencyTimeout extends Error {
  constructor(public readonly dependency: string) {
    super(`${dependency} exceeded the middleware deadline`);
    this.name = "MiddlewareDependencyTimeout";
  }
}

async function withMiddlewareDeadline<T>(
  operation: PromiseLike<T>,
  deadlineAt: number,
  maxWaitMs: number,
  dependency: string,
): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new MiddlewareDependencyTimeout(dependency);
  }

  const timeoutMs = Math.max(1, Math.min(maxWaitMs, remainingMs));
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new MiddlewareDependencyTimeout(dependency)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

function isPublicAuthPath(pathname: string) {
  return (
    pathname === "/login" ||
    isTenantLoginPath(pathname) ||
    pathname === "/forgot-password" ||
    isTenantForgotPasswordPath(pathname) ||
    pathname === "/reset-password" ||
    isTenantResetPasswordPath(pathname)
  );
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

function isOnboardingSetupPage(pathname: string) {
  const normalized = normalizePathname(pathname);
  return ONBOARDING_SETUP_PATHS.some(
    (allowedPath) =>
      normalized === allowedPath || normalized.startsWith(`${allowedPath}/`),
  );
}

function privateNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
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
  return privateNoStore(redirectResponse);
}

function redirectToLogin(request: NextRequest, response: NextResponse) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const redirectResponse = NextResponse.redirect(loginUrl);
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return privateNoStore(redirectResponse);
}

function isMissingAuthSessionError(error: { name?: string; message?: string } | null) {
  if (!error) return false;
  const name = String(error.name ?? "").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  return (
    name.includes("authsessionmissing") ||
    message.includes("auth session missing") ||
    message.includes("session missing")
  );
}

function isInvalidOrExpiredAuthSessionError(
  error: { name?: string; message?: string; code?: string } | null,
) {
  if (!error) return false;

  const name = String(error.name ?? "").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();
  const haystack = `${name} ${code} ${message}`;

  return [
    "refresh token not found",
    "invalid refresh token",
    "refresh_token_not_found",
    "invalid_refresh_token",
    "jwt expired",
    "token has expired",
    "invalid jwt",
    "invalid token",
    "session from session_id claim in jwt does not exist",
    "user from sub claim in jwt does not exist",
    "bad_jwt",
  ].some((token) => haystack.includes(token));
}

function expireSessionCookies(request: NextRequest, response: NextResponse) {
  const deletionOptions = {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) {
      response.cookies.set(cookie.name, "", deletionOptions);
    }
  }

  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, "", deletionOptions);
  return privateNoStore(response);
}

function redirectToLoginWithClearedSession(
  request: NextRequest,
  response: NextResponse,
) {
  const redirectResponse = redirectToLogin(request, response);
  return expireSessionCookies(request, redirectResponse);
}

function unauthorizedWithClearedSession(request: NextRequest) {
  const response = NextResponse.json(
    { ok: false, error: "Unauthorized" },
    { status: 401 },
  );
  return expireSessionCookies(request, response);
}

function authConfigurationError(pathname: string) {
  const response = pathname.startsWith("/api/")
    ? NextResponse.json(
        { ok: false, error: "CRM authentication is not configured." },
        { status: 503 },
      )
    : new NextResponse("CRM authentication is not configured.", { status: 503 });

  return privateNoStore(response);
}

function workspaceServiceUnavailable(pathname: string) {
  const response = pathname.startsWith("/api/")
    ? NextResponse.json(
        { ok: false, error: "Workspace service is temporarily unavailable." },
        { status: 503 },
      )
    : new NextResponse(
        "SalsysOS is temporarily unable to verify your workspace. Please retry in a moment.",
        { status: 503 },
      );

  return privateNoStore(response);
}

type WorkspaceContextPayload = {
  organization_id?: unknown;
  active_organization_id?: unknown;
  role?: unknown;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname) || isPublicAuthPath(pathname)) {
    // Do not place login/recovery/public ingestion behind auth middleware.
    // Public caching behavior remains owned by the route/asset itself.
    return NextResponse.next();
  }

  const deadlineAt = Date.now() + MIDDLEWARE_TOTAL_BUDGET_MS;
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

  let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    authResult = await withMiddlewareDeadline(
      supabase.auth.getUser(),
      deadlineAt,
      AUTH_LOOKUP_MAX_MS,
      "supabase.auth.getUser",
    );
  } catch (error) {
    console.warn("Middleware auth dependency unavailable", {
      path: pathname,
      reason:
        error instanceof MiddlewareDependencyTimeout
          ? error.dependency
          : "supabase.auth.getUser",
    });
    return workspaceServiceUnavailable(pathname);
  }

  const {
    data: { user },
    error: authError,
  } = authResult;

  if (!user) {
    if (
      authError &&
      !isMissingAuthSessionError(authError) &&
      !isInvalidOrExpiredAuthSessionError(authError)
    ) {
      return workspaceServiceUnavailable(pathname);
    }

    if (pathname.startsWith("/api/")) {
      return unauthorizedWithClearedSession(request);
    }

    return redirectToLoginWithClearedSession(request, response);
  }

  let workspaceResult: Awaited<ReturnType<typeof supabase.rpc>>;
  try {
    workspaceResult = await withMiddlewareDeadline(
      supabase.rpc("get_current_workspace_context_v1"),
      deadlineAt,
      WORKSPACE_LOOKUP_MAX_MS,
      "get_current_workspace_context_v1",
    );
  } catch (error) {
    console.warn("Middleware workspace dependency unavailable", {
      path: pathname,
      reason:
        error instanceof MiddlewareDependencyTimeout
          ? error.dependency
          : "get_current_workspace_context_v1",
    });
    return workspaceServiceUnavailable(pathname);
  }

  const { data: workspaceContext, error: workspaceError } = workspaceResult;

  if (workspaceError || !workspaceContext || typeof workspaceContext !== "object") {
    const detail = String(workspaceError?.message ?? "");

    if (isInvalidOrExpiredAuthSessionError(workspaceError)) {
      if (pathname.startsWith("/api/")) {
        return unauthorizedWithClearedSession(request);
      }
      return redirectToLoginWithClearedSession(request, response);
    }

    if (
      detail.includes("No active organization membership") ||
      detail.includes("Multiple active organization memberships")
    ) {
      if (pathname.startsWith("/api/")) {
        return privateNoStore(
          NextResponse.json(
            { ok: false, error: "Workspace access denied." },
            { status: 403 },
          ),
        );
      }

      const redirectResponse = redirectWithAuthCookies(
        request,
        response,
        "/login",
        {
          error: detail.includes("Multiple active organization memberships")
            ? "This account is linked to multiple organizations. Please contact your SalsysOS administrator."
            : "Your account is not assigned to an active organization.",
        },
      );
      return expireSessionCookies(request, redirectResponse);
    }

    return workspaceServiceUnavailable(pathname);
  }

  const context = workspaceContext as WorkspaceContextPayload;
  const organizationId = String(
    context.active_organization_id ?? context.organization_id ?? "",
  ).trim();
  const role = String(context.role ?? "").trim().toLowerCase();

  if (!organizationId || !role) {
    return workspaceServiceUnavailable(pathname);
  }

  request.cookies.set(ACTIVE_WORKSPACE_COOKIE, organizationId);
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE_SECONDS,
  });

  if (
    !pathname.startsWith("/api/") &&
    pathname !== "/onboarding/security" &&
    user.app_metadata?.require_password_change === true
  ) {
    return redirectWithAuthCookies(request, response, "/onboarding/security");
  }

  if (
    !pathname.startsWith("/api/") &&
    !isOnboardingSetupPage(pathname) &&
    (role === "owner" || role === "admin")
  ) {
    try {
      const { data: onboarding, error: onboardingError } =
        await withMiddlewareDeadline(
          supabase
            .from("organization_onboarding")
            .select("status,enforce_on_sign_in")
            .eq("organization_id", organizationId)
            .maybeSingle(),
          deadlineAt,
          ONBOARDING_LOOKUP_MAX_MS,
          "organization_onboarding",
        );

      if (
        !onboardingError &&
        onboarding?.enforce_on_sign_in === true &&
        onboarding.status !== "completed" &&
        onboarding.status !== "dismissed"
      ) {
        return redirectWithAuthCookies(request, response, "/onboarding");
      }
    } catch (error) {
      console.warn("Middleware onboarding lookup skipped", {
        path: pathname,
        reason:
          error instanceof MiddlewareDependencyTimeout
            ? error.dependency
            : "organization_onboarding",
      });
    }
  }

  if (role === "employee" && !isEmployeeAllowedPage(pathname)) {
    return redirectWithAuthCookies(request, response, "/work-queue/mine");
  }

  if (role !== "admin" && isAdminOnlyPage(pathname)) {
    return redirectWithAuthCookies(
      request,
      response,
      role === "employee" ? "/work-queue/mine" : "/crm",
    );
  }

  return privateNoStore(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
