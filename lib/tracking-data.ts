import {
  getTrackingHealth,
  getWebsiteCaptureHealth,
  getWebFunnel7d,
  isMockMode,
  type TrackingHealth,
  type WebsiteCaptureHealth,
  type WebFunnel7d,
} from "@/lib/data";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContextForUser } from "@/lib/workspace";

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
  sites: string[];
  publicKey: string | null;
  credentialId: string | null;
  connectionId: string | null;
  credentialName: string | null;
  environment: "live" | "test" | null;
  allowedHosts: string[];
  scopes: string[];
  legacyCompat: boolean;
  canManage: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
  lastEventAt: string | null;
  lastEventSdkVersion: string | null;
  lastEventSchemaVersion: number | null;
  lastEventStatus: string | null;
  events24h: number;
};

type TrackingRpcPayload = {
  health?: Record<string, unknown>;
  capture?: Record<string, unknown>;
  funnel?: Record<string, unknown>;
};

type CredentialListRow = {
  credential_id?: unknown;
  connection_id?: unknown;
  name?: unknown;
  credential_kind?: unknown;
  environment?: unknown;
  public_key?: unknown;
  scopes?: unknown;
  allowed_hosts?: unknown;
  status?: unknown;
  effective_status?: unknown;
  created_at?: unknown;
  last_used_at?: unknown;
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
      sites: ["example.com"],
      publicKey: null,
      credentialId: null,
      connectionId: null,
      credentialName: null,
      environment: null,
      allowedHosts: [],
      scopes: [],
      legacyCompat: false,
      canManage: true,
      createdAt: null,
      lastUsedAt: null,
      lastEventAt: null,
      lastEventSdkVersion: null,
      lastEventSchemaVersion: null,
      lastEventStatus: null,
      events24h: 0,
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

  let workspace;

  try {
    workspace = await getWorkspaceContextForUser(supabase, user.id);
  } catch {
    return emptyInstallation();
  }

  const organizationId = workspace.activeOrganizationId;

  if (!organizationId || !workspace.activeWorkspace) {
    return emptyInstallation();
  }

  const canManage = ["owner", "admin"].includes(
    workspace.activeWorkspace.role,
  );

  // Installation diagnostics are a server-side administrative read after the
  // authenticated user's tenant membership has been resolved above. This avoids
  // depending on direct organization_sites/raw_events table access from the
  // browser-facing Supabase role.
  const admin = createAdminClient();

  const [{ data: siteRows }, { data: credentialRows, error: credentialError }] =
    await Promise.all([
      admin
        .from("organization_sites")
        .select("hostname,status,created_at")
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

  let lastEventAt: string | null = null;
  let lastEventSdkVersion: string | null = null;
  let lastEventSchemaVersion: number | null = null;
  let lastEventStatus: string | null = null;
  let events24h = 0;

  if (site) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [latestEventResult, countResult] = await Promise.all([
      admin
        .from("raw_events")
        .select("id,received_at,schema_version,context,metadata")
        .eq("organization_id", organizationId)
        .eq("source_system", "website")
        .eq("site", site)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("raw_events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("source_system", "website")
        .eq("site", site)
        .gte("received_at", since24h),
    ]);

    events24h = countResult.count ?? 0;

    const latestEvent = latestEventResult.data;

    if (latestEvent) {
      lastEventAt = optionalText(latestEvent.received_at) ?? null;
      lastEventSchemaVersion = Number.isFinite(Number(latestEvent.schema_version))
        ? Number(latestEvent.schema_version)
        : null;

      const context = objectValue(latestEvent.context);
      const metadata = objectValue(latestEvent.metadata);

      lastEventSdkVersion =
        optionalText(context.sdk_version) ??
        optionalText(metadata.sdk_version) ??
        null;

      const { data: processingRow } = await admin
        .from("raw_event_processing")
        .select("status")
        .eq("organization_id", organizationId)
        .eq("raw_event_id", latestEvent.id)
        .maybeSingle();

      lastEventStatus = optionalText(processingRow?.status) ?? null;
    }
  }

  const normalizedSite = site?.replace(/^www\./, "") ?? "";

  return {
    organizationId,
    site,
    sites,
    publicKey: selected ? optionalText(selected.public_key) ?? null : null,
    credentialId: selected
      ? optionalText(selected.credential_id) ?? null
      : null,
    connectionId: selected
      ? optionalText(selected.connection_id) ?? null
      : null,
    credentialName: selected ? optionalText(selected.name) ?? null : null,
    environment: selected
      ? String(selected.environment ?? "") === "test"
        ? "test"
        : "live"
      : null,
    allowedHosts,
    scopes: selected ? arrayOfStrings(selected.scopes) : [],
    legacyCompat:
      normalizedSite === "yogakulamacademy.com" ||
      normalizedSite === "yogakulam.com",
    canManage,
    createdAt: selected ? optionalText(selected.created_at) ?? null : null,
    lastUsedAt: selected ? optionalText(selected.last_used_at) ?? null : null,
    lastEventAt,
    lastEventSdkVersion,
    lastEventSchemaVersion,
    lastEventStatus,
    events24h,
  };
}

function emptyInstallation(): TrackingInstallation {
  return {
    organizationId: null,
    site: null,
    sites: [],
    publicKey: null,
    credentialId: null,
    connectionId: null,
    credentialName: null,
    environment: null,
    allowedHosts: [],
    scopes: [],
    legacyCompat: false,
    canManage: false,
    createdAt: null,
    lastUsedAt: null,
    lastEventAt: null,
    lastEventSdkVersion: null,
    lastEventSchemaVersion: null,
    lastEventStatus: null,
    events24h: 0,
  };
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
