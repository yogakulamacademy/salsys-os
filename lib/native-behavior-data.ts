import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";
import type { BehaviorEvent } from "@/lib/native-behavior-contract";

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

function number(value: unknown): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
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

    const funnel = Array.isArray(value.funnel)
      ? value.funnel.slice(0, 5).map((entry: unknown) => {
          const row = entry && typeof entry === "object"
            ? entry as Record<string, unknown>
            : {};
          return { event_name: String(row.event_name || ""), sessions: number(row.sessions) };
        })
      : [];
    if (funnel.length !== steps.length || funnel.some((item, index) =>
      item.event_name !== steps[index])) {
      return empty(days, steps);
    }

    const paths = Array.isArray(value.paths)
      ? value.paths.slice(0, 12).flatMap((entry: unknown): BehaviorPath[] => {
          if (!entry || typeof entry !== "object") return [];
          const row = entry as Record<string, unknown>;
          const from = String(row.from_path || "");
          const to = String(row.to_path || "");
          // A second output guard avoids exposing unexpected raw paths if SQL changes.
          if (!safePublicPath(from) || !safePublicPath(to)) return [];
          return [{
            from_path: from,
            to_path: to,
            sessions: number(row.sessions),
            transitions: number(row.transitions),
          }];
        })
      : [];

    return {
      available: true,
      message: null,
      days,
      selectedSteps: steps,
      generatedAt: typeof status.generated_at === "string" ? status.generated_at : null,
      aggregationUnit: "source_scoped_visitor_session",
      funnel,
      paths,
      pathSessions: number(value.path_sessions),
      minPathSessions: 3,
      minPathVisitors: number(status.path_min_visitors) || 3,
    };
  } catch {
    return empty(days, steps);
  }
}
