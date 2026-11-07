import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { BehaviorEvent } from "@/lib/native-behavior-contract";
import { safeBehaviorCount } from "@/lib/native-behavior-safe-count";

export type BehaviorStep = { event_name: string; sessions: number };
export type BehaviorPath = {
  from_path: string;
  to_path: string;
  sessions: number;
  transitions: number;
};
export type NativeBehaviorWorkspace = {
  available: boolean;
  message: string | null;
  days: 7 | 14 | 30;
  selectedSteps: BehaviorEvent[];
  generatedAt: string | null;
  aggregationUnit: string;
  funnel: BehaviorStep[];
  paths: BehaviorPath[];
  pathSessions: number;
  minPathSessions: number;
  minPathVisitors: number;
};

const placeholder = "Behavioral analytics are temporarily unavailable. Please try again.";

function empty(
  days: 7 | 14 | 30,
  selectedSteps: BehaviorEvent[],
  message = placeholder,
): NativeBehaviorWorkspace {
  return {
    available: false,
    message,
    days,
    selectedSteps,
    generatedAt: null,
    aggregationUnit: "source_scoped_visitor_session",
    funnel: [],
    paths: [],
    pathSessions: 0,
    minPathSessions: 3,
    minPathVisitors: 3,
  };
}

function safePublicPath(value: string): boolean {
  const isCleanSlug = /^\/[a-zA-Z0-9/_-]{0,120}$/.test(value);
  const isPublicPage = /^\/[a-zA-Z0-9/_-]{1,120}\.(?:php|html?)$/.test(value);
  return (isCleanSlug || isPublicPage)
    && value !== "/other"
    && !/[0-9]{6,}/.test(value)
    && !/[a-f0-9]{16,}/i.test(value)
    && !/\/[0-9]{4,}(?:\/|\.|$)/.test(value)
    // Defense in depth: the RPC path normalizer also rejects these private routes.
    && !/(^|\/)(account|profile|users?|students?|private|admin|dashboard|settings|session|token|reset-password|payments?|orders?|checkout|leads?|api|auth)(\/|\.|$)/i.test(value);
}

export async function getNativeBehaviorWorkspace(
  request: { days: 7 | 14 | 30; steps: BehaviorEvent[] },
): Promise<NativeBehaviorWorkspace> {
  const { days, steps } = request;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return empty(days, steps);

  try {
    const organizationId = await requireCurrentOrganizationId(supabase, auth.user.id);
    const { data, error } = await supabase.rpc("get_native_behavior_workspace_v1", {
      p_organization_id: organizationId,
      p_days: days,
      p_steps: steps,
    });
    if (error) {
      console.error("[native-behavior] Aggregation unavailable:", error.code);
      return empty(days, steps);
    }

    const value = data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
    const status = value.status && typeof value.status === "object"
      ? value.status as Record<string, unknown>
      : {};
    if (status.available !== true) {
      return empty(
        days,
        steps,
        status.reason === "volume_limit"
          ? "This event volume exceeds the bounded explorer limit. Narrow the report before retrying."
          : placeholder,
      );
    }

    // A failed/partial RPC must not present missing counts as observed zeroes.
    if (status.window_days !== days
      || status.aggregation_unit !== "source_scoped_visitor_session"
      || status.path_min_visitors !== 3
      || status.path_min_sessions !== 3
      || !Array.isArray(value.funnel) || value.funnel.length !== steps.length
      || !Array.isArray(value.paths) || value.paths.length > 12) {
      return empty(days, steps);
    }

    const funnel: BehaviorStep[] = [];
    for (let index = 0; index < steps.length; index++) {
      const entry = value.funnel[index];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return empty(days, steps);
      const row = entry as Record<string, unknown>;
      const sessions = safeBehaviorCount(row.sessions);
      if (row.event_name !== steps[index] || sessions === null
        || (index > 0 && sessions > funnel[index - 1].sessions)) return empty(days, steps);
      funnel.push({ event_name: steps[index], sessions });
    }

    const pathSessions = safeBehaviorCount(value.path_sessions);
    if (pathSessions === null) return empty(days, steps);
    const paths: BehaviorPath[] = [];
    for (const entry of value.paths) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return empty(days, steps);
      const row = entry as Record<string, unknown>;
      const from = typeof row.from_path === "string" ? row.from_path : "";
      const to = typeof row.to_path === "string" ? row.to_path : "";
      // Keep filtering unexpected private routes rather than echoing them.
      if (!safePublicPath(from) || !safePublicPath(to)) continue;
      const sessions = safeBehaviorCount(row.sessions);
      const transitions = safeBehaviorCount(row.transitions);
      // Three *different visitors* necessarily imply at least three distinct
      // visitor-session keys. This is a necessary, not sufficient, k-anonymity
      // assertion: PostgreSQL still owns the actual distinct-visitor check.
      // Never render an impossible subthreshold edge after an RPC regression.
      if (sessions === null || transitions === null || sessions < 3
        || transitions < sessions || sessions > pathSessions) return empty(days, steps);
      paths.push({ from_path: from, to_path: to, sessions, transitions });
    }

    return {
      available: true,
      message: null,
      days,
      selectedSteps: steps,
      generatedAt: typeof status.generated_at === "string" ? status.generated_at : null,
      aggregationUnit: "source_scoped_visitor_session",
      funnel,
      paths,
      pathSessions,
      minPathSessions: 3,
      minPathVisitors: 3,
    };
  } catch {
    return empty(days, steps);
  }
}
