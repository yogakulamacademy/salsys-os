"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Copy } from "lucide-react";

import { BEHAVIOR_EVENTS } from "@/lib/native-behavior-contract";
import type { NativeBehaviorTrends } from "@/lib/native-behavior-trends-data";
import { formatNativeBehaviorReviewCopy } from "@/lib/native-behavior-trends-review-copy";

const eventLabels: Record<string,string> = Object.fromEntries(
  BEHAVIOR_EVENTS.map((item) => [item.name, item.label]),
);

export function NativeBehaviorTrendsPanel({ trends }: { trends: NativeBehaviorTrends }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const reviewCopy = useMemo(() => formatNativeBehaviorReviewCopy(trends), [trends]);

  useEffect(() => {
    setCopyState("idle");
  }, [reviewCopy]);

  async function copyReviewFigures() {
    if (!reviewCopy) return;
    try {
      await navigator.clipboard.writeText(reviewCopy);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section aria-label="Event activity trends"
      className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Event activity</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Independent daily event counts for your selected funnel steps, displayed in UTC.
            These are not funnel conversions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Last {trends.windowDays} UTC calendar days</span>
          {reviewCopy ? (
            <button type="button" onClick={copyReviewFigures}
              aria-label="Copy Event activity review figures"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900">
              <Copy size={13} aria-hidden="true" />
              Copy review figures
            </button>
          ) : null}
          {copyState !== "idle" && reviewCopy ? (
            <span role="status" aria-live="polite" className="text-xs text-slate-500">
              {copyState === "copied" ? "Aggregate figures copied" : "Clipboard unavailable; no data copied"}
            </span>
          ) : null}
        </div>
      </div>

      {!trends.available ? (
        <div role="status"
          className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800">
          {trends.message}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {trends.series.map((series) => {
              const label = eventLabels[series.eventName] || series.eventName;
              const max = Math.max(0, ...series.days.map((day) => day.events));
              const accessible = series.days
                .map((day) => day.dateUtc + ": " + day.events + " events").join("; ");
              return (
                <article key={series.eventName}
                  className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                  aria-label={label + " event trend"}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {series.totalEvents.toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">Observed events in period</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        {series.observedSessions.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500">Identified sessions</p>
                    </div>
                  </div>
                  <div role="img"
                    aria-label={label + " daily counts: " + accessible}
                    className="mt-5 flex h-20 w-full items-end gap-1 border-b border-slate-200 pb-1 dark:border-slate-800">
                    {series.days.map((day) => (
                      <div key={day.dateUtc} className="flex h-full min-w-0 flex-1 items-end"
                        title={day.dateUtc + " UTC · " + day.events + " events · " + day.sessions + " sessions"}>
                        <div className="w-full rounded-t-sm bg-slate-600 dark:bg-slate-300"
                          style={{ height: (max > 0 ? (day.events / max) * 100 : 0) + "%" }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between gap-2 text-[11px] text-slate-500">
                    <span>{series.days[0]?.dateUtc}</span>
                    <span>{series.days[series.days.length - 1]?.dateUtc}</span>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Each event is counted on its observed UTC date. Identified sessions are deduplicated
            by tracking source, visitor and session across the selected period. Events without
            full session identifiers remain in event counts but not session counts.
            {trends.lastDayIncomplete ? " The current UTC day is still incomplete." : ""}
          </p>
        </>
      )}
    </section>
  );
}
