import { BEHAVIOR_EVENTS } from "@/lib/native-behavior-contract";
import type { NativeBehaviorWorkspace } from "@/lib/native-behavior-data";

// Only these agreed event labels and bounded aggregate numbers may leave the
// UI via an explicit user-initiated copy. Never serialize the workspace/RPC
// object, source identities, tenant context, public paths or browser state.
const allowedEvents = new Set<string>(BEHAVIOR_EVENTS.map((event) => event.name));

export function formatNativeFunnelReviewCopy(
  report: NativeBehaviorWorkspace,
): string | null {
  if (!report.available || ![7, 14, 30].includes(report.days)
    || report.aggregationUnit !== "source_scoped_visitor_session"
    || typeof report.generatedAt !== "string"
    || report.generatedAt.length > 40
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(report.generatedAt)
    || !Number.isFinite(Date.parse(report.generatedAt))
    || !Array.isArray(report.selectedSteps)
    || report.selectedSteps.length < 2 || report.selectedSteps.length > 5
    || new Set(report.selectedSteps).size !== report.selectedSteps.length
    || !Array.isArray(report.funnel)
    || report.funnel.length !== report.selectedSteps.length
    || !Number.isSafeInteger(report.pathSessions) || report.pathSessions < 0) {
    return null;
  }

  let priorSessions = Number.MAX_SAFE_INTEGER;
  const rows: string[] = [];
  for (let index = 0; index < report.selectedSteps.length; index++) {
    const eventName = report.selectedSteps[index];
    const step = report.funnel[index];
    if (!allowedEvents.has(eventName) || !step
      || step.event_name !== eventName
      || !Number.isSafeInteger(step.sessions) || step.sessions < 0
      || step.sessions > priorSessions) return null;
    rows.push(`Step ${index + 1}: ${eventName}; ordered_sessions=${step.sessions}`);
    priorSessions = step.sessions;
  }

  return [
    "SalsysOS R2 | Ordered funnel review figures",
    "Status: dashboard observation, NOT owner/admin acceptance or SQL reconciliation",
    `Rolling observation window: ${report.days} days (not UTC calendar-day Event Activity)`,
    `Report generated: ${report.generatedAt}`,
    "Aggregation: source-scoped anonymous visitor and session",
    ...rows,
    `Observed page-view sessions denominator: ${report.pathSessions}`,
    "Counts show ordered observed sessions, not independent event totals, unique people, CRM leads, payments or enrollment.",
    "Compare only against the authorized tenant-scoped rolling funnel SQL for the same observation period.",
    "No tenant, visitor, session or source identifiers, paths or URLs are included.",
  ].join("\n");
}
