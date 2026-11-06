import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { BehaviorEvent } from "@/lib/native-behavior-contract";
import { safeBehaviorCount as nonnegative } from "@/lib/native-behavior-safe-count";

export type BehaviorPageRow = {
  path: string;
  events: number;
  sessions: number;
  visitors: number;
};

export type NativeBehaviorPageBreakdown = {
  available: boolean;
  message: string | null;
  eventName: BehaviorEvent;
  days: 7 | 14 | 30;
  totalEvents: number;
  displayedEvents: number;
  hiddenOrOtherEvents: number;
  identifiedSessions: number;
  minVisitors: number;
  pages: BehaviorPageRow[];
};

type BreakdownRequest = { days: 7 | 14 | 30; eventName: BehaviorEvent };
const generic = "Page breakdowns are temporarily unavailable. The other analytics reports remain accessible.";

function empty(request: BreakdownRequest, message: string = generic): NativeBehaviorPageBreakdown {
  return {
    available: false,
    message,
    eventName: request.eventName,
    days: request.days,
    totalEvents: 0,
    displayedEvents: 0,
    hiddenOrOtherEvents: 0,
    identifiedSessions: 0,
    minVisitors: 3,
    pages: [],
  };
}

// Mirror the existing native_safe_page_path_v2 allowlist at the server boundary.
// Never echo arbitrary source paths if a database function changes unexpectedly.
function safePath(value: unknown): value is string {
  if (typeof value !== "string" || value === "/other") return false;
  const slug = /^\/[a-zA-Z0-9/_-]{0,120}$/.test(value);
  const page = /^\/[a-zA-Z0-9/_-]{1,120}\.(?:php|html?)$/.test(value);
  return (slug || page)
    && !/[0-9]{6,}/.test(value)
    && !/[a-f0-9]{16,}/i.test(value)
    && !/\/[0-9]{4,}(?:\/|\.|$)/.test(value)
    && !/(^|\/)(account|profile|users?|students?|private|admin|dashboard|settings|session|token|reset-password|payments?|orders?|checkout|leads?|api|auth)(\/|\.|$)/i.test(value);
}

export async function getNativeBehaviorPageBreakdown(
  request: BreakdownRequest,
): Promise<NativeBehaviorPageBreakdown> {
  const fail = (message?: string) => empty(request, message);
  if (![7, 14, 30].includes(request.days)) return fail();

  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return fail();

    const organizationId = await requireCurrentOrganizationId(supabase, auth.user.id);
    const { data, error } = await supabase.rpc("get_native_behavior_page_breakdown_v1", {
      p_organization_id: organizationId,
      p_days: request.days,
      p_event: request.eventName,
    });
    if (error) {
      console.error("[native-behavior-breakdown] Read unavailable:", error.code);
      return fail();
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail();
    const result = data as Record<string, unknown>;
    if (!result.status || typeof result.status !== "object" || Array.isArray(result.status)) return fail();
    const status = result.status as Record<string, unknown>;
    if (status.available !== true) {
      return fail(status.reason === "volume_limit"
        ? "This event has too many observations for a bounded report. Select another event or shorter period."
        : generic);
    }
    const totalEvents = nonnegative(status.total_events);
    const displayedEvents = nonnegative(status.displayed_events);
    const hiddenOrOtherEvents = nonnegative(status.hidden_or_other_events);
    const identifiedSessions = nonnegative(status.identified_sessions);
    const minVisitors = nonnegative(status.min_distinct_visitors);
    if (status.event_name !== request.eventName
      || status.window_days !== request.days
      || status.timezone !== "UTC"
      || minVisitors !== 3
      || totalEvents === null || displayedEvents === null
      || hiddenOrOtherEvents === null || identifiedSessions === null
      || displayedEvents + hiddenOrOtherEvents !== totalEvents
      || !Array.isArray(result.pages) || result.pages.length > 10
    ) return fail();

    let sum = 0;
    const paths = new Set<string>();
    const pages: BehaviorPageRow[] = [];
    for (const entry of result.pages) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail();
      const item = entry as Record<string, unknown>;
      const events = nonnegative(item.events);
      const visitors = nonnegative(item.visitors);
      const sessions = nonnegative(item.sessions);
      if (!safePath(item.path) || paths.has(item.path)
        || events === null || visitors === null || sessions === null
        || visitors < 3 || events < sessions || events < visitors
      ) return fail();
      paths.add(item.path);
      sum += events;
      pages.push({ path: item.path, events, sessions, visitors });
    }
    if (sum !== displayedEvents) return fail();
    if (pages.some((row, i) => i > 0 && row.events > pages[i - 1].events)) return fail();

    return {
      available: true,
      message: null,
      eventName: request.eventName,
      days: request.days,
      totalEvents,
      displayedEvents,
      hiddenOrOtherEvents,
      identifiedSessions,
      minVisitors: 3,
      pages,
    };
  } catch {
    return fail();
  }
}
