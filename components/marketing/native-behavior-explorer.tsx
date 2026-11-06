"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, ArrowRight, GitBranch, Plus, Route, ShieldCheck, Trash2 } from "lucide-react";

import { BEHAVIOR_EVENTS, type BehaviorEvent } from "@/lib/native-behavior-contract";
import type { NativeBehaviorWorkspace } from "@/lib/native-behavior-data";
import type { NativeBehaviorTrends } from "@/lib/native-behavior-trends-data";
import { NativeBehaviorTrendsPanel } from "@/components/marketing/native-behavior-trends";

const labels: Record<string, string> = Object.fromEntries(
  BEHAVIOR_EVENTS.map((item) => [item.name, item.label]),
);

function percent(n: number, d: number): string {
  return d > 0 ? (100 * n / d).toFixed(1) + "%" : "—";
}

export function NativeBehaviorExplorer({ workspace, trends }: { workspace: NativeBehaviorWorkspace; trends: NativeBehaviorTrends }) {
  const router = useRouter();
  const [days, setDays] = useState<7 | 14 | 30>(workspace.days);
  const [steps, setSteps] = useState<BehaviorEvent[]>(workspace.selectedSteps);

  function updateStep(index: number, next: BehaviorEvent) {
    if (steps.some((value, i) => value === next && i !== index)) return;
    setSteps((current) => current.map((item, i) => i === index ? next : item));
  }

  function addStep() {
    if (steps.length >= 5) return;
    const next = BEHAVIOR_EVENTS.find((item) => !steps.includes(item.name));
    if (next) setSteps((current) => [...current, next.name]);
  }

  function apply() {
    if (steps.length < 2 || steps.length > 5 || new Set(steps).size !== steps.length) return;
    const search = new URLSearchParams({
      view: "behavior", days: String(days), steps: steps.join(","),
    });
    router.push("/marketing?" + search.toString());
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Activity size={14} /> Native product analytics
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Behavior explorer</h2>
            <p className="mt-1 text-sm text-slate-500">Build ordered funnels and examine popular page transitions without session recordings.</p>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">Page-view event counts can include same-page SPA URL changes, including query or hash updates, without a full page reload. They are not verified full page loads or distinct people.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            <ShieldCheck size={14} /> Tenant-scoped aggregates
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Define a conversion funnel</h3>
            <p className="mt-1 text-xs text-slate-500">Each step must occur after the previous one, within the same source, visitor and session.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Date range
            <select aria-label="Analytics date range" value={days}
              onChange={(event) => setDays(Number(event.target.value) as 7 | 14 | 30)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((event, index) => (
            <div key={index} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold dark:bg-slate-900">{index + 1}</span>
              <select aria-label={"Funnel step " + (index + 1)} value={event}
                onChange={(e) => updateStep(index, e.target.value as BehaviorEvent)}
                className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-2 text-xs font-medium text-slate-800 dark:text-white">
                {BEHAVIOR_EVENTS.map((option) => (
                  <option key={option.name} value={option.name}
                    disabled={steps.includes(option.name) && option.name !== event}>{option.label}</option>
                ))}
              </select>
              <button type="button" aria-label={"Remove step " + (index + 1)}
                disabled={steps.length <= 2}
                onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-900">
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
          {steps.length < 5 ? (
            <button type="button" onClick={addStep}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <Plus size={15}/> Add step
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={apply}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-950">
            Run funnel <ArrowRight size={14}/>
          </button>
        </div>
      </section>

      {!workspace.available ? (
        <section role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
          <GitBranch size={24} className="mx-auto text-slate-400"/>
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">Behavior analytics unavailable</h3>
          <p className="mt-2 text-sm text-slate-500">{workspace.message}</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ordered funnel</h3>
              <span className="text-xs text-slate-500">{workspace.days}-day window</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {workspace.funnel.map((step, index) => {
                const previous = index > 0 ? workspace.funnel[index - 1].sessions : step.sessions;
                const drop = index > 0 ? Math.max(0, previous - step.sessions) : 0;
                const first = workspace.funnel[0]?.sessions || 0;
                const ratio = first > 0 ? Math.max(0, Math.min(100, step.sessions / first * 100)) : 0;
                return (
                  <div key={step.event_name + index} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{index + 1}. {labels[step.event_name] || step.event_name}</p>
                    <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{step.sessions.toLocaleString()}</div>
                    <p className="mt-1 text-xs text-slate-500">{index > 0 ? percent(step.sessions, previous) + " of prior stage" : "Starting sessions"}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-slate-700 dark:bg-slate-300" style={{width: String(ratio) + "%"}} />
                    </div>
                    {index > 0 ? <p className="mt-2 text-xs text-slate-500">{drop.toLocaleString()} did not progress</p> : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-slate-500">Session-level observations only. A browser form submission is not proof of a CRM lead, payment or enrollment.</p>
          </section>

          <section aria-label="Popular navigation paths" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2"><Route size={16} className="text-slate-500"/>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Popular navigation paths</h3></div>
                <p className="mt-1 text-xs text-slate-500">Adjacent page transitions with at least {workspace.minPathVisitors} distinct tracked visitor IDs.</p>
              </div>
              <span className="text-xs text-slate-500">{workspace.pathSessions.toLocaleString()} page-view sessions</span>
            </div>
            {workspace.paths.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800">
                No path has enough evidence yet. Try a longer date range.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                    <tr><th className="py-3 font-semibold">From</th><th className="py-3 font-semibold">To</th><th className="py-3 text-right font-semibold">Sessions</th><th className="py-3 text-right font-semibold">Transitions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                    {workspace.paths.map((path, index) => (
                      <tr key={path.from_path + path.to_path + index}>
                        <td className="max-w-[210px] truncate py-3 pr-3 font-medium text-slate-800 dark:text-slate-200">{path.from_path}</td>
                        <td className="max-w-[210px] truncate py-3 pr-3 text-slate-600 dark:text-slate-300">{path.to_path}</td>
                        <td className="py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white">{path.sessions.toLocaleString()}</td>
                        <td className="py-3 text-right tabular-nums text-slate-500">{path.transitions.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">Potentially sensitive URL paths are excluded and individual visitor identifiers are never returned. Tracked visitor IDs generally represent browser identities, not verified people or physical devices.</p>
          </section>
        </>
      )}
      <NativeBehaviorTrendsPanel trends={trends} />
    </div>
  );
}
