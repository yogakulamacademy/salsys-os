"use client";

import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Globe2,
  MousePointerClick,
  Route,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  CompactPerformance,
  LandingPerformance,
  ReconciliationRow,
  SourcePerformance,
} from "@/lib/analytics-data";

type Overview = Record<string, number | string | null | undefined>;
type ExplorerView = "trend" | "sources" | "landing" | "campaigns" | "countries";
type TrendMetric = "sessions" | "views" | "leads" | "forms";
type PerformanceMetric = "sessions" | "leads" | "qualified" | "enrolled" | "inrRevenue" | "usdRevenue";

type SelectedDetail = {
  title: string;
  subtitle?: string;
  rows: Array<{ label: string; value: string }>;
} | null;

export function AnalyticsExplorer({
  overview,
  reconciliation,
  sources,
  landing,
  campaigns,
  countries,
}: {
  overview: Overview;
  reconciliation: ReconciliationRow[];
  sources: SourcePerformance[];
  landing: LandingPerformance[];
  campaigns: CompactPerformance[];
  countries: CompactPerformance[];
}) {
  const [view, setView] = useState<ExplorerView>("trend");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("sessions");
  const [performanceMetric, setPerformanceMetric] = useState<PerformanceMetric>("leads");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<SelectedDetail>(null);

  const kpis = [
    {
      label: "Sessions",
      value: formatNumber(overview.ga4_sessions),
      note: `${formatNumber(overview.crm_sessions)} first-party`,
      icon: <Route size={16} />,
    },
    {
      label: "Website leads",
      value: formatNumber(overview.crm_web_leads),
      note: `${formatPercent(overview.website_lead_conversion_rate)} session → lead`,
      icon: <Users size={16} />,
    },
    {
      label: "Qualified",
      value: formatNumber(overview.crm_qualified_leads),
      note: "CRM outcome",
      icon: <Target size={16} />,
    },
    {
      label: "Enrolled",
      value: formatNumber(overview.crm_enrolled_leads),
      note: "CRM outcome",
      icon: <CircleDollarSign size={16} />,
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                {item.label}
              </span>
              <span className="text-slate-300">{item.icon}</span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">
              {item.value}
            </div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">{item.note}</div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Explore</div>
            <div className="mt-1 text-sm font-black tracking-[-0.02em] text-slate-900 dark:text-white">
              Website performance
            </div>
          </div>

          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            <ViewTab active={view === "trend"} label="Trend" onClick={() => setView("trend")} />
            <ViewTab active={view === "sources"} label="Sources" onClick={() => setView("sources")} />
            <ViewTab active={view === "landing"} label="Landing" onClick={() => setView("landing")} />
            <ViewTab active={view === "campaigns"} label="Campaigns" onClick={() => setView("campaigns")} />
            <ViewTab active={view === "countries"} label="Countries" onClick={() => setView("countries")} />
          </div>
        </div>

        {view === "trend" ? (
          <TrendExplorer
            rows={reconciliation}
            metric={trendMetric}
            onMetric={setTrendMetric}
            onSelect={setDetail}
          />
        ) : null}

        {view === "sources" ? (
          <PerformanceExplorer
            kind="source"
            rows={sources}
            metric={performanceMetric}
            onMetric={setPerformanceMetric}
            query={query}
            onQuery={setQuery}
            onSelect={setDetail}
          />
        ) : null}

        {view === "landing" ? (
          <PerformanceExplorer
            kind="landing"
            rows={landing}
            metric={performanceMetric}
            onMetric={setPerformanceMetric}
            query={query}
            onQuery={setQuery}
            onSelect={setDetail}
          />
        ) : null}

        {view === "campaigns" ? (
          <CompactExplorer
            icon={<Target size={15} />}
            rows={campaigns}
            query={query}
            onQuery={setQuery}
            onSelect={setDetail}
          />
        ) : null}

        {view === "countries" ? (
          <CompactExplorer
            icon={<Globe2 size={15} />}
            rows={countries}
            query={query}
            onQuery={setQuery}
            onSelect={setDetail}
          />
        ) : null}
      </section>

      {detail ? <DetailDrawer detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function TrendExplorer({
  rows,
  metric,
  onMetric,
  onSelect,
}: {
  rows: ReconciliationRow[];
  metric: TrendMetric;
  onMetric: (metric: TrendMetric) => void;
  onSelect: (detail: SelectedDetail) => void;
}) {
  const ordered = useMemo(
    () => [...rows].sort((a, b) => a.analytics_date.localeCompare(b.analytics_date)).slice(-30),
    [rows],
  );

  const series = useMemo(() => {
    return ordered.map((row) => {
      if (metric === "views") {
        return {
          row,
          left: toNumber(row.ga4_page_views),
          right: toNumber(row.crm_page_views),
          leftLabel: "GA4 views",
          rightLabel: "CRM views",
        };
      }
      if (metric === "leads") {
        return {
          row,
          left: toNumber(row.crm_web_leads),
          right: 0,
          leftLabel: "CRM leads",
          rightLabel: "",
        };
      }
      if (metric === "forms") {
        return {
          row,
          left: toNumber(row.crm_form_submits),
          right: 0,
          leftLabel: "Form submits",
          rightLabel: "",
        };
      }
      return {
        row,
        left: toNumber(row.ga4_sessions),
        right: toNumber(row.crm_sessions),
        leftLabel: "GA4 sessions",
        rightLabel: "CRM sessions",
      };
    });
  }, [ordered, metric]);

  const max = Math.max(1, ...series.flatMap((point) => [point.left, point.right]));

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <MetricSelect<TrendMetric>
          value={metric}
          onChange={onMetric}
          options={[
            ["sessions", "Sessions"],
            ["views", "Page views"],
            ["leads", "Leads"],
            ["forms", "Form submits"],
          ]}
        />
        <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-400">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-violet-500" />Primary</span>
          {metric === "sessions" || metric === "views" ? (
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-400" />First-party CRM</span>
          ) : null}
        </div>
      </div>

      {series.length ? (
        <div className="overflow-x-auto pb-2">
          <div className="flex h-[260px] min-w-[620px] items-end gap-1.5 border-b border-slate-100 px-1 dark:border-slate-900">
            {series.map((point) => (
              <button
                key={point.row.analytics_date}
                type="button"
                title={`${formatDate(point.row.analytics_date)} · ${point.leftLabel}: ${point.left.toLocaleString("en-IN")}${point.rightLabel ? ` · ${point.rightLabel}: ${point.right.toLocaleString("en-IN")}` : ""}`}
                onClick={() =>
                  onSelect({
                    title: formatDate(point.row.analytics_date),
                    subtitle: "Daily analytics evidence",
                    rows: [
                      { label: "GA4 sessions", value: formatNumber(point.row.ga4_sessions) },
                      { label: "CRM sessions", value: formatNumber(point.row.crm_sessions) },
                      { label: "GA4 page views", value: formatNumber(point.row.ga4_page_views) },
                      { label: "CRM page views", value: formatNumber(point.row.crm_page_views) },
                      { label: "CRM visitors", value: formatNumber(point.row.crm_visitors) },
                      { label: "Form submits", value: formatNumber(point.row.crm_form_submits) },
                      { label: "Website leads", value: formatNumber(point.row.crm_web_leads) },
                    ],
                  })
                }
                className="group flex h-full min-w-[16px] flex-1 items-end justify-center gap-[2px] rounded-t-md px-[1px] transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <span
                  className="w-[45%] min-w-[4px] rounded-t bg-violet-500 transition group-hover:bg-violet-600"
                  style={{ height: `${point.left ? Math.max(3, (point.left / max) * 100) : 0}%` }}
                />
                {point.rightLabel ? (
                  <span
                    className="w-[45%] min-w-[4px] rounded-t bg-sky-400 transition group-hover:bg-sky-500"
                    style={{ height: `${point.right ? Math.max(3, (point.right / max) * 100) : 0}%` }}
                  />
                ) : null}
              </button>
            ))}
          </div>
          <div className="mt-2 flex min-w-[620px] justify-between text-[9px] font-semibold text-slate-400">
            <span>{series[0] ? formatShortDate(series[0].row.analytics_date) : ""}</span>
            <span>{series.at(-1) ? formatShortDate(series.at(-1)!.row.analytics_date) : ""}</span>
          </div>
        </div>
      ) : (
        <EmptyState label="No daily analytics evidence yet" />
      )}

      <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
        <MousePointerClick size={12} /> Hover for exact values. Click a day to inspect its evidence.
      </div>
    </div>
  );
}

function PerformanceExplorer({
  kind,
  rows,
  metric,
  onMetric,
  query,
  onQuery,
  onSelect,
}: {
  kind: "source" | "landing";
  rows: SourcePerformance[] | LandingPerformance[];
  metric: PerformanceMetric;
  onMetric: (metric: PerformanceMetric) => void;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (detail: SelectedDetail) => void;
}) {
  const supportsRevenue = kind === "source";
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const copy = [...rows].filter((row) => {
      const label = kind === "source"
        ? `${(row as SourcePerformance).source} ${(row as SourcePerformance).medium}`
        : (row as LandingPerformance).page;
      return !text || label.toLowerCase().includes(text);
    });

    return copy.sort((a, b) => performanceValue(b, metric) - performanceValue(a, metric));
  }, [rows, query, kind, metric]);

  const max = Math.max(1, ...filtered.map((row) => performanceValue(row, metric)));

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <MetricSelect<PerformanceMetric>
            value={metric}
            onChange={onMetric}
            options={[
              ["sessions", "Sessions"],
              ["leads", "Leads"],
              ["qualified", "Qualified"],
              ["enrolled", "Enrolled"],
              ...(supportsRevenue
                ? ([["inrRevenue", "INR revenue"], ["usdRevenue", "USD revenue"]] as Array<[PerformanceMetric, string]>)
                : []),
            ]}
          />
        </div>
        <SearchBox value={query} onChange={onQuery} placeholder={kind === "source" ? "Filter source…" : "Filter landing page…"} />
      </div>

      {filtered.length ? (
        <div className="space-y-1">
          {filtered.slice(0, 20).map((row) => {
            const source = kind === "source" ? (row as SourcePerformance) : null;
            const landing = kind === "landing" ? (row as LandingPerformance) : null;
            const label = source ? source.source : landing!.page;
            const sub = source ? source.medium : "Landing page";
            const value = performanceValue(row, metric);
            const width = value ? Math.max(3, (value / max) * 100) : 0;

            return (
              <button
                key={source ? source.key : landing!.key}
                type="button"
                onClick={() => onSelect(performanceDetail(row, kind))}
                className="group grid w-full grid-cols-[minmax(110px,220px)_1fr_90px_18px] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{label || "Unknown"}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-slate-400">{sub || "—"}</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                  <span className="block h-full rounded-full bg-violet-500 transition-all group-hover:bg-violet-600" style={{ width: `${width}%` }} />
                </span>
                <span className="text-right text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-100">
                  {formatMetric(value, metric)}
                </span>
                <ArrowRight size={12} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState label="No matching analytics evidence" />
      )}
    </div>
  );
}

function CompactExplorer({
  icon,
  rows,
  query,
  onQuery,
  onSelect,
}: {
  icon: React.ReactNode;
  rows: CompactPerformance[];
  query: string;
  onQuery: (query: string) => void;
  onSelect: (detail: SelectedDetail) => void;
}) {
  const [metric, setMetric] = useState<"sessions" | "leads" | "enrolled">("leads");
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return [...rows]
      .filter((row) => !text || row.name.toLowerCase().includes(text))
      .sort((a, b) => b[metric] - a[metric]);
  }, [rows, query, metric]);
  const max = Math.max(1, ...filtered.map((row) => row[metric]));

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <MetricSelect<"sessions" | "leads" | "enrolled">
          value={metric}
          onChange={setMetric}
          options={[["sessions", "Sessions"], ["leads", "Leads"], ["enrolled", "Enrolled"]]}
        />
        <SearchBox value={query} onChange={onQuery} placeholder="Filter…" />
      </div>
      {filtered.length ? (
        <div className="space-y-1">
          {filtered.map((row) => (
            <button
              key={row.name}
              type="button"
              onClick={() =>
                onSelect({
                  title: row.name,
                  subtitle: "Observed performance",
                  rows: [
                    { label: "Sessions", value: row.sessions.toLocaleString("en-IN") },
                    { label: "Leads", value: row.leads.toLocaleString("en-IN") },
                    { label: "Enrolled", value: row.enrolled.toLocaleString("en-IN") },
                    { label: "Session → lead", value: row.sessions ? `${((row.leads / row.sessions) * 100).toFixed(1)}%` : "—" },
                  ],
                })
              }
              className="group grid w-full grid-cols-[28px_minmax(110px,220px)_1fr_70px_18px] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-900">{icon}</span>
              <span className="truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{row.name}</span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                <span className="block h-full rounded-full bg-sky-500" style={{ width: `${row[metric] ? Math.max(3, (row[metric] / max) * 100) : 0}%` }} />
              </span>
              <span className="text-right text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-100">{row[metric].toLocaleString("en-IN")}</span>
              <ArrowRight size={12} className="text-slate-300 transition group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState label="No matching analytics evidence" />
      )}
    </div>
  );
}

function DetailDrawer({ detail, onClose }: { detail: NonNullable<SelectedDetail>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button type="button" aria-label="Close detail" onClick={onClose} className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" />
      <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-900 dark:bg-slate-950/95">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">Evidence detail</div>
            <div className="mt-1 truncate text-lg font-black tracking-[-0.03em] text-slate-950 dark:text-white">{detail.title}</div>
            {detail.subtitle ? <div className="mt-1 text-[11px] text-slate-500">{detail.subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            {detail.rows.map((row) => (
              <div key={row.label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{row.label}</div>
                <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{row.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-[10px] leading-4 text-slate-500 dark:bg-slate-900/60">
            Values shown here are observed analytics/CRM evidence. Different identity, consent and session definitions can create legitimate GA4 vs first-party differences.
          </div>
        </div>
      </aside>
    </div>
  );
}

function ViewTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${
        active
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
          : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function MetricSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <label className="relative inline-flex items-center">
      <BarChart3 size={14} className="pointer-events-none absolute left-2.5 text-slate-400" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-[10px] font-bold text-slate-700 outline-none hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
      >
        {options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2.5 text-slate-400" />
    </label>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block sm:w-56">
      <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[10px] font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
      />
    </label>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-800">
      <FileText size={20} className="mx-auto text-slate-300" />
      <div className="mt-2 text-xs font-bold text-slate-500">{label}</div>
    </div>
  );
}

function performanceValue(row: SourcePerformance | LandingPerformance, metric: PerformanceMetric) {
  if (metric === "inrRevenue") return "inrRevenue" in row ? row.inrRevenue : 0;
  if (metric === "usdRevenue") return "usdRevenue" in row ? row.usdRevenue : 0;
  if (metric === "qualified") return row.qualified;
  return row[metric];
}

function performanceDetail(row: SourcePerformance | LandingPerformance, kind: "source" | "landing"): SelectedDetail {
  const source = kind === "source" ? (row as SourcePerformance) : null;
  const landing = kind === "landing" ? (row as LandingPerformance) : null;
  const rows = [
    { label: "Sessions", value: row.sessions.toLocaleString("en-IN") },
    { label: "Engaged", value: row.engaged.toLocaleString("en-IN") },
    { label: "Leads", value: row.leads.toLocaleString("en-IN") },
    { label: "Qualified", value: row.qualified.toLocaleString("en-IN") },
    { label: "Enrolled", value: row.enrolled.toLocaleString("en-IN") },
    { label: "Session → lead", value: row.sessions ? `${((row.leads / row.sessions) * 100).toFixed(1)}%` : "—" },
  ];
  if (source) {
    rows.push({ label: "INR revenue", value: formatMoney(source.inrRevenue, "INR") });
    rows.push({ label: "USD revenue", value: formatMoney(source.usdRevenue, "USD") });
  }
  return {
    title: source ? source.source : landing!.page,
    subtitle: source ? source.medium : "Landing page",
    rows,
  };
}

function formatMetric(value: number, metric: PerformanceMetric) {
  if (metric === "inrRevenue") return formatMoney(value, "INR");
  if (metric === "usdRevenue") return formatMoney(value, "USD");
  return value.toLocaleString("en-IN");
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return toNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatPercent(value: number | string | null | undefined) {
  return `${toNumber(value).toFixed(1)}%`;
}

function formatMoney(value: number, currency: "INR" | "USD") {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatShortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}
