import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export const BEHAVIOR_EVENTS = [
  { name: "web.page_viewed", label: "Page viewed" },
  { name: "web.session_started", label: "Session started" },
  { name: "web.cta_clicked", label: "CTA clicked" },
  { name: "web.cta_viewed", label: "CTA viewed" },
  { name: "web.form_started", label: "Form started" },
  { name: "web.form_submitted", label: "Form submitted" },
  { name: "web.form_acknowledged", label: "Form acknowledged" },
  { name: "web.form_validation_failed", label: "Form error" },
  { name: "web.pricing_viewed", label: "Pricing viewed" },
  { name: "web.faq_expanded", label: "FAQ expanded" },
  { name: "web.brochure_clicked", label: "Brochure clicked" },
  { name: "web.scroll_depth_reached", label: "Scroll threshold" },
] as const;

export type BehaviorEvent = (typeof BEHAVIOR_EVENTS)[number]["name"];
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
};

export const DEFAULT_BEHAVIOR_STEPS: BehaviorEvent[] = [
  "web.page_viewed",
  "web.form_started",
  "web.form_submitted",
];

const allowed = new Set<string>(BEHAVIOR_EVENTS.map((item) => item.name));
const placeholder = "Behavioral analytics are temporarily unavailable. Please try again.";

export function normalizeBehaviorRequest(
  days: unknown,
  stepParam: unknown,
): { days: 7 | 14 | 30; steps: BehaviorEvent[] } {
  const numeric = Number(days);
  const window = numeric === 7 || numeric === 14 || numeric === 30 ? numeric : 14;
  const raw = typeof stepParam === "string" ? stepParam.split(",") : [];
  const steps = raw.map((item) => item.trim());
  const valid =
    steps.length >= 2 &&
    steps.length <= 5 &&
    new Set(steps).size === steps.length &&
    steps.every((step) => allowed.has(step));
  return {
    days: window,
    steps: valid ? (steps as BehaviorEvent[]) : [...DEFAULT_BEHAVIOR_STEPS],
  };
}

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
  };
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
          if (!/^\/[a-zA-Z0-9/_-]{0,120}$/.test(from) ||
              !/^\/[a-zA-Z0-9/_-]{0,120}$/.test(to)) return [];
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
    };
  } catch {
    return empty(days, steps);
  }
}
