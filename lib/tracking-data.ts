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

export type TrackingWorkspace = {
  health: TrackingHealth;
  capture: WebsiteCaptureHealth;
  funnel: WebFunnel7d;
  fallback: boolean;
  warning: string | null;
};

type TrackingRpcPayload = {
  health?: Record<string, unknown>;
  capture?: Record<string, unknown>;
  funnel?: Record<string, unknown>;
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
    /*
     * Safe fallback:
     * preserve the current three-view read path if the
     * compact workspace RPC is temporarily unavailable.
     */
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
