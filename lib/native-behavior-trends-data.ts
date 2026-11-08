import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { BehaviorEvent } from "@/lib/native-behavior-contract";
import { safeBehaviorCount as count } from "@/lib/native-behavior-safe-count";
import { validBehaviorUtcDayGrid } from "@/lib/native-behavior-utc-day-grid";

export type BehaviorTrendDay = {
  dateUtc: string;
  events: number;
  sessions: number;
};
export type BehaviorTrendSeries = {
  eventName: BehaviorEvent;
  totalEvents: number;
  observedSessions: number;
  days: BehaviorTrendDay[];
};
export type NativeBehaviorTrends = {
  available: boolean;
  message: string | null;
  windowDays: 7 | 14 | 30;
  selectedEvents: BehaviorEvent[];
  generatedAt: string | null;
  series: BehaviorTrendSeries[];
  lastDayIncomplete: boolean;
};

type BehaviorTrendRequest = {
  days: 7 | 14 | 30;
  events: BehaviorEvent[];
};

function unavailable(request: BehaviorTrendRequest, message: string): NativeBehaviorTrends {
  return {
    available: false,
    message,
    windowDays: request.days,
    selectedEvents: request.events,
    generatedAt: null,
    series: [],
    lastDayIncomplete: true,
  };
}

const unavailableMessage = "Event trends are not available right now. Funnels and paths remain usable.";

export async function getNativeBehaviorTrends(request: BehaviorTrendRequest): Promise<NativeBehaviorTrends> {
  const fail = (message = unavailableMessage) => unavailable(request, message);
  if (![7, 14, 30].includes(request.days)
    || request.events.length < 1
    || request.events.length > 5
    || new Set(request.events).size !== request.events.length) return fail();

  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return fail();

    const organizationId = await requireCurrentOrganizationId(supabase, auth.user.id);
    const { data, error } = await supabase.rpc("get_native_behavior_event_trends_v1", {
      p_organization_id: organizationId,
      p_days: request.days,
      p_events: request.events,
    });
    if (error) {
      console.error("[native-behavior-trends] Aggregate unavailable:", error.code);
      return fail();
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail();
    const result = data as Record<string, unknown>;
    if (!result.status || typeof result.status !== "object" || Array.isArray(result.status)) return fail();
    const status = result.status as Record<string, unknown>;
    if (status.available !== true) {
      return fail(status.reason === "volume_limit"
        ? "This report exceeds the event-volume limit. Choose fewer steps or a shorter date range."
        : unavailableMessage);
    }
    if (status.timezone !== "UTC" || count(status.window_days) !== request.days
      || !Array.isArray(result.series) || result.series.length !== request.events.length) return fail();

    const parsed: BehaviorTrendSeries[] = [];
    for (let i = 0; i < result.series.length; i++) {
      const input = result.series[i];
      if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
      const item = input as Record<string, unknown>;
      if (item.event_name !== request.events[i]
        || !Array.isArray(item.daily) || item.daily.length !== request.days) return fail();
      const totalEvents = count(item.total_events);
      const observedSessions = count(item.observed_sessions);
      if (totalEvents === null || observedSessions === null || observedSessions > totalEvents) return fail();

      const days: BehaviorTrendDay[] = [];
      const dates = new Set<string>();
      for (const rawDay of item.daily) {
        if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay)) return fail();
        const day = rawDay as Record<string, unknown>;
        const dateUtc = day.date_utc;
        const events = count(day.events);
        const sessions = count(day.sessions);
        if (typeof dateUtc !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateUtc)
          || dates.has(dateUtc) || events === null || sessions === null || sessions > events) return fail();
        dates.add(dateUtc);
        days.push({ dateUtc, events, sessions });
      }
      // A daily distinct-session set is always a subset of the full-window
      // set. The UNION of all daily sets is the full-window set, so their
      // summed cardinalities must cover the full-window distinct count.
      // Do not require equality: one browser session may span multiple UTC days.
      const dailySessions = days.reduce((total, day) => total + day.sessions, 0);
      if (days.some((day) => day.sessions > observedSessions)
        || dailySessions < observedSessions || !Number.isSafeInteger(dailySessions)) return fail();

      // A complete UTC domain must be consecutive and anchored to the RPC's
      // server-side UTC day, not just a sorted array of the requested length.
      if (!validBehaviorUtcDayGrid(
        days.map((day) => day.dateUtc),
        status.first_day_utc,
        status.last_day_utc,
        status.generated_at,
        request.days,
      ) || days.reduce((total, day) => total + day.events, 0) !== totalEvents) return fail();
      parsed.push({ eventName: request.events[i], totalEvents, observedSessions, days });
    }

    return {
      available: true,
      message: null,
      windowDays: request.days,
      selectedEvents: request.events,
      generatedAt: typeof status.generated_at === "string" ? status.generated_at : null,
      series: parsed,
      lastDayIncomplete: status.last_day_incomplete === true,
    };
  } catch {
    return fail();
  }
}
