import {
  getTrackingHealth,
  getWebsiteCaptureHealth,
  getWebFunnel7d,
  isMockMode,
  type TrackingHealth,
  type WebsiteCaptureHealth,
  type WebFunnel7d,
} from "@/lib/data";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type TrackingWorkspace = {
  health: TrackingHealth;
  capture: WebsiteCaptureHealth;
  funnel: WebFunnel7d;
  fallback: boolean;
  warning: string | null;
};

export type TrackingInstallation = {
  organizationId: string | null;
  site: string | null;
  publicKey: string | null;
  environment: "live" | "test" | null;
  allowedHosts: string[];
  scopes: string[];
  legacyCompat: boolean;
};

type TrackingRpcPayload = {
  health?: Record<string, unknown>;
  capture?: Record<string, unknown>;
  funnel?: Record<string, unknown>;
};

type CredentialListRow = {
  credential_id?: unknown;
  credential_kind?: unknown;
  environment?: unknown;
  public_key?: unknown;
  scopes?: unknown;
  allowed_hosts?: unknown;
  status?: unknown;
  effective_status?: unknown;
  created_at?: unknown;
};

export async function getTrackingWorkspace(): Promise<TrackingWorkspace> {
  if (isMockMode()) {
    const [health, capture, funnel] = await Promise.all([
      getTrackingHealth(),
      getWebsiteCaptureHealth(),
      getWebFunnel7d(),
    ]);

    return {
      health,
      capture,
      funnel,
      fallback: false,
      warning: null,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_tracking_workspace");

  if (error) {
    const [health, capture, funnel] = await Promise.all([
      getTrackingHealth(),
      getWebsiteCaptureHealth(),
      getWebFunnel7d(),
    ]);

    return {
      health,
      capture,
      funnel,
      fallback: true,
      warning: `Optimized tracking read model unavailable: ${error.message}`,
    };
  }

  const payload = (data ?? {}) as TrackingRpcPayload;
  const healthRow = payload.health ?? {};
  const captureRow = payload.capture ?? {};
  const funnelRow = payload.funnel ?? {};

  return {
    health: {
      events24h: toNumber(healthRow.events_24h),
      visitors24h: toNumber(healthRow.visitors_24h),
      identifiedEvents24h: toNumber(healthRow.identified_events_24h),
      gclidEvents7d: toNumber(healthRow.gclid_events_7d),
      fbclidEvents7d: toNumber(healthRow.fbclid_events_7d),
      lastEventAt: optionalText(healthRow.last_event_at),
    },

    capture: {
      submissions24h: toNumber(captureRow.submissions_24h),
      newLeads24h: toNumber(captureRow.new_leads_24h),
      matchedExisting24h: toNumber(captureRow.matched_existing_24h),
      submissions7d: toNumber(captureRow.submissions_7d),
      lastSubmissionAt: optionalText(captureRow.last_submission_at),
    },

    funnel: {
      pageViews: toNumber(funnelRow.page_views),
      visitors: toNumber(funnelRow.visitors),
      formStarts: toNumber(funnelRow.form_starts),
      browserFormSubmits: toNumber(funnelRow.browser_form_submits),
      contactCtaClicks: toNumber(funnelRow.contact_cta_clicks),
      identifiedTouchpoints: toNumber(funnelRow.identified_touchpoints),
    },

    fallback: false,
    warning: null,
  };
}

export async function getTrackingInstallation(): Promise<TrackingInstallation> {
  if (isMockMode()) {
    return {
      organizationId: null,
      site: "example.com",
      publicKey: null,
      environment: null,
      allowedHosts: [],
      scopes: [],
      legacyCompat: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return emptyInstallation();
  }

  let organizationId: string;

  try {
    organizationId = await requireCurrentOrganizationId(supabase, user.id);
  } catch {
    return emptyInstallation();
  }

  const [{ data: siteRows }, { data: credentialRows, error: credentialError }] =
    await Promise.all([
      supabase
        .from("organization_sites")
        .select("hostname,status")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      supabase.rpc("list_integration_api_credentials", {
        p_organization_id: organizationId,
      }),
    ]);

  const sites = (siteRows ?? [])
    .map((row) => String(row.hostname ?? "").trim().toLowerCase())
    .filter(Boolean);

  const rows = credentialError
    ? []
    : ((credentialRows ?? []) as CredentialListRow[]);

  const activeWebsiteCredentials = rows
    .filter((row) => {
      const status = String(row.effective_status ?? row.status ?? "");
      const kind = String(row.credential_kind ?? "");
      const scopes = arrayOfStrings(row.scopes);
      const allowedHosts = arrayOfStrings(row.allowed_hosts).map((host) =>
        host.toLowerCase(),
      );

      return (
        status === "active" &&
        kind === "website" &&
        scopes.includes("events:write") &&
        allowedHosts.some((host) => sites.includes(host))
      );
    })
    .sort((left, right) =>
      String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")),
    );

  const selected = activeWebsiteCredentials[0] ?? null;
  const allowedHosts = selected ? arrayOfStrings(selected.allowed_hosts) : [];
  const site =
    allowedHosts.find((host) => sites.includes(host.toLowerCase())) ??
    sites[0] ??
    null;

  return {
    organizationId,
    site,
    publicKey: selected ? optionalText(selected.public_key) ?? null : null,
    environment: selected
      ? String(selected.environment ?? "") === "test"
        ? "test"
        : "live"
      : null,
    allowedHosts,
    scopes: selected ? arrayOfStrings(selected.scopes) : [],
    // Yogakulam is the existing production migration case. Other workspaces
    // receive the generic Salsys SDK contract only.
    legacyCompat: site === "yogakulamacademy.com" || site === "yogakulam.com",
  };
}

function emptyInstallation(): TrackingInstallation {
  return {
    organizationId: null,
    site: null,
    publicKey: null,
    environment: null,
    allowedHosts: [],
    scopes: [],
    legacyCompat: false,
  };
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalText(value: unknown) {
  if (value == null || String(value).trim() === "") {
    return undefined;
  }

  return String(value);
}
