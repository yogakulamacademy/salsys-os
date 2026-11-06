import type { NativeBehaviorTrends } from "@/lib/native-behavior-trends-data";

// Explicitly serialize ONLY these aggregate fields. Never serialize an RPC
// object, browser/session context or any tenant, visitor, source or path data.
export function formatNativeBehaviorReviewCopy(
  report: NativeBehaviorTrends,
): string | null {
  // Unlike a mere timestamp prefix, an entire bounded ISO value can be
  // safely copied without including appended URLs or newline-delimited data.
  const generatedAt = report.generatedAt;
  if (!report.available || typeof generatedAt !== "string"
    || generatedAt.length > 40
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt)
    || !Number.isFinite(Date.parse(generatedAt))
    || ![7, 14, 30].includes(report.windowDays)
    || report.series.length === 0 || report.series.length > 5) return null;

  const start = report.series[0]?.days[0]?.dateUtc;
  const end = report.series[0]?.days[report.windowDays - 1]?.dateUtc;
  if (!start || !end
    || !/^\d{4}-\d{2}-\d{2}$/.test(start)
    || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;

  const rows: string[] = [];
  for (const series of report.series) {
    // Event identifiers are fixed, allow-listed web event names in the
    // authenticated loader. Check again here to avoid copying rogue text.
    if (!/^web\.[a-z]+(?:_[a-z]+)*$/.test(series.eventName)
      || !report.selectedEvents.includes(series.eventName)
      || !Number.isSafeInteger(series.totalEvents) || series.totalEvents < 0
      || !Number.isSafeInteger(series.observedSessions) || series.observedSessions < 0
      || series.observedSessions > series.totalEvents
      || series.days.length !== report.windowDays
      || series.days[0]?.dateUtc !== start
      || series.days[series.days.length - 1]?.dateUtc !== end) return null;
    rows.push(`${series.eventName}: events=${series.totalEvents}; identified_sessions=${series.observedSessions}`);
  }

  return [
    "SalsysOS R2 | Event activity review figures",
    "Status: dashboard observation, NOT acceptance or SQL reconciliation",
    `UTC calendar window: ${report.windowDays} days (${start} through ${end})`,
    `Report generated: ${report.generatedAt}`,
    `Current UTC day incomplete: ${report.lastDayIncomplete ? "yes" : "no"}`,
    ...rows,
    "Semantics: independent observed event counts, not ordered funnel conversions or payments.",
    "Reconcile with authorized tenant-scoped SQL from the same observation period.",
    "This copy contains no tenant, visitor, source or session identifiers, or URLs.",
  ].join("\n");
}
