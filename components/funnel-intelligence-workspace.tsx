"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  FunnelDailyEvidence,
  FunnelIntelligenceWorkspace,
  FunnelJourney,
  FunnelSourceEvidence,
  FunnelStage,
} from "@/lib/funnel-intelligence-data";

type TrendMetric = "sessions" | "leads" | "qualified" | "enrolled";

export function FunnelIntelligenceWorkspace({
  workspace,
}: {
  workspace: FunnelIntelligenceWorkspace;
}) {
  if (!workspace.status.available || !workspace.overview) {
    return <UnavailableState message={workspace.status.message} />;
  }

  return <AvailableWorkspace workspace={workspace} />;
}

function AvailableWorkspace({ workspace }: { workspace: FunnelIntelligenceWorkspace }) {
  const overview = workspace.overview!;
  const [journeyKey, setJourneyKey] = useState(workspace.journeys[0]?.key ?? "business");
  const [selectedStageKey, setSelectedStageKey] = useState(workspace.journeys[0]?.stages[0]?.key ?? "leads");
  const [selectedSource, setSelectedSource] = useState(workspace.sources[0]?.source ?? "");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("leads");

  const journey =
    workspace.journeys.find((item) => item.key === journeyKey) ?? workspace.journeys[0];
  const selectedStage =
    journey?.stages.find((stage) => stage.key === selectedStageKey) ?? journey?.stages[0];
  const selectedStageIndex = selectedStage
    ? journey.stages.findIndex((stage) => stage.key === selectedStage.key)
    : -1;
  const previousStage = selectedStageIndex > 0 ? journey.stages[selectedStageIndex - 1] : null;
  const comparable = Boolean(
    selectedStage && previousStage && selectedStage.unit === previousStage.unit,
  );
  const stageRate =
    comparable && previousStage && previousStage.count > 0 && selectedStage
      ? (selectedStage.count / previousStage.count) * 100
      : null;
  const dropOff = stageRate == null ? null : Math.max(0, 100 - stageRate);

  const source =
    workspace.sources.find((item) => item.source === selectedSource) ?? workspace.sources[0];
  const measurementState = measurementLabel(workspace.measurement?.first_touch_coverage ?? null);
  const insight = buildInsight(workspace);

  const selectJourney = (next: FunnelJourney) => {
    setJourneyKey(next.key);
    setSelectedStageKey(next.stages[0]?.key ?? "leads");
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="CRM leads" value={overview.leads} note={`${workspace.status.window_days}-day cohort`} icon={<UsersRound size={16} />} />
        <Kpi label="Qualified" value={overview.qualified} note={rateLabel(overview.qualified, overview.leads, "of leads")} icon={<Target size={16} />} />
        <Kpi label="Paid" value={overview.paid} note={rateLabel(overview.paid, overview.leads, "of leads")} icon={<CircleDollarSign size={16} />} />
        <Kpi label="Enrolled" value={overview.enrolled} note={rateLabel(overview.enrolled, overview.leads, "of leads")} icon={<CheckCircle2 size={16} />} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-slate-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Conversion path</div>
              <h2 className="mt-1 text-base font-black tracking-[-0.02em] text-slate-950 dark:text-white">Choose the journey to investigate</h2>
            </div>
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {workspace.journeys.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectJourney(item)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${
                    item.key === journey?.key
                      ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {journey ? <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">{journey.description}</p> : null}
        </div>

        {journey ? (
          <div className="p-4 sm:p-5">
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-[760px] items-stretch gap-2">
                {journey.stages.map((stage, index) => {
                  const previous = index > 0 ? journey.stages[index - 1] : null;
                  const canCompare = Boolean(previous && previous.unit === stage.unit && previous.count > 0);
                  const rate = canCompare && previous ? (stage.count / previous.count) * 100 : null;
                  const selected = stage.key === selectedStage?.key;
                  return (
                    <div key={`${journey.key}-${stage.key}`} className="flex min-w-0 flex-1 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStageKey(stage.key)}
                        className={`min-w-[108px] flex-1 rounded-xl border px-3 py-4 text-left transition ${
                          selected
                            ? "border-violet-300 bg-violet-50/70 ring-4 ring-violet-500/5 dark:border-violet-800 dark:bg-violet-950/25"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900"
                        }`}
                      >
                        <span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Step {index + 1}</span>
                        <span className="mt-1 block text-[11px] font-black text-slate-700 dark:text-slate-200">{stage.label}</span>
                        <span className="mt-2 block text-xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{stage.count.toLocaleString("en-IN")}</span>
                        <span className="mt-1 block text-[9px] font-semibold text-slate-400">
                          {rate == null
                            ? index === 0
                              ? "Journey entry"
                              : stage.unit !== previous?.unit
                                ? `Now counting ${stage.unit}`
                                : "Not enough data"
                            : `${rate.toFixed(1)}% from previous`}
                        </span>
                      </button>
                      {index < journey.stages.length - 1 ? <ArrowRight size={13} className="shrink-0 text-slate-300" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedStage ? (
              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">Selected stage</div>
                  <div className="mt-1 text-base font-black text-slate-950 dark:text-white">{selectedStage.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{stageExplanation(selectedStage)}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Stat label="Stage conversion" value={stageRate == null ? "Not comparable" : `${stageRate.toFixed(1)}%`} />
                    <Stat label="Stage drop-off" value={dropOff == null ? "Not comparable" : `${dropOff.toFixed(1)}%`} />
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-slate-500">
                    {previousStage
                      ? comparable
                        ? `${previousStage.count.toLocaleString("en-IN")} ${previousStage.unit} reached ${previousStage.label.toLowerCase()}; ${selectedStage.count.toLocaleString("en-IN")} reached ${selectedStage.label.toLowerCase()}.`
                        : `This step changes counting units from ${previousStage.unit} to ${selectedStage.unit}. SalsysOS does not calculate a misleading conversion rate across that boundary.`
                      : "This is the entry point for the selected journey."}
                  </p>
                  {stageHref(selectedStage, journey.key) ? (
                    <Link href={stageHref(selectedStage, journey.key)!} className="mt-4 inline-flex items-center gap-1 text-xs font-black text-violet-600 hover:underline dark:text-violet-300">
                      Inspect matching records <ArrowRight size={12} />
                    </Link>
                  ) : null}
                </div>

                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300"><Sparkles size={13} /> Funnel insight</div>
                  <div className="mt-2 text-sm font-black text-slate-950 dark:text-white">{stageInsight(selectedStage, previousStage, stageRate)}</div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">Investigate source, engagement, follow-up, form friction and measurement gaps before assigning a cause to a conversion change.</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Source performance</div>
              <h2 className="mt-1 text-sm font-black text-slate-950 dark:text-white">Where CRM leads originated</h2>
              <p className="mt-1 text-[11px] text-slate-500">Choose a source to inspect downstream quality and revenue evidence.</p>
            </div>
            <div className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-black text-slate-500 dark:bg-slate-900">{overview.leads} leads</div>
          </div>

          <SourceList sources={workspace.sources} selectedSource={source?.source ?? ""} onSelect={setSelectedSource} />

          {source ? <SourceDetail source={source} totalLeads={overview.leads} /> : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Measurement health</div>
                <div className="mt-1 text-sm font-black text-slate-950 dark:text-white">Evidence quality</div>
              </div>
              <StateBadge state={measurementState} />
            </div>
            <Measurement workspace={workspace} />
            <Link href="/system-health" className="mt-4 inline-flex items-center gap-1 text-[11px] font-black text-violet-600 hover:underline dark:text-violet-300">View diagnostics <ArrowRight size={12} /></Link>
          </div>

          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/20">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300"><Sparkles size={13} /> Salsys intelligence</div>
            <div className="mt-2 text-sm font-black text-slate-950 dark:text-white">{insight.title}</div>
            <p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-400">{insight.detail}</p>
            <Link href={insight.href} className="mt-3 inline-flex items-center gap-1 text-[11px] font-black text-violet-600 hover:underline dark:text-violet-300">{insight.action} <ArrowRight size={12} /></Link>
          </div>
        </div>
      </section>

      <TrendPanel daily={workspace.daily} metric={trendMetric} onMetric={setTrendMetric} />

      <div className="px-1 text-[10px] leading-4 text-slate-400">
        Sessions, form events, leads and payments use different counting units. SalsysOS calculates stage rates only when adjacent stages are comparable and does not infer missing conversion evidence.
      </div>
    </div>
  );
}

function UnavailableState({ message }: { message?: string }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-900/60 dark:bg-slate-950">
      <div className="flex max-w-2xl items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><AlertTriangle size={17} /></span>
        <div>
          <div className="text-sm font-black text-slate-950 dark:text-white">Conversion data is temporarily unavailable</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{message ?? "Please try again. SalsysOS is not treating unavailable reporting as zero performance."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()} className="btn-primary">Try again</button>
            <Link href="/system-health" className="btn-secondary">View technical diagnostics</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, note, icon }: { label: string; value: number; note: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span><span className="text-slate-300">{icon}</span></div>
      <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{value.toLocaleString("en-IN")}</div>
      <div className="mt-1 text-[10px] font-medium text-slate-500">{note}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-900"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div><div className="mt-1 text-lg font-black text-slate-950 dark:text-white">{value}</div></div>;
}

function SourceList({ sources, selectedSource, onSelect }: { sources: FunnelSourceEvidence[]; selectedSource: string; onSelect: (source: string) => void }) {
  const max = Math.max(1, ...sources.map((row) => row.leads));
  if (!sources.length) return <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400 dark:border-slate-800">No source evidence for this period.</div>;
  return (
    <div className="mt-5 space-y-1">
      {sources.slice(0, 10).map((row) => (
        <button key={row.source} type="button" onClick={() => onSelect(row.source)} className={`grid w-full grid-cols-[minmax(100px,180px)_1fr_72px] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition ${selectedSource === row.source ? "bg-violet-50 dark:bg-violet-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}>
          <span className="truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{pretty(row.source)}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${Math.max(3, (row.leads / max) * 100)}%` }} /></span>
          <span className="text-right text-[10px] font-black text-slate-600 dark:text-slate-300">{row.leads} · {percent(row.leads, sources.reduce((sum, item) => sum + item.leads, 0))}</span>
        </button>
      ))}
    </div>
  );
}

function SourceDetail({ source, totalLeads }: { source: FunnelSourceEvidence; totalLeads: number }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-sm font-black text-slate-950 dark:text-white">{pretty(source.source)}</div><div className="mt-1 text-[10px] text-slate-500">{source.leads} leads · {percent(source.leads, totalLeads)} of the visible CRM cohort</div></div>
        <div className="flex gap-2"><Link href={`/leads?source=${encodeURIComponent(source.source)}`} className="btn-secondary !px-2.5 !py-1.5 !text-[10px]">Leads</Link><Link href={`/attribution?q=${encodeURIComponent(source.source)}`} className="btn-secondary !px-2.5 !py-1.5 !text-[10px]">Attribution</Link></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TinyStat label="Qualified" value={`${source.qualified} · ${percent(source.qualified, source.leads)}`} />
        <TinyStat label="Paid" value={`${source.paid} · ${percent(source.paid, source.leads)}`} />
        <TinyStat label="Enrolled" value={`${source.enrolled} · ${percent(source.enrolled, source.leads)}`} />
        <TinyStat label="Revenue" value={formatRevenue(source.revenue_inr, source.revenue_usd)} />
      </div>
    </div>
  );
}

function TinyStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-900"><div className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">{label}</div><div className="mt-1 text-[11px] font-black text-slate-800 dark:text-slate-100">{value}</div></div>;
}

function Measurement({ workspace }: { workspace: FunnelIntelligenceWorkspace }) {
  const m = workspace.measurement;
  if (!m) return <div className="mt-4 text-xs text-slate-400">Measurement information unavailable.</div>;
  return (
    <div className="mt-4 space-y-3">
      <HealthRow label="First-touch attribution" value={m.first_touch_coverage == null ? "Not enough data" : `${m.first_touch_coverage.toFixed(1)}% known`} icon={<Route size={13} />} />
      <HealthRow label="Unknown first touch" value={`${m.unknown_first_touch} of ${m.total_leads} leads`} icon={<Activity size={13} />} />
      <HealthRow label="Web identity linkage" value={`${m.web_linked_leads} linked leads`} icon={<ShieldCheck size={13} />} />
      <HealthRow label="Form evidence" value={`${m.form_submit_sessions} submit sessions · ${m.website_created_leads} website-created leads`} icon={<Target size={13} />} />
    </div>
  );
}

function HealthRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 text-[11px] last:border-0 last:pb-0 dark:border-slate-900"><span className="flex items-center gap-2 font-semibold text-slate-500"><span className="text-slate-300">{icon}</span>{label}</span><span className="text-right font-black text-slate-800 dark:text-slate-100">{value}</span></div>;
}

function StateBadge({ state }: { state: string }) {
  const tone = state === "Reliable" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : state === "Directional" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300";
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.06em] ${tone}`}>{state}</span>;
}

function TrendPanel({ daily, metric, onMetric }: { daily: FunnelDailyEvidence[]; metric: TrendMetric; onMetric: (metric: TrendMetric) => void }) {
  const max = Math.max(1, ...daily.map((row) => row[metric]));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Journey trends</div><div className="mt-1 text-sm font-black text-slate-950 dark:text-white">Daily observed movement</div></div>
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
          {(["sessions","leads","qualified","enrolled"] as TrendMetric[]).map((item) => <button key={item} type="button" onClick={() => onMetric(item)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-black capitalize ${metric === item ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500"}`}>{item}</button>)}
        </div>
      </div>
      {daily.length ? (
        <div className="mt-5 overflow-x-auto pb-1">
          <div className="flex h-36 min-w-[680px] items-end gap-1.5 border-b border-slate-100 dark:border-slate-900">
            {daily.map((row) => <div key={row.date} title={`${row.date} · ${row[metric]}`} className="flex h-full min-w-[10px] flex-1 items-end"><span className="block w-full rounded-t bg-violet-500/80" style={{ height: `${row[metric] ? Math.max(3, (row[metric] / max) * 100) : 0}%` }} /></div>)}
          </div>
          <div className="mt-2 flex min-w-[680px] justify-between text-[9px] font-semibold text-slate-400"><span>{daily[0]?.date ?? ""}</span><span>{daily[daily.length - 1]?.date ?? ""}</span></div>
        </div>
      ) : <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs text-slate-400 dark:border-slate-800">No activity data for this period.</div>}
    </section>
  );
}

function buildInsight(workspace: FunnelIntelligenceWorkspace) {
  const m = workspace.measurement;
  const o = workspace.overview;
  if (!m || !o) return { title: "Not enough data", detail: "Conversion evidence is incomplete for this period.", action: "View diagnostics", href: "/system-health" };
  if (m.first_touch_coverage != null && m.first_touch_coverage < 90) {
    return { title: `${m.unknown_first_touch} leads still have unknown first-touch attribution`, detail: "Budget and source conclusions should remain directional until more acquisition evidence is linked.", action: "Inspect attribution", href: "/attribution" };
  }
  const paidRate = o.qualified > 0 ? (o.paid / o.qualified) * 100 : null;
  if (paidRate != null && paidRate < 25) {
    return { title: "Qualified leads are not consistently reaching payment", detail: `${o.qualified} qualified leads are visible in the cohort, while ${o.paid} has a recorded paid outcome. Review follow-up and payment-stage evidence before assigning a cause.`, action: "Open payment-stage leads", href: "/leads?stage=payment_pending" };
  }
  return { title: "Conversion evidence is available", detail: "Use the journey, source and trend controls to investigate changes before making campaign or admissions decisions.", action: "Open attribution", href: "/attribution" };
}

function stageHref(stage: FunnelStage, journeyKey: string) {
  const params = new URLSearchParams();
  if (journeyKey === "website") params.set("channel", "website");
  if (journeyKey === "whatsapp") params.set("channel", "whatsapp");
  if (stage.key === "leads") return `/leads${params.toString() ? `?${params}` : ""}`;
  if (stage.key === "qualified") params.set("stage", "qualified");
  else if (stage.key === "payment_pending") params.set("stage", "payment_pending");
  else if (stage.key === "enrolled") params.set("stage", "enrolled");
  else if (stage.key === "paid") return "/revenue";
  else return null;
  return `/leads?${params.toString()}`;
}

function stageExplanation(stage: FunnelStage) {
  if (stage.unit === "sessions") return "Observed website sessions or events in the selected reporting window.";
  return "Unique CRM lead records in the selected reporting window.";
}

function stageInsight(stage: FunnelStage, previous: FunnelStage | null, rate: number | null) {
  if (!previous) return `${stage.count.toLocaleString("en-IN")} ${stage.unit} entered this journey.`;
  if (previous.unit !== stage.unit) return "This stage crosses from behavioral events to people, so SalsysOS keeps the counts visible without inventing a conversion rate.";
  if (rate == null) return "Not enough evidence to calculate this transition.";
  const drop = Math.max(0, 100 - rate);
  if (drop >= 60) return `${drop.toFixed(1)}% of the previous stage did not reach ${stage.label.toLowerCase()} in the observed cohort.`;
  if (drop >= 30) return `This transition loses ${drop.toFixed(1)}% of the previous stage and is worth monitoring.`;
  return `${rate.toFixed(1)}% of the previous stage reached ${stage.label.toLowerCase()}.`;
}

function measurementLabel(coverage: number | null) {
  if (coverage == null) return "Insufficient";
  if (coverage >= 90) return "Reliable";
  if (coverage >= 70) return "Directional";
  if (coverage >= 30) return "Incomplete";
  return "Insufficient";
}

function rateLabel(value: number, total: number, suffix: string) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}% ${suffix}` : "Not enough data";
}

function percent(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—";
}

function formatRevenue(inr: number, usd: number) {
  const parts: string[] = [];
  if (inr) parts.push(new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(inr));
  if (usd) parts.push(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(usd));
  return parts.length ? parts.join(" · ") : "—";
}

function pretty(value: string) {
  return (value || "unknown").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}
