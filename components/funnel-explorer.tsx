"use client";

import {
  ArrowRight,
  ChevronDown,
  Flame,
  Globe2,
  MousePointerClick,
  Route,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

export type FunnelOverview = {
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_visitors: number | string | null;
  high_intent_visitors: number | string | null;
  form_start_visitors: number | string | null;
  form_submit_visitors: number | string | null;
  leads: number | string | null;
  qualified_leads: number | string | null;
  payment_pending_leads: number | string | null;
  paid_leads: number | string | null;
  enrolled_leads: number | string | null;
  session_to_lead_rate: number | string | null;
  lead_to_qualified_rate: number | string | null;
  lead_to_enrollment_rate: number | string | null;
};

export type FunnelDailyRow = {
  date: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_start_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  leads: number | string | null;
  qualified_leads: number | string | null;
  enrolled_leads: number | string | null;
};

export type FunnelSourceRow = {
  source: string;
  medium: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_start_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  linked_leads: number | string | null;
  qualified_linked_leads: number | string | null;
  enrolled_linked_leads: number | string | null;
  session_to_linked_lead_rate: number | string | null;
};

export type FunnelLandingRow = {
  landing_page: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_start_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  linked_leads: number | string | null;
  session_to_linked_lead_rate: number | string | null;
};

export type FunnelCountryRow = {
  country: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  linked_leads: number | string | null;
  session_to_linked_lead_rate: number | string | null;
};

export type FunnelFirstTouchRow = {
  source: string;
  medium: string;
  leads: number | string | null;
  qualified_leads: number | string | null;
  enrolled_leads: number | string | null;
  repeat_visit_leads: number | string | null;
  post_lead_returners: number | string | null;
  reengaged_leads: number | string | null;
  hot_leads: number | string | null;
  avg_visits_to_lead: number | string | null;
  avg_days_to_lead: number | string | null;
  revenue_inr: number | string | null;
  revenue_usd: number | string | null;
};

export type FunnelRepeatSummary = {
  total_leads: number | string | null;
  leads_with_linked_web_activity: number | string | null;
  repeat_visitors_before_lead: number | string | null;
  leads_returned_after_conversion: number | string | null;
  reengaged_leads: number | string | null;
  hot_leads: number | string | null;
  warm_leads: number | string | null;
  cold_leads: number | string | null;
  closed_leads: number | string | null;
  avg_visits_to_lead: number | string | null;
  avg_days_to_lead: number | string | null;
};

type View = "journey" | "sources" | "landing" | "countries" | "returning";
type Metric = "sessions" | "leads" | "qualified" | "enrolled";

type Detail = {
  title: string;
  subtitle: string;
  rows: Array<{ label: string; value: string }>;
} | null;

export function FunnelExplorer({
  overview,
  daily,
  sources,
  landingPages,
  countries,
  firstTouch,
  repeat,
}: {
  overview: FunnelOverview;
  daily: FunnelDailyRow[];
  sources: FunnelSourceRow[];
  landingPages: FunnelLandingRow[];
  countries: FunnelCountryRow[];
  firstTouch: FunnelFirstTouchRow[];
  repeat: FunnelRepeatSummary;
}) {
  const [view, setView] = useState<View>("journey");
  const [metric, setMetric] = useState<Metric>("leads");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Detail>(null);

  const stages = [
    { key: "visitors", label: "Visitors", value: toNumber(overview.visitors), href: null },
    { key: "sessions", label: "Sessions", value: toNumber(overview.sessions), href: null },
    { key: "intent", label: "Intent", value: toNumber(overview.intent_visitors), href: null },
    { key: "submit", label: "Form submit", value: toNumber(overview.form_submit_visitors), href: null },
    { key: "leads", label: "Leads", value: toNumber(overview.leads), href: "/leads" },
    { key: "qualified", label: "Qualified", value: toNumber(overview.qualified_leads), href: "/leads?stage=qualified" },
    { key: "paid", label: "Paid", value: toNumber(overview.paid_leads), href: "/revenue" },
    { key: "enrolled", label: "Enrolled", value: toNumber(overview.enrolled_leads), href: "/leads?stage=enrolled" },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniKpi icon={<Users size={16} />} label="Visitors" value={overview.visitors} note={`${formatNumber(overview.sessions)} sessions`} />
        <MiniKpi icon={<Target size={16} />} label="Leads" value={overview.leads} note={`${formatPercent(overview.session_to_lead_rate)} session → lead`} />
        <MiniKpi icon={<Flame size={16} />} label="Qualified" value={overview.qualified_leads} note={`${formatPercent(overview.lead_to_qualified_rate)} lead → qualified`} />
        <MiniKpi icon={<MousePointerClick size={16} />} label="Enrolled" value={overview.enrolled_leads} note={`${formatPercent(overview.lead_to_enrollment_rate)} lead → enrolled`} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Explore</div>
            <div className="mt-1 text-sm font-black tracking-[-0.02em] text-slate-900 dark:text-white">Conversion journey</div>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            <Tab active={view === "journey"} label="Journey" onClick={() => setView("journey")} />
            <Tab active={view === "sources"} label="Sources" onClick={() => setView("sources")} />
            <Tab active={view === "landing"} label="Landing" onClick={() => setView("landing")} />
            <Tab active={view === "countries"} label="Countries" onClick={() => setView("countries")} />
            <Tab active={view === "returning"} label="Returning" onClick={() => setView("returning")} />
          </div>
        </div>

        {view === "journey" ? (
          <JourneyView stages={stages} daily={daily} onSelect={setDetail} />
        ) : null}
        {view === "sources" ? (
          <RankingView kind="source" rows={sources} metric={metric} onMetric={setMetric} query={query} onQuery={setQuery} onSelect={setDetail} />
        ) : null}
        {view === "landing" ? (
          <RankingView kind="landing" rows={landingPages} metric={metric} onMetric={setMetric} query={query} onQuery={setQuery} onSelect={setDetail} />
        ) : null}
        {view === "countries" ? (
          <RankingView kind="country" rows={countries} metric={metric} onMetric={setMetric} query={query} onQuery={setQuery} onSelect={setDetail} />
        ) : null}
        {view === "returning" ? (
          <ReturningView repeat={repeat} firstTouch={firstTouch} onSelect={setDetail} />
        ) : null}
      </section>

      {detail ? <DetailDrawer detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function JourneyView({ stages, daily, onSelect }: { stages: Array<{ key: string; label: string; value: number; href: string | null }>; daily: FunnelDailyRow[]; onSelect: (detail: Detail) => void }) {
  const [dailyMetric, setDailyMetric] = useState<"sessions" | "leads" | "qualified" | "enrolled">("sessions");
  const max = Math.max(1, ...daily.map((row) => dailyValue(row, dailyMetric)));

  return (
    <div className="p-4 sm:p-5">
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[760px] items-stretch gap-2">
          {stages.map((stage, index) => {
            const previous = index > 0 ? stages[index - 1].value : 0;
            const rate = previous > 0 ? (stage.value / previous) * 100 : null;
            return (
              <div key={stage.key} className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelect({
                    title: stage.label,
                    subtitle: "Observed funnel stage",
                    rows: [
                      { label: "Count", value: stage.value.toLocaleString("en-IN") },
                      { label: "From previous stage", value: rate == null ? "—" : `${rate.toFixed(1)}%` },
                    ],
                  })}
                  className="group min-w-[92px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-left transition hover:border-violet-200 hover:bg-violet-50/40 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-violet-900 dark:hover:bg-violet-950/20"
                >
                  <span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{stage.label}</span>
                  <span className="mt-1 block text-lg font-black tracking-[-0.03em] text-slate-900 dark:text-white">{stage.value.toLocaleString("en-IN")}</span>
                  {rate != null ? <span className="mt-1 block text-[9px] font-semibold text-slate-400">{rate.toFixed(1)}% of previous</span> : null}
                </button>
                {index < stages.length - 1 ? <ArrowRight size={13} className="shrink-0 text-slate-300" /> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Daily movement</div>
          <div className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">Click any day for evidence</div>
        </div>
        <MetricSelect value={dailyMetric} onChange={setDailyMetric} options={[["sessions", "Sessions"], ["leads", "Leads"], ["qualified", "Qualified"], ["enrolled", "Enrolled"]]} />
      </div>

      {daily.length ? (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex h-[180px] min-w-[620px] items-end gap-1.5 border-b border-slate-100 dark:border-slate-900">
            {daily.map((row) => {
              const value = dailyValue(row, dailyMetric);
              return (
                <button
                  key={row.date}
                  type="button"
                  title={`${formatDate(row.date)} · ${value.toLocaleString("en-IN")}`}
                  onClick={() => onSelect({
                    title: formatDate(row.date),
                    subtitle: "Daily funnel evidence",
                    rows: [
                      { label: "Visitors", value: formatNumber(row.visitors) },
                      { label: "Sessions", value: formatNumber(row.sessions) },
                      { label: "Intent sessions", value: formatNumber(row.intent_sessions) },
                      { label: "Form submits", value: formatNumber(row.form_submit_sessions) },
                      { label: "Leads", value: formatNumber(row.leads) },
                      { label: "Qualified", value: formatNumber(row.qualified_leads) },
                      { label: "Enrolled", value: formatNumber(row.enrolled_leads) },
                    ],
                  })}
                  className="group flex h-full min-w-[12px] flex-1 items-end rounded-t px-[1px] hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <span className="block w-full rounded-t bg-violet-500 transition group-hover:bg-violet-600" style={{ height: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} />
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex min-w-[620px] justify-between text-[9px] font-semibold text-slate-400">
            <span>{daily[0] ? formatShortDate(daily[0].date) : ""}</span>
            <span>{daily.length ? formatShortDate(daily[daily.length - 1].date) : ""}</span>
          </div>
        </div>
      ) : (
        <Empty label="No daily funnel evidence yet" />
      )}
    </div>
  );
}

function RankingView({ kind, rows, metric, onMetric, query, onQuery, onSelect }: { kind: "source" | "landing" | "country"; rows: FunnelSourceRow[] | FunnelLandingRow[] | FunnelCountryRow[]; metric: Metric; onMetric: (metric: Metric) => void; query: string; onQuery: (query: string) => void; onSelect: (detail: Detail) => void }) {
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return [...rows]
      .filter((row) => !text || rowLabel(row, kind).toLowerCase().includes(text))
      .sort((a, b) => rankingValue(b, metric) - rankingValue(a, metric));
  }, [rows, query, kind, metric]);
  const max = Math.max(1, ...filtered.map((row) => rankingValue(row, metric)));

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <MetricSelect value={metric} onChange={onMetric} options={[["sessions", "Sessions"], ["leads", "Leads"], ["qualified", "Qualified"], ["enrolled", "Enrolled"]]} />
        <label className="relative block sm:w-56">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={`Filter ${kind}…`} className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[10px] font-semibold text-slate-700 outline-none focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" />
        </label>
      </div>

      {filtered.length ? (
        <div className="space-y-1">
          {filtered.slice(0, 20).map((row, index) => {
            const value = rankingValue(row, metric);
            const label = rowLabel(row, kind);
            const sub = kind === "source" ? (row as FunnelSourceRow).medium : kind === "landing" ? "Landing page" : "Country";
            return (
              <button
                key={`${kind}-${label}-${index}`}
                type="button"
                onClick={() => onSelect(rankingDetail(row, kind))}
                className="group grid w-full grid-cols-[minmax(110px,220px)_1fr_72px_16px] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{label || "Unknown"}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-slate-400">{sub || "—"}</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                  <span className="block h-full rounded-full bg-sky-500" style={{ width: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} />
                </span>
                <span className="text-right text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-100">{value.toLocaleString("en-IN")}</span>
                <ArrowRight size={12} className="text-slate-300 transition group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      ) : <Empty label="No matching funnel evidence" />}
    </div>
  );
}

function ReturningView({ repeat, firstTouch, onSelect }: { repeat: FunnelRepeatSummary; firstTouch: FunnelFirstTouchRow[]; onSelect: (detail: Detail) => void }) {
  const max = Math.max(1, ...firstTouch.map((row) => toNumber(row.reengaged_leads)));
  return (
    <div className="p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CompactKpi label="Re-engaged" value={repeat.reengaged_leads} />
        <CompactKpi label="Hot leads" value={repeat.hot_leads} />
        <CompactKpi label="Returned after lead" value={repeat.leads_returned_after_conversion} />
        <CompactKpi label="Avg visits to lead" value={repeat.avg_visits_to_lead} decimals={1} />
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Re-engagement by first touch</div>
        <div className="mt-3 space-y-1">
          {firstTouch.slice(0, 12).map((row, index) => {
            const value = toNumber(row.reengaged_leads);
            return (
              <button
                key={`${row.source}-${row.medium}-${index}`}
                type="button"
                onClick={() => onSelect({
                  title: row.source || "Unknown source",
                  subtitle: row.medium || "Unknown medium",
                  rows: [
                    { label: "Leads", value: formatNumber(row.leads) },
                    { label: "Qualified", value: formatNumber(row.qualified_leads) },
                    { label: "Enrolled", value: formatNumber(row.enrolled_leads) },
                    { label: "Re-engaged", value: formatNumber(row.reengaged_leads) },
                    { label: "Hot", value: formatNumber(row.hot_leads) },
                    { label: "Avg visits → lead", value: toNumber(row.avg_visits_to_lead).toFixed(1) },
                    { label: "INR revenue", value: formatMoney(row.revenue_inr, "INR") },
                    { label: "USD revenue", value: formatMoney(row.revenue_usd, "USD") },
                  ],
                })}
                className="group grid w-full grid-cols-[minmax(120px,220px)_1fr_70px_16px] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <span className="min-w-0"><span className="block truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{row.source || "Unknown"}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">{row.medium || "—"}</span></span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900"><span className="block h-full rounded-full bg-orange-500" style={{ width: `${value ? Math.max(3, (value / max) * 100) : 0}%` }} /></span>
                <span className="text-right text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-100">{value.toLocaleString("en-IN")}</span>
                <ArrowRight size={12} className="text-slate-300 transition group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DetailDrawer({ detail, onClose }: { detail: NonNullable<Detail>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button type="button" onClick={onClose} aria-label="Close funnel detail" className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" />
      <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-900 dark:bg-slate-950/95">
          <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">Funnel evidence</div><div className="mt-1 truncate text-lg font-black tracking-[-0.03em] text-slate-950 dark:text-white">{detail.title}</div><div className="mt-1 text-[11px] text-slate-500">{detail.subtitle}</div></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          {detail.rows.map((row) => <div key={row.label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{row.label}</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{row.value}</div></div>)}
        </div>
      </aside>
    </div>
  );
}

function MiniKpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number | string | null; note: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span><span className="text-slate-300">{icon}</span></div><div className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950 dark:text-white">{formatNumber(value)}</div><div className="mt-1 text-[10px] font-medium text-slate-500">{note}</div></div>;
}

function CompactKpi({ label, value, decimals = 0 }: { label: string; value: number | string | null; decimals?: number }) {
  return <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60"><div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div><div className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900 dark:text-white">{toNumber(value).toLocaleString("en-IN", { maximumFractionDigits: decimals })}</div></div>;
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${active ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}>{label}</button>;
}

function MetricSelect<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<[T, string]> }) {
  return <label className="relative inline-flex items-center"><Route size={13} className="pointer-events-none absolute left-2.5 text-slate-400" /><select value={value} onChange={(event) => onChange(event.target.value as T)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-[10px] font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 text-slate-400" /></label>;
}

function Empty({ label }: { label: string }) {
  return <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-xs font-semibold text-slate-400 dark:border-slate-800">{label}</div>;
}

function rowLabel(row: FunnelSourceRow | FunnelLandingRow | FunnelCountryRow, kind: "source" | "landing" | "country") {
  if (kind === "source") return (row as FunnelSourceRow).source || "Unknown";
  if (kind === "landing") return (row as FunnelLandingRow).landing_page || "Unknown";
  return (row as FunnelCountryRow).country || "Unknown";
}

function rankingValue(row: FunnelSourceRow | FunnelLandingRow | FunnelCountryRow, metric: Metric) {
  if (metric === "sessions") return toNumber(row.sessions);
  if (metric === "leads") return toNumber("linked_leads" in row ? row.linked_leads : 0);
  if (metric === "qualified") return toNumber("qualified_linked_leads" in row ? row.qualified_linked_leads : 0);
  return toNumber("enrolled_linked_leads" in row ? row.enrolled_linked_leads : 0);
}

function rankingDetail(row: FunnelSourceRow | FunnelLandingRow | FunnelCountryRow, kind: "source" | "landing" | "country"): Detail {
  const source = kind === "source" ? (row as FunnelSourceRow) : null;
  const landing = kind === "landing" ? (row as FunnelLandingRow) : null;
  const country = kind === "country" ? (row as FunnelCountryRow) : null;
  return {
    title: source?.source || landing?.landing_page || country?.country || "Unknown",
    subtitle: source?.medium || (landing ? "Landing page" : "Country"),
    rows: [
      { label: "Visitors", value: formatNumber(row.visitors) },
      { label: "Sessions", value: formatNumber(row.sessions) },
      { label: "Page views", value: formatNumber(row.page_views) },
      { label: "Intent sessions", value: formatNumber(row.intent_sessions) },
      { label: "Form submits", value: formatNumber(row.form_submit_sessions) },
      { label: "Linked leads", value: formatNumber("linked_leads" in row ? row.linked_leads : 0) },
      { label: "Session → lead", value: formatPercent(row.session_to_linked_lead_rate) },
    ],
  };
}

function dailyValue(row: FunnelDailyRow, metric: "sessions" | "leads" | "qualified" | "enrolled") {
  if (metric === "sessions") return toNumber(row.sessions);
  if (metric === "leads") return toNumber(row.leads);
  if (metric === "qualified") return toNumber(row.qualified_leads);
  return toNumber(row.enrolled_leads);
}

function toNumber(value: number | string | null | undefined) { const number = Number(value ?? 0); return Number.isFinite(number) ? number : 0; }
function formatNumber(value: number | string | null | undefined) { return toNumber(value).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
function formatPercent(value: number | string | null | undefined) { return `${toNumber(value).toFixed(1)}%`; }
function formatMoney(value: number | string | null | undefined, currency: "INR" | "USD") { return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(toNumber(value)); }
function formatDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
function formatShortDate(value: string) { const date = new Date(`${value.slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date); }
