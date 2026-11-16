import "server-only";

import {
  getVendorWorkspacePreview,
  type VendorWorkspace,
} from "@/lib/integrations/vendor-workspaces";

export type VendorHealthState =
  | "preview_disabled"
  | "not_configured"
  | "reachable"
  | "degraded"
  | "unavailable";

export type VendorHealthResult = {
  name: string;
  state: VendorHealthState;
  message: string;
  checkedAt: string | null;
};

const HEALTH_PATH: Record<VendorWorkspace, string> = {
  "open-seo": "/api/health",
  deskcomm: "/api/v1/health",
};

const SUCCESS_STATUS: Record<VendorWorkspace, string> = {
  "open-seo": "ok",
  deskcomm: "healthy",
};

/**
 * A credentials-free, read-only transport probe. Never treat this as proof of
 * authenticated access, Meta sender readiness, SEO data access or cutover.
 *
 * These endpoints are the documented upstream self-hosted health endpoints.
 * The operator controls the HTTPS base URL via server-side environment only.
 */
export async function checkVendorWorkspaceHealth(
  kind: VendorWorkspace,
): Promise<VendorHealthResult> {
  const preview = getVendorWorkspacePreview(kind);

  if (!preview.previewEnabled) {
    return {
      name: preview.name,
      state: "preview_disabled",
      message: "Operator preview is disabled.",
      checkedAt: null,
    };
  }

  if (!preview.url) {
    return {
      name: preview.name,
      state: "not_configured",
      message: preview.warning ?? "No valid HTTPS base URL is configured.",
      checkedAt: null,
    };
  }

  const checkedAt = new Date().toISOString();

  try {
    const endpoint = new URL(HEALTH_PATH[kind], preview.url);
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok || response.redirected) {
      return {
        name: preview.name,
        state: "unavailable",
        message: "Health endpoint did not return a successful response.",
        checkedAt,
      };
    }

    // Limit parsing to JSON and never surface raw vendor configuration, URLs,
    // infrastructure details or exception messages to the CRM user.
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return {
        name: preview.name,
        state: "unavailable",
        message: "Health endpoint returned an unexpected content type.",
        checkedAt,
      };
    }

    const payload: unknown = await response.json();
    const status =
      payload && typeof payload === "object" && "status" in payload
        ? String((payload as { status: unknown }).status).toLowerCase()
        : "";

    if (status === SUCCESS_STATUS[kind]) {
      return {
        name: preview.name,
        state: "reachable",
        message: "Upstream health check responded successfully. Data access and messaging are unverified.",
        checkedAt,
      };
    }

    if (status === "issues" || status === "degraded") {
      return {
        name: preview.name,
        state: "degraded",
        message: "Upstream reported an issue. Review its own operational diagnostics.",
        checkedAt,
      };
    }

    return {
      name: preview.name,
      state: "unavailable",
      message: "Upstream did not report its expected healthy status.",
      checkedAt,
    };
  } catch {
    return {
      name: preview.name,
      state: "unavailable",
      message: "Health endpoint is unreachable or timed out.",
      checkedAt,
    };
  }
}
