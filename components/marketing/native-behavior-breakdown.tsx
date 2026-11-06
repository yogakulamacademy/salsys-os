import { ArrowRight, ListFilter } from "lucide-react";
import { BEHAVIOR_EVENTS, type BehaviorEvent } from "@/lib/native-behavior-contract";
import type { NativeBehaviorPageBreakdown } from "@/lib/native-behavior-breakdown-data";

const labels: Record<string,string> = Object.fromEntries(
  BEHAVIOR_EVENTS.map((entry) => [entry.name,entry.label]),
);

function percentage(events: number, total: number): string {
  return total > 0 ? (100 * events / total).toFixed(1) + "%" : "—";
}

export function NativeBehaviorBreakdownPanel({
  breakdown,
  appliedSteps,
}: {
  breakdown: NativeBehaviorPageBreakdown;
  appliedSteps: BehaviorEvent[];
}) {
  const selectedLabel = labels[breakdown.eventName] || breakdown.eventName;

  return (
    <section aria-label="Event page breakdown" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ListFilter size={16} className="text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Events by page</h3>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Find the pages generating each event. This is an observation breakdown,
            not a conversion attribution report.
          </p>
          {breakdown.eventName === "web.page_viewed" ? (
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Page-view events can include same-page SPA URL changes (such as query or hash updates)
              without a full page reload. They are not verified full page loads.
            </p>
          ) : null}
        </div>
        <form method="get" action="/marketing" className="flex flex-wrap items-end gap-2">
          {/* Native GET submission preserves a visitor's selected event even when
              they interact before client hydration or during an RSC refresh. */}
          <input type="hidden" name="view" value="behavior" />
          <input type="hidden" name="days" value={String(breakdown.days)} />
          <input type="hidden" name="steps" value={appliedSteps.join(",")} />
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Tracked event
            <select aria-label="Page breakdown event" name="breakdown"
              defaultValue={breakdown.eventName}
              className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              {BEHAVIOR_EVENTS.map((entry) => (
                <option key={entry.name} value={entry.name}>{entry.label}</option>
              ))}
            </select>
          </label>
          <button type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-950">
            View pages <ArrowRight size={14} />
          </button>
        </form>
      </div>

      {!breakdown.available ? (
        <p role="status"
          className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-800">
          {breakdown.message}
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
              <p className="text-xs text-slate-500">{selectedLabel} events</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{breakdown.totalEvents.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
              <p className="text-xs text-slate-500">On listed pages</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{breakdown.displayedEvents.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
              <p className="text-xs text-slate-500">Other or withheld events</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{breakdown.hiddenOrOtherEvents.toLocaleString()}</p>
            </div>
          </div>

          {breakdown.pages.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800">
              {breakdown.totalEvents === 0
                ? "No events were observed in this period."
                : "No public page reached the minimum visitor threshold in this period."}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[510px] text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="py-3 font-semibold">Page</th>
                    <th className="py-3 text-right font-semibold">Events</th>
                    <th className="py-3 text-right font-semibold">Share</th>
                    <th className="py-3 text-right font-semibold">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                  {breakdown.pages.map((row) => (
                    <tr key={row.path}>
                      <td className="max-w-[250px] truncate py-3 pr-4 font-medium text-slate-800 dark:text-slate-200" title={row.path}>{row.path}</td>
                      <td className="py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-white">{row.events.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums text-slate-500">{percentage(row.events,breakdown.totalEvents)}</td>
                      <td className="py-3 text-right tabular-nums text-slate-500">{row.sessions.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Only safe public page paths observed from at least {breakdown.minVisitors} distinct tracked visitor IDs
            are listed (maximum 10). Other or withheld events include unclassified paths,
            small visitor groups and pages beyond the top 10. Reporting uses the selected {breakdown.days}-day UTC window. A tracked visitor ID may change with browsers or resets; it is not a verified person or device.
          </p>
        </>
      )}
    </section>
  );
}
