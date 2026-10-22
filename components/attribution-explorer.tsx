"use client";

import {
  ArrowRight,
  ChevronDown,
  CircleDollarSign,
  Filter,
  Route,
  Search,
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
type Detail = {
  title: string;
  model: string;
  rows: Array<{ label: string; value: string }>;
} | null;

const MODELS: Array<{ value: AttributionModelName; label: string; short: string }> = [
  { value: "first_touch", label: "First Touch", short: "First" },
  { value: "lead_creation", label: "Lead Creation", short: "Creation" },
  { value: "last_touch", label: "Last Marketing Touch", short: "Last" },
  { value: "current_channel", label: "Current Channel", short: "Current" },
];

export function AttributionExplorer({
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
  const [detail, setDetail] = useState<Detail>(null);

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

  const filteredPerformance = useMemo(() => {
    const text = query.trim().toLowerCase();
    return workspace.performanceRows
      .filter((row) => row.modelName === model)
      .filter((row) => !text || row.value.toLowerCase().includes(text))
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  }, [workspace.performanceRows, model, metric, query]);

  const max = Math.max(1, ...filteredPerformance.map((row) => metricValue(row, metric)));
  const filtersActive =
    Boolean(filters.query) || filters.course !== "all" || filters.location !== "all" || filters.country !== "all" || filters.stage !== "all";

  function setServerFilter(key: "course" | "location" | "country" | "stage", value: string) {
    replaceParams({ [key]: value === "all" ? null : value });
  }

  function applyQuery(value: string) {
    setQuery(value);
    window.clearTimeout((window as Window & { __salsysAttributionTimer?: number }).__salsysAttributionTimer);
    (window as Window & { __salsysAttributionTimer?: number }).__salsysAttributionTimer = window.setTimeout(() => {
      replaceParams({ q: value.trim() || null });
    }, 350);
  }

  function clearFilters() {
    setQuery("");
    replaceParams({ q: null, course: null, location: null, country: null, stage: null });
  }

  return (
    <div className="space-y-4">
      {warning ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {warning}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<UsersRound size={16} />} label="Leads" value={activeMetrics.total.toLocaleString("en-IN")} note={`${activeMetrics.known.toLocaleString("en-IN")} attributed`} />
        <Kpi icon={<Route size={16} />} label="Coverage" value={`${activeMetrics.coverage.toFixed(1)}%`} note={`${activeMetrics.unknown.toLocaleString("en-IN")} unknown`} />
        <Kpi icon={<Target size={16} />} label="Qualified" value={activeMetrics.qualified.toLocaleString("en-IN")} note={activeMetrics.total ? `${((activeMetrics.qualified / activeMetrics.total) * 100).toFixed(1)}% of leads` : "No leads"} />
        <Kpi icon={<CircleDollarSign size={16} />} label="Enrolled" value={activeMetrics.enrolled.toLocaleString("en-IN")} note={activeMetrics.total ? `${((activeMetrics.enrolled / activeMetrics.total) * 100).toFixed(1)}% of leads` : "No leads"} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 p-4 dark:border-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {MODELS.map((item) => {
                const coverage = workspace.metricsByModel.find((row) => row.modelName === item.value)?.coverage ?? 0;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setModel(item.value)}
                    title={item.label}
                    className={`shrink-0 rounded-lg px-3 py-2 text-left transition ${model === item.value ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
                  >
                    <span className="block text-[10px] font-black">{item.short}</span>
                    <span className="mt-0.5 block text-[8px] font-semibold opacity-60">{coverage.toFixed(0)}% known</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <SearchBox value={query} onChange={applyQuery} />
              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-[10px] font-bold transition ${showFilters || filtersActive ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"}`}
              >
                <Filter size={13} /> Filters
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4 dark:bg-slate-900/60">
              <FilterSelect label="Course" value={filters.course} options={workspace.options.courses} onChange={(value) => setServerFilter("course", value)} />
              <FilterSelect label="Location" value={filters.location} options={workspace.options.locations} onChange={(value) => setServerFilter("location", value)} />
              <FilterSelect label="Country" value={filters.country} options={workspace.options.countries} onChange={(value) => setServerFilter("country", value)} />
              <FilterSelect label="Stage" value={filters.stage} options={workspace.options.stages} onChange={(value) => setServerFilter("stage", value)} />
            </div>
          ) : null}

          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-violet-600 hover:underline dark:text-violet-300"><X size={11} /> Reset filters</button>
          ) : null}
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{MODELS.find((item) => item.value === model)?.label}</div>
              <div className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">Click a source/channel to inspect evidence</div>
            </div>
            <MetricSelect value={metric} onChange={setMetric} />
          </div>

          {filteredPerformance.length ? (
            <div className="space-y-1">
              {filteredPerformance.slice(0, 24).map((row) => {
                const value = metricValue(row, metric);
                return (
                  <button
                    key={`${row.modelName}-${row.value}`}
                    type="button"
                    onClick={() => setDetail({
                      title: row.value,
                      model: MODELS.find((item) => item.value === model)?.label ?? model,
                      rows: [
                        { label: "Leads", value: row.leads.toLocaleString("en-IN") },
                        { label: "Qualified", value: row.qualified.toLocaleString("en-IN") },
                        { label: "Enrolled", value: row.enrolled.toLocaleString("en-IN") },
                        { label: "INR revenue", value: formatMoney(row.revenueInr, "INR") },
                        { label: "USD revenue", value: formatMoney(row.revenueUsd, "USD") },
                      ],
                    })}
                    className="group grid w-full grid-cols-[minmax(110px,220px)_1fr_92px_16px] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  >
                    <span className="truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{row.value || "Unknown"}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} /></span>
                    <span className="text-right text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-100">{formatMetric(value, metric)}</span>
                    <ArrowRight size={12} className="text-slate-300 transition group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-xs font-semibold text-slate-400 dark:border-slate-800">No matching attribution evidence.</div>
          )}
        </div>
      </section>

      <ModelComparison workspace={workspace} />
      {detail ? <DetailDrawer detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function ModelComparison({ workspace }: { workspace: AttributionWorkspacePayload }) {
  const max = Math.max(1, ...workspace.comparison.flatMap((row) => [row.firstTouch, row.leadCreation, row.lastTouch, row.currentChannel]));
  if (!workspace.comparison.length) return null;

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Model comparison</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Where attribution changes by model</div></div>
        <span className="text-[10px] font-bold text-slate-400 group-open:hidden">Show</span><span className="hidden text-[10px] font-bold text-slate-400 group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-slate-100 p-4 sm:p-5 dark:border-slate-900">
        <div className="space-y-3">
          {workspace.comparison.slice(0, 14).map((row) => (
            <div key={row.value} className="grid grid-cols-[minmax(100px,180px)_1fr] items-center gap-3">
              <div className="truncate text-[10px] font-black text-slate-600 dark:text-slate-300">{row.value}</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  ["First", row.firstTouch, "bg-violet-500"],
                  ["Create", row.leadCreation, "bg-sky-500"],
                  ["Last", row.lastTouch, "bg-amber-500"],
                  ["Current", row.currentChannel, "bg-emerald-500"],
                ].map(([label, raw, color]) => {
                  const value = Number(raw);
                  return <div key={String(label)} title={`${label}: ${value}`} className="relative h-7 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-900"><span className={`absolute inset-y-0 left-0 ${color}`} style={{ width: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} /><span className="relative z-10 flex h-full items-center px-1.5 text-[8px] font-black text-slate-700 mix-blend-multiply dark:text-slate-200 dark:mix-blend-normal">{label}</span></div>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function Kpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span><span className="text-slate-300">{icon}</span></div><div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{value}</div><div className="mt-1 text-[10px] font-medium text-slate-500">{note}</div></div>;
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="relative block sm:w-56"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search source/channel…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[10px] font-semibold text-slate-700 outline-none focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" /></label>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="mb-1 block text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span><div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-[10px] font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"><option value="all">All</option>{options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" /></div></label>;
}

function MetricSelect({ value, onChange }: { value: Metric; onChange: (value: Metric) => void }) {
  const options: Array<[Metric, string]> = [["leads", "Leads"], ["qualified", "Qualified"], ["enrolled", "Enrolled"], ["revenueInr", "INR revenue"], ["revenueUsd", "USD revenue"]];
  return <label className="relative inline-flex items-center"><select value={value} onChange={(event) => onChange(event.target.value as Metric)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-[10px] font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 text-slate-400" /></label>;
}

function DetailDrawer({ detail, onClose }: { detail: NonNullable<Detail>; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] flex justify-end"><button type="button" onClick={onClose} aria-label="Close attribution detail" className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" /><aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"><div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-900 dark:bg-slate-950/95"><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">{detail.model}</div><div className="mt-1 truncate text-lg font-black tracking-[-0.03em] text-slate-950 dark:text-white">{detail.title}</div></div><button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"><X size={16} /></button></div><div className="grid grid-cols-2 gap-3 p-5">{detail.rows.map((row) => <div key={row.label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{row.label}</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{row.value}</div></div>)}</div></aside></div>;
}

function metricValue(row: AttributionWorkspacePayload["performanceRows"][number], metric: Metric) { return row[metric]; }
function formatMetric(value: number, metric: Metric) { if (metric === "revenueInr") return formatMoney(value, "INR"); if (metric === "revenueUsd") return formatMoney(value, "USD"); return value.toLocaleString("en-IN"); }
function formatMoney(value: number, currency: "INR" | "USD") { return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
function pretty(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
