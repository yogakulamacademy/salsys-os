"use client";

import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  Filter,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  AttributionModelName,
  AttributionWorkspaceFilters,
  AttributionWorkspacePayload,
} from "@/components/attribution-workspace";

type Metric = "leads" | "qualified" | "enrolled" | "revenueInr" | "revenueUsd";

type CoverageState = {
  label: "Reliable" | "Directional" | "Incomplete" | "Insufficient";
  note: string;
  tone: "green" | "sky" | "amber" | "slate";
};

const MODELS: Array<{ value: AttributionModelName; label: string; short: string; description: string }> = [
  { value: "first_touch", label: "First Touch", short: "First", description: "The source that originally acquired the lead." },
  { value: "lead_creation", label: "Lead Creation", short: "Creation", description: "The channel where the CRM lead was created." },
  { value: "last_touch", label: "Last Marketing Touch", short: "Last", description: "The most recent recorded marketing source before the current CRM state." },
  { value: "current_channel", label: "Current Channel", short: "Current", description: "Where the team is communicating with the lead now." },
];

export function AttributionIntelligenceExplorer({
  workspace,
  filters,
  warning,
}: {
  workspace: AttributionWorkspacePayload;
  filters: AttributionWorkspaceFilters;
  warning: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [model, setModel] = useState<AttributionModelName>("first_touch");
  const [metric, setMetric] = useState<Metric>("leads");
  const [query, setQuery] = useState(filters.query);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const replaceParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (!value || value === "all") params.delete(key);
        else params.set(key, value);
      }
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const activeMetrics = workspace.metricsByModel.find((row) => row.modelName === model) ?? {
    modelName: model,
    total: 0,
    known: 0,
    unknown: 0,
    coverage: 0,
    qualified: 0,
    enrolled: 0,
    revenueInr: 0,
    revenueUsd: 0,
  };

  const activeModel = MODELS.find((item) => item.value === model) ?? MODELS[0];
  const quality = coverageState(activeMetrics.coverage);
  const unknownShare = activeMetrics.total > 0 ? (activeMetrics.unknown / activeMetrics.total) * 100 : 0;

  const filteredPerformance = useMemo(() => {
    const text = query.trim().toLowerCase();
    return workspace.performanceRows
      .filter((row) => row.modelName === model)
      .filter((row) => !text || row.value.toLowerCase().includes(text))
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  }, [workspace.performanceRows, model, metric, query]);

  const selectedRow = selectedSource
    ? workspace.performanceRows.find((row) => row.modelName === model && row.value === selectedSource) ?? null
    : filteredPerformance[0] ?? null;

  const selectedName = selectedRow?.value ?? null;
  const selectedComparison = selectedName ? workspace.comparison.find((row) => row.value === selectedName) ?? null : null;
  const max = Math.max(1, ...filteredPerformance.map((row) => metricValue(row, metric)));
  const filtersActive = Boolean(filters.query) || filters.course !== "all" || filters.location !== "all" || filters.country !== "all" || filters.stage !== "all";

  function applyQuery(value: string) {
    setQuery(value);
    window.clearTimeout((window as Window & { __salsysAttributionIntelligenceTimer?: number }).__salsysAttributionIntelligenceTimer);
    (window as Window & { __salsysAttributionIntelligenceTimer?: number }).__salsysAttributionIntelligenceTimer = window.setTimeout(() => replaceParams({ q: value.trim() || null }), 350);
  }

  function setServerFilter(key: "course" | "location" | "country" | "stage", value: string) {
    replaceParams({ [key]: value === "all" ? null : value });
  }

  function clearFilters() {
    setQuery("");
    replaceParams({ q: null, course: null, location: null, country: null, stage: null });
  }

  return (
    <div className="space-y-4">
      {warning ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          Attribution is using a fallback path. Treat model comparisons as directional until the primary path is healthy. {warning}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">Choose how credit is assigned</div>
            <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-slate-950 dark:text-white">Attribution model</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Switch the model and the source ranking, evidence, confidence, and decision context update together.</p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {MODELS.map((item) => {
              const metrics = workspace.metricsByModel.find((row) => row.modelName === item.value);
              return (
                <button key={item.value} type="button" onClick={() => { setModel(item.value); setSelectedSource(null); }} className={`shrink-0 rounded-lg px-3 py-2 text-left transition ${model === item.value ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}>
                  <span className="block text-[10px] font-black">{item.short}</span>
                  <span className="mt-0.5 block text-[8px] font-semibold opacity-60">{(metrics?.coverage ?? 0).toFixed(0)}% known</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900/55"><div className="text-xs font-black text-slate-800 dark:text-slate-100">{activeModel.label}</div><div className="mt-1 text-[11px] leading-5 text-slate-500">{activeModel.description}</div></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<UsersRound size={16} />} label="Leads in model" value={activeMetrics.total.toLocaleString("en-IN")} note={`${activeMetrics.known.toLocaleString("en-IN")} with known credit`} />
        <Kpi icon={<ShieldCheck size={16} />} label="Attribution coverage" value={`${activeMetrics.coverage.toFixed(1)}%`} note={`${quality.label} · ${activeMetrics.unknown.toLocaleString("en-IN")} unknown`} />
        <Kpi icon={<Target size={16} />} label="Qualified leads" value={activeMetrics.qualified.toLocaleString("en-IN")} note={activeMetrics.total ? `${((activeMetrics.qualified / activeMetrics.total) * 100).toFixed(1)}% of leads` : "Not enough data"} />
        <Kpi icon={<CircleDollarSign size={16} />} label="Enrollments" value={activeMetrics.enrolled.toLocaleString("en-IN")} note={activeMetrics.total ? `${((activeMetrics.enrolled / activeMetrics.total) * 100).toFixed(1)}% of leads` : "Not enough data"} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 p-4 dark:border-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Source distribution</div>
              <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Select a source to inspect the evidence behind its credit</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1 sm:w-[240px] sm:flex-none"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => applyQuery(event.target.value)} placeholder="Search source/channel…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[10px] font-semibold text-slate-700 outline-none focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" /></div>
              <MetricSelect value={metric} onChange={setMetric} />
              <button type="button" onClick={() => setShowFilters((value) => !value)} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-bold ${showFilters || filtersActive ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200" : "border-slate-200 text-slate-500 dark:border-slate-800"}`}><Filter size={13} /> Filters</button>
            </div>
          </div>

          {showFilters ? <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4 dark:bg-slate-900/60"><FilterSelect label="Course" value={filters.course} options={workspace.options.courses} onChange={(value) => setServerFilter("course", value)} /><FilterSelect label="Location" value={filters.location} options={workspace.options.locations} onChange={(value) => setServerFilter("location", value)} /><FilterSelect label="Country" value={filters.country} options={workspace.options.countries} onChange={(value) => setServerFilter("country", value)} /><FilterSelect label="Stage" value={filters.stage} options={workspace.options.stages} onChange={(value) => setServerFilter("stage", value)} /></div> : null}
          {filtersActive ? <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-violet-600 hover:underline dark:text-violet-300"><X size={11} /> Reset filters</button> : null}
        </div>

        <div className="grid min-h-[420px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-4 sm:p-5">
            {filteredPerformance.length ? <div className="space-y-1">{filteredPerformance.slice(0, 24).map((row) => {
              const value = metricValue(row, metric);
              const selected = selectedName === row.value;
              const qualifiedRate = row.leads > 0 ? (row.qualified / row.leads) * 100 : null;
              return <button key={`${row.modelName}-${row.value}`} type="button" onClick={() => setSelectedSource(row.value)} className={`group grid w-full grid-cols-[minmax(110px,210px)_1fr_94px_72px_16px] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition ${selected ? "bg-violet-50 dark:bg-violet-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-900/60"}`}>
                <span className="truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{row.value || "Unknown"}</span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} /></span>
                <span className="text-right text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-100">{formatMetric(value, metric)}</span>
                <span className="text-right text-[9px] font-semibold text-slate-400">{qualifiedRate == null ? "—" : `${qualifiedRate.toFixed(0)}% qual.`}</span>
                <ArrowRight size={12} className="text-slate-300 transition group-hover:translate-x-0.5" />
              </button>;
            })}</div> : <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-xs font-semibold text-slate-400 dark:border-slate-800">No matching attribution evidence.</div>}
          </div>

          <aside className="border-t border-slate-100 bg-slate-50/55 p-4 xl:border-l xl:border-t-0 dark:border-slate-900 dark:bg-slate-900/25">
            {selectedRow ? <SourceEvidence row={selectedRow} comparison={selectedComparison} model={model} /> : <div className="flex h-full min-h-[240px] items-center justify-center text-center"><div><Route size={22} className="mx-auto text-slate-300" /><div className="mt-2 text-xs font-black text-slate-700 dark:text-slate-200">Select a source</div><div className="mt-1 max-w-[240px] text-[11px] leading-5 text-slate-500">Inspect quality, revenue, cross-model credit, and available evidence.</div></div></div>}
          </aside>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <ModelChangeStory workspace={workspace} selectedSource={selectedName} />
        <AttributionQuality metrics={activeMetrics} quality={quality} unknownShare={unknownShare} />
      </section>
    </div>
  );
}

function SourceEvidence({ row, comparison, model }: { row: AttributionWorkspacePayload["performanceRows"][number]; comparison: AttributionWorkspacePayload["comparison"][number] | null; model: AttributionModelName }) {
  const qualifiedRate = row.leads > 0 ? (row.qualified / row.leads) * 100 : null;
  const enrolledRate = row.leads > 0 ? (row.enrolled / row.leads) * 100 : null;
  const comparisonValues = comparison ? [
    ["First", comparison.firstTouch],
    ["Creation", comparison.leadCreation],
    ["Last", comparison.lastTouch],
    ["Current", comparison.currentChannel],
  ] as const : [];
  const insight = explainModelChange(comparison, row.value);

  return <div>
    <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">Evidence</div><div className="mt-1 text-base font-black text-slate-950 dark:text-white">{row.value || "Unknown"}</div></div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-slate-500 shadow-sm dark:bg-slate-950">{MODELS.find((item) => item.value === model)?.short}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-2"><EvidenceMetric label="Leads" value={row.leads.toLocaleString("en-IN")} /><EvidenceMetric label="Qualified" value={row.qualified.toLocaleString("en-IN")} /><EvidenceMetric label="Qualified rate" value={qualifiedRate == null ? "—" : `${qualifiedRate.toFixed(1)}%`} /><EvidenceMetric label="Enrollment rate" value={enrolledRate == null ? "—" : `${enrolledRate.toFixed(1)}%`} /><EvidenceMetric label="INR revenue" value={formatMoney(row.revenueInr, "INR")} /><EvidenceMetric label="USD revenue" value={formatMoney(row.revenueUsd, "USD")} /></div>
    {comparisonValues.length ? <div className="mt-4"><div className="text-[10px] font-black text-slate-500">Credit across models</div><div className="mt-2 grid grid-cols-4 gap-1.5">{comparisonValues.map(([label, value]) => <div key={label} className="rounded-lg bg-white p-2 text-center dark:bg-slate-950"><div className="text-[8px] font-bold text-slate-400">{label}</div><div className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">{value}</div></div>)}</div></div> : null}
    <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-3 dark:border-violet-900/40 dark:bg-violet-950/15"><div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-violet-600 dark:text-violet-300"><Sparkles size={11} /> Why this changes</div><p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{insight}</p></div>
    <div className="mt-4 grid grid-cols-2 gap-2"><Link href={`/leads?q=${encodeURIComponent(row.value)}`} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 dark:border-slate-800 dark:text-slate-200">Matching leads</Link><Link href="/campaigns" className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-950 text-[10px] font-bold text-white dark:bg-white dark:text-slate-950">Campaigns</Link></div>
  </div>;
}

function ModelChangeStory({ workspace, selectedSource }: { workspace: AttributionWorkspacePayload; selectedSource: string | null }) {
  const rows = useMemo(() => {
    const sorted = [...workspace.comparison].sort((a, b) => spread(b) - spread(a));
    if (selectedSource) {
      const selected = sorted.find((row) => row.value === selectedSource);
      return selected ? [selected, ...sorted.filter((row) => row.value !== selectedSource).slice(0, 4)] : sorted.slice(0, 5);
    }
    return sorted.slice(0, 5);
  }, [selectedSource, workspace.comparison]);

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Model comparison</div><h3 className="mt-1 text-sm font-black text-slate-950 dark:text-white">How source credit changes across attribution models</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">Large differences show where a source plays a different acquisition, creation, marketing, or communication role.</p><div className="mt-4 space-y-2">{rows.length ? rows.map((row) => <div key={row.value} className="rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-900"><div className="flex items-center justify-between gap-3"><div className="truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{row.value}</div><div className="text-[9px] font-bold text-slate-400">spread {spread(row)}</div></div><div className="mt-2 grid grid-cols-4 gap-1.5">{[["First", row.firstTouch], ["Creation", row.leadCreation], ["Last", row.lastTouch], ["Current", row.currentChannel]].map(([label, value]) => <div key={String(label)} className="rounded-md bg-slate-50 px-2 py-1.5 text-center dark:bg-slate-900/60"><div className="text-[8px] font-bold text-slate-400">{label}</div><div className="text-[10px] font-black text-slate-700 dark:text-slate-200">{value}</div></div>)}</div></div>) : <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400 dark:border-slate-800">No model comparison data.</div>}</div></section>;
}

function AttributionQuality({ metrics, quality, unknownShare }: { metrics: AttributionWorkspacePayload["metricsByModel"][number]; quality: CoverageState; unknownShare: number }) {
  const action = metrics.total === 0 ? "Not enough evidence is available to support an attribution decision." : metrics.coverage < 70 ? "Reduce unknown attribution before making aggressive source or campaign budget shifts." : metrics.coverage < 90 ? "Use attribution directionally and verify material budget changes with lead-level evidence." : "Coverage is strong enough for normal decision support, while still preserving Unknown where evidence is missing.";
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Attribution quality</div><h3 className="mt-1 text-sm font-black text-slate-950 dark:text-white">Can this model support a decision?</h3></div><CoveragePill state={quality} /></div><div className="mt-4 grid grid-cols-2 gap-2"><EvidenceMetric label="Coverage" value={`${metrics.coverage.toFixed(1)}%`} /><EvidenceMetric label="Unknown share" value={`${unknownShare.toFixed(1)}%`} /><EvidenceMetric label="Known leads" value={metrics.known.toLocaleString("en-IN")} /><EvidenceMetric label="Unknown leads" value={metrics.unknown.toLocaleString("en-IN")} /></div><div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/55"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-violet-600 dark:text-violet-300">Recommended decision posture</div><p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{action}</p></div><p className="mt-3 text-[9px] leading-4 text-slate-400">Reliable / Directional / Incomplete / Insufficient are coverage states based on visible known-vs-unknown attribution, not statistical confidence intervals.</p></section>;
}

function coverageState(coverage: number): CoverageState {
  if (coverage >= 90) return { label: "Reliable", note: "High known-attribution coverage", tone: "green" };
  if (coverage >= 70) return { label: "Directional", note: "Useful with some attribution gaps", tone: "sky" };
  if (coverage >= 40) return { label: "Incomplete", note: "Material attribution gaps remain", tone: "amber" };
  return { label: "Insufficient", note: "Coverage is too low for strong conclusions", tone: "slate" };
}

function CoveragePill({ state }: { state: CoverageState }) {
  const classes = state.tone === "green" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300" : state.tone === "sky" ? "bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-300" : state.tone === "amber" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400";
  return <span title={state.note} className={`rounded-full px-2.5 py-1 text-[9px] font-black ${classes}`}>{state.label}</span>;
}

function explainModelChange(comparison: AttributionWorkspacePayload["comparison"][number] | null, source: string) {
  if (!comparison) return `SalsysOS has evidence for ${source} in the selected model, but no cross-model comparison row is available.`;
  const values = [
    { label: "First Touch", value: comparison.firstTouch, role: "original acquisition" },
    { label: "Lead Creation", value: comparison.leadCreation, role: "CRM creation" },
    { label: "Last Marketing", value: comparison.lastTouch, role: "recent marketing touch" },
    { label: "Current Channel", value: comparison.currentChannel, role: "present communication" },
  ].sort((a, b) => b.value - a.value);
  if (values[0].value === values[values.length - 1].value) return `${source} receives the same visible lead credit across the four models, so its role appears stable in the current evidence.`;
  return `${source} receives the most visible credit in ${values[0].label} (${values[0].value}) and the least in ${values[values.length - 1].label} (${values[values.length - 1].value}). That suggests it appears more often as ${values[0].role} than as ${values[values.length - 1].role} in the available records.`;
}

function spread(row: AttributionWorkspacePayload["comparison"][number]) {
  const values = [row.firstTouch, row.leadCreation, row.lastTouch, row.currentChannel];
  return Math.max(...values) - Math.min(...values);
}

function Kpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span><span className="text-slate-300">{icon}</span></div><div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{value}</div><div className="mt-1 text-[10px] font-medium text-slate-500">{note}</div></div>;
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white p-2.5 dark:bg-slate-950"><div className="text-[8px] font-bold uppercase tracking-[0.06em] text-slate-400">{label}</div><div className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">{value}</div></div>;
}

function MetricSelect({ value, onChange }: { value: Metric; onChange: (value: Metric) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as Metric)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"><option value="leads">Leads</option><option value="qualified">Qualified</option><option value="enrolled">Enrolled</option><option value="revenueInr">INR revenue</option><option value="revenueUsd">USD revenue</option></select>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="mb-1 block text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"><option value="all">All</option>{options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select></label>;
}

function metricValue(row: AttributionWorkspacePayload["performanceRows"][number], metric: Metric) {
  return row[metric];
}

function formatMetric(value: number, metric: Metric) {
  if (metric === "revenueInr") return formatMoney(value, "INR");
  if (metric === "revenueUsd") return formatMoney(value, "USD");
  return value.toLocaleString("en-IN");
}

function formatMoney(value: number, currency: "INR" | "USD") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
}

function pretty(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
