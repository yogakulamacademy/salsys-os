"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  Gauge,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  CampaignWorkspaceFilters,
  CampaignWorkspacePagination,
  CampaignWorkspacePlatform,
  CampaignWorkspaceRow,
  CampaignWorkspaceSummary,
} from "@/components/campaigns-workspace";

type ViewMode = "overview" | "quality" | "revenue" | "measurement";
type DecisionTone = "green" | "violet" | "amber" | "rose" | "slate";

type CampaignDecision = {
  label: string;
  reason: string;
  tone: DecisionTone;
};

type MeasurementState = {
  label: "Strong" | "Directional" | "Incomplete" | "Insufficient";
  note: string;
};

const VIEWS: Array<{ value: ViewMode; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "quality", label: "Lead quality" },
  { value: "revenue", label: "Revenue" },
  { value: "measurement", label: "Attribution confidence" },
];

export function CampaignsIntelligenceWorkspace({
  campaigns,
  summary,
  platforms,
  pagination,
  filters,
  mock,
}: {
  campaigns: CampaignWorkspaceRow[];
  summary: CampaignWorkspaceSummary;
  platforms: CampaignWorkspacePlatform[];
  pagination: CampaignWorkspacePagination;
  filters: CampaignWorkspaceFilters;
  mock: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.query);
  const [view, setView] = useState<ViewMode>("overview");
  const [selected, setSelected] = useState<CampaignWorkspaceRow | null>(null);

  useEffect(() => setSearch(filters.query), [filters.query]);

  const replaceParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (!value || (key !== "q" && value === "all")) params.delete(key);
        else params.set(key, value);
      }
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const next = search.trim();
    if (next === filters.query) return;
    const timer = window.setTimeout(() => {
      replaceParams({ q: next || null, page: null });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filters.query, replaceParams, search]);

  const filtersActive = Boolean(filters.query) || filters.platform !== "all" || filters.outcome !== "all";
  const allCampaignCount = platforms.reduce((total, item) => total + item.count, 0);

  const intelligence = useMemo(() => {
    const withDecision = campaigns.map((campaign) => ({
      campaign,
      decision: campaignDecision(campaign),
      measurement: measurementState(campaign),
    }));

    return {
      scale: withDecision.filter((item) => item.decision.label === "Scale candidate"),
      attribution: withDecision.filter((item) => item.decision.label === "Needs attribution"),
      quality: withDecision.filter((item) => item.decision.label === "Investigate quality"),
      strongMeasurement: withDecision.filter((item) => item.measurement.label === "Strong").length,
      incompleteMeasurement: withDecision.filter((item) => item.measurement.label === "Incomplete").length,
    };
  }, [campaigns]);

  const attention = useMemo(() => {
    const items: Array<{ title: string; detail: string; tone: DecisionTone; campaign: CampaignWorkspaceRow }> = [];
    const attribution = intelligence.attribution[0];
    const quality = intelligence.quality[0];
    const scale = intelligence.scale[0];

    if (attribution) {
      items.push({
        title: "CRM linkage needs review",
        detail: `${attribution.campaign.name} has spend/click evidence but no attributed CRM leads.`,
        tone: "amber",
        campaign: attribution.campaign,
      });
    }
    if (quality) {
      items.push({
        title: "Lead quality is weak",
        detail: `${quality.campaign.name} is producing leads without visible qualified outcomes.`,
        tone: "rose",
        campaign: quality.campaign,
      });
    }
    if (scale) {
      items.push({
        title: "Potential scale opportunity",
        detail: `${scale.campaign.name} has downstream enrollment or revenue evidence.`,
        tone: "green",
        campaign: scale.campaign,
      });
    }
    return items.slice(0, 3);
  }, [intelligence]);

  const clear = () => {
    setSearch("");
    replaceParams({ q: null, platform: null, outcome: null, sort: null, page: null });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">What needs attention</div>
            <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-slate-950 dark:text-white">Decisions before more reporting</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Separate business performance from measurement quality before changing budget.</p>
          </div>
          <div className="grid min-w-full grid-cols-2 gap-2 sm:min-w-[420px] sm:grid-cols-4 xl:min-w-[520px]">
            <MiniKpi label="Active campaigns" value={summary.campaigns.toLocaleString("en-IN")} />
            <MiniKpi label="Attributed leads" value={summary.leads.toLocaleString("en-IN")} />
            <MiniKpi label="Qualified leads" value={summary.qualified.toLocaleString("en-IN")} />
            <MiniKpi label="Enrollments" value={summary.enrolled.toLocaleString("en-IN")} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-3">
          {attention.length ? attention.map((item) => (
            <button key={`${item.title}-${item.campaign.id}`} type="button" onClick={() => setSelected(item.campaign)} className="group rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-900/60">
              <div className="flex items-start gap-3">
                <StatusDot tone={item.tone} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-slate-900 dark:text-white">{item.title}</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-500">{item.detail}</div>
                </div>
                <ArrowRight size={14} className="mt-0.5 text-slate-300 transition group-hover:translate-x-0.5" />
              </div>
            </button>
          )) : (
            <div className="lg:col-span-3 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-800">
              No immediate campaign issue is visible from the current CRM-linked evidence.
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 p-4 dark:border-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              {VIEWS.map((item) => (
                <button key={item.value} type="button" onClick={() => setView(item.value)} className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold transition ${view === item.value ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:w-[280px] sm:flex-none">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaign…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium text-slate-700 outline-none focus:border-violet-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" />
              </div>
              <select value={filters.platform} onChange={(event) => replaceParams({ platform: event.target.value === "all" ? null : event.target.value, page: null })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <option value="all">All platforms ({allCampaignCount})</option>
                {platforms.map((item) => <option key={item.platform} value={item.platform}>{item.platform} ({item.count})</option>)}
              </select>
              <select value={filters.outcome} onChange={(event) => replaceParams({ outcome: event.target.value === "all" ? null : event.target.value, page: null })} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <option value="all">All outcomes</option>
                <option value="with_leads">With attributed leads</option>
                <option value="no_leads">No attributed leads</option>
                <option value="qualified">Has qualified leads</option>
                <option value="enrolled">Has enrollments</option>
                <option value="revenue">Has revenue</option>
              </select>
              {filtersActive ? <button type="button" onClick={clear} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"><X size={14} /></button> : null}
            </div>
          </div>
        </div>

        <ViewSummary view={view} campaigns={campaigns} intelligence={intelligence} summary={summary} />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left">
            <thead className="border-y border-slate-100 bg-slate-50/70 dark:border-slate-900 dark:bg-slate-900/35">
              <tr className="text-[10px] font-bold text-slate-400">
                <Header>Campaign</Header>
                <Header>Decision</Header>
                <Header>Spend</Header>
                <Header>Clicks</Header>
                <Header>Leads</Header>
                <Header>Qualified</Header>
                <Header>Enrolled</Header>
                <Header>Revenue</Header>
                <Header>Measurement</Header>
                <Header />
              </tr>
            </thead>
            <tbody>
              {campaigns.length ? campaigns.map((campaign) => {
                const decision = campaignDecision(campaign);
                const measurement = measurementState(campaign);
                return (
                  <tr key={campaign.id} onClick={() => setSelected(campaign)} className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50/70 dark:border-slate-900 dark:hover:bg-slate-900/45">
                    <td className="px-4 py-3.5">
                      <div className="max-w-[280px] truncate text-xs font-black text-slate-900 dark:text-white">{campaign.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{campaign.platform}</span><span>·</span><span className="truncate">{campaign.externalId}</span></div>
                    </td>
                    <td className="px-4 py-3.5"><StatusPill tone={decision.tone}>{decision.label}</StatusPill></td>
                    <td className="px-4 py-3.5 text-xs font-bold text-slate-700 dark:text-slate-200">{formatMoney(campaign.spend, campaign.spendCurrency)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{campaign.clicks.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3.5 text-xs font-bold text-slate-700 dark:text-slate-200">{campaign.leads.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{campaign.qualified.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">{campaign.enrolled.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"><div>{formatMoney(campaign.revenueInr, "INR")}</div><div className="mt-0.5 text-[10px] font-medium text-slate-400">{formatMoney(campaign.revenueUsd, "USD")}</div></td>
                    <td className="px-4 py-3.5"><MeasurementPill state={measurement} /></td>
                    <td className="px-3 py-3.5 text-right"><ArrowRight size={14} className="ml-auto text-slate-300" /></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={10} className="px-5 py-14 text-center text-sm font-semibold text-slate-400">No campaigns match the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400 sm:flex-row sm:items-center sm:justify-between dark:border-slate-900">
          <span>{mock ? "Demo" : "Live"} · deterministic CRM attribution · currencies kept separate</span>
          <div className="flex items-center gap-2">
            {pagination.page > 1 ? <Link href={pageHref(searchParams, pagination.page - 1)} scroll={false} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300">Previous</Link> : null}
            <span>{pagination.total ? `${pagination.from}–${pagination.to} of ${pagination.total}` : "0 campaigns"}</span>
            {pagination.page < pagination.totalPages ? <Link href={pageHref(searchParams, pagination.page + 1)} scroll={false} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300">Next</Link> : null}
          </div>
        </div>
      </section>

      {selected ? <CampaignDrawer campaign={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ViewSummary({ view, campaigns, intelligence, summary }: { view: ViewMode; campaigns: CampaignWorkspaceRow[]; intelligence: { scale: Array<{ campaign: CampaignWorkspaceRow }>; attribution: Array<{ campaign: CampaignWorkspaceRow }>; quality: Array<{ campaign: CampaignWorkspaceRow }>; strongMeasurement: number; incompleteMeasurement: number }; summary: CampaignWorkspaceSummary }) {
  const qualityRate = summary.leads > 0 ? (summary.qualified / summary.leads) * 100 : null;
  const revenueCampaigns = campaigns.filter((campaign) => campaign.revenueInr > 0 || campaign.revenueUsd > 0).length;
  const items = view === "quality"
    ? [
        ["Qualified rate", qualityRate == null ? "—" : `${qualityRate.toFixed(1)}%`, "Attributed leads reaching qualified+"],
        ["Quality reviews", intelligence.quality.length.toLocaleString("en-IN"), "Leads visible without qualified outcomes"],
        ["High intent", campaigns.reduce((sum, item) => sum + item.highIntent, 0).toLocaleString("en-IN"), "High-intent CRM outcomes"],
      ]
    : view === "revenue"
      ? [
          ["Revenue campaigns", revenueCampaigns.toLocaleString("en-IN"), "Campaigns with visible CRM revenue"],
          ["INR attributed", formatMoney(summary.revenueInr, "INR"), "Net paid CRM revenue"],
          ["USD attributed", formatMoney(summary.revenueUsd, "USD"), "Net paid CRM revenue"],
        ]
      : view === "measurement"
        ? [
            ["Strong evidence", intelligence.strongMeasurement.toLocaleString("en-IN"), "CRM linkage with downstream outcomes"],
            ["Incomplete", intelligence.incompleteMeasurement.toLocaleString("en-IN"), "Clicks visible without CRM lead linkage"],
            ["Needs review", intelligence.attribution.length.toLocaleString("en-IN"), "Do not treat zero leads as proven poor performance"],
          ]
        : [
            ["Scale candidates", intelligence.scale.length.toLocaleString("en-IN"), "Campaigns with downstream business evidence"],
            ["Needs attribution", intelligence.attribution.length.toLocaleString("en-IN"), "Spend/clicks without CRM lead linkage"],
            ["Quality reviews", intelligence.quality.length.toLocaleString("en-IN"), "Lead volume without qualified outcomes"],
          ];

  return <div className="grid gap-px bg-slate-100 sm:grid-cols-3 dark:bg-slate-900">{items.map(([label, value, note]) => <div key={label} className="bg-white px-4 py-3 dark:bg-slate-950"><div className="text-[10px] font-bold text-slate-400">{label}</div><div className="mt-1 text-lg font-black text-slate-950 dark:text-white">{value}</div><div className="mt-0.5 text-[10px] text-slate-500">{note}</div></div>)}</div>;
}

function CampaignDrawer({ campaign, onClose }: { campaign: CampaignWorkspaceRow; onClose: () => void }) {
  const decision = campaignDecision(campaign);
  const measurement = measurementState(campaign);
  const qualifiedRate = campaign.leads > 0 ? (campaign.qualified / campaign.leads) * 100 : null;

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <button type="button" onClick={onClose} aria-label="Close campaign details" className="absolute inset-0 bg-slate-950/20" />
      <aside className="relative h-full w-full max-w-[620px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-900 dark:bg-slate-950/95">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"><Target size={18} /></span>
          <div className="min-w-0 flex-1"><div className="truncate text-base font-black text-slate-950 dark:text-white">{campaign.name}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span>{campaign.platform}</span><span>·</span><span>{campaign.externalId}</span></div></div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"><X size={16} /></button>
        </div>
        <div className="space-y-4 p-5">
          <section className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/15">
            <div className="flex items-center gap-2"><Sparkles size={14} className="text-violet-600" /><span className="text-[10px] font-black uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">Decision support</span></div>
            <div className="mt-2 flex items-center gap-2"><StatusPill tone={decision.tone}>{decision.label}</StatusPill><MeasurementPill state={measurement} /></div>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-800 dark:text-slate-100">{decision.reason}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Measurement confidence reflects the CRM-linked evidence visible to SalsysOS. It is not a statistical certainty score.</p>
          </section>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <DrawerMetric label="Spend" value={formatMoney(campaign.spend, campaign.spendCurrency)} icon={<CircleDollarSign size={14} />} />
            <DrawerMetric label="Clicks" value={campaign.clicks.toLocaleString("en-IN")} icon={<BarChart3 size={14} />} />
            <DrawerMetric label="Attributed leads" value={campaign.leads.toLocaleString("en-IN")} icon={<UsersRound size={14} />} />
            <DrawerMetric label="Qualified" value={campaign.qualified.toLocaleString("en-IN")} icon={<Target size={14} />} />
            <DrawerMetric label="Qualified rate" value={qualifiedRate == null ? "—" : `${qualifiedRate.toFixed(1)}%`} icon={<Gauge size={14} />} />
            <DrawerMetric label="Enrollments" value={campaign.enrolled.toLocaleString("en-IN")} icon={<TrendingUp size={14} />} />
          </div>

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="text-xs font-black text-slate-900 dark:text-white">Revenue path</div>
            <div className="mt-3 grid grid-cols-2 gap-3"><DrawerMetric label="INR revenue" value={formatMoney(campaign.revenueInr, "INR")} /><DrawerMetric label="USD revenue" value={formatMoney(campaign.revenueUsd, "USD")} /></div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 dark:border-slate-900"><SmallStat label="CPL" value={formatOptionalMoney(campaign.cpl, campaign.spendCurrency)} /><SmallStat label="CAC" value={formatOptionalMoney(campaign.cac, campaign.spendCurrency)} /><SmallStat label="ROAS" value={campaign.roas == null ? "—" : `${campaign.roas.toFixed(2)}×`} /></div>
          </section>

          <div className="grid grid-cols-2 gap-2"><Link href="/paid-media-leads" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-200">View paid-media leads</Link><Link href="/attribution" className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">Open attribution</Link></div>
        </div>
      </aside>
    </div>
  );
}

function campaignDecision(campaign: CampaignWorkspaceRow): CampaignDecision {
  if (campaign.spend > 0 && campaign.clicks > 0 && campaign.leads === 0) return { label: "Needs attribution", tone: "amber", reason: "Spend and click activity are visible, but no CRM lead linkage is visible. Review attribution capture before treating this as confirmed poor performance." };
  if (campaign.enrolled > 0 || campaign.revenueInr > 0 || campaign.revenueUsd > 0) return { label: "Scale candidate", tone: "green", reason: "This campaign has visible downstream enrollment or revenue evidence. Review marginal efficiency before increasing budget." };
  if (campaign.leads > 0 && campaign.qualified === 0) return { label: "Investigate quality", tone: "rose", reason: "Attributed leads are visible, but no qualified outcomes are currently visible. Review targeting, qualification and lead handling." };
  if (campaign.qualified > 0) return { label: "Working", tone: "violet", reason: "Qualified CRM outcomes are visible. Continue monitoring enrollment and revenue contribution before scaling." };
  return { label: "Monitor", tone: "slate", reason: "There is not enough downstream evidence yet to recommend a budget change." };
}

function measurementState(campaign: CampaignWorkspaceRow): MeasurementState {
  if (campaign.clicks === 0 && campaign.leads === 0) return { label: "Insufficient", note: "Not enough observed activity" };
  if (campaign.clicks > 0 && campaign.leads === 0) return { label: "Incomplete", note: "Paid activity without CRM lead linkage" };
  if (campaign.leads > 0 && campaign.qualified + campaign.enrolled + campaign.paid > 0) return { label: "Strong", note: "CRM linkage reaches downstream outcomes" };
  return { label: "Directional", note: "CRM lead linkage is visible" };
}

function MeasurementPill({ state }: { state: MeasurementState }) {
  const classes = state.label === "Strong" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300" : state.label === "Directional" ? "bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-300" : state.label === "Incomplete" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400";
  return <span title={state.note} className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${classes}`}>{state.label}</span>;
}

function StatusPill({ tone, children }: { tone: DecisionTone; children: React.ReactNode }) {
  const classes = tone === "green" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300" : tone === "violet" ? "bg-violet-50 text-violet-700 dark:bg-violet-950/35 dark:text-violet-300" : tone === "amber" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300" : tone === "rose" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/35 dark:text-rose-300" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${classes}`}>{children}</span>;
}

function StatusDot({ tone }: { tone: DecisionTone }) {
  const classes = tone === "green" ? "bg-emerald-500" : tone === "violet" ? "bg-violet-500" : tone === "amber" ? "bg-amber-500" : tone === "rose" ? "bg-rose-500" : "bg-slate-400";
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${classes}`} />;
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60"><div className="text-[9px] font-bold text-slate-400">{label}</div><div className="mt-1 text-base font-black text-slate-950 dark:text-white">{value}</div></div>;
}

function DrawerMetric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60"><div className="flex items-center justify-between text-[9px] font-bold text-slate-400"><span>{label}</span>{icon ? <span>{icon}</span> : null}</div><div className="mt-1.5 text-sm font-black text-slate-900 dark:text-white">{value}</div></div>;
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px] font-bold text-slate-400">{label}</div><div className="mt-1 text-xs font-black text-slate-800 dark:text-slate-100">{value}</div></div>;
}

function Header({ children }: { children?: React.ReactNode }) {
  return <th className="px-4 py-2.5">{children}</th>;
}

function pageHref(current: ReturnType<typeof useSearchParams>, page: number) {
  const params = new URLSearchParams(current.toString());
  if (page <= 1) params.delete("page"); else params.set("page", String(page));
  const query = params.toString();
  return query ? `/campaigns?${query}` : "/campaigns";
}

function formatMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency || ""} ${Math.round(value).toLocaleString("en-IN")}`.trim();
  }
}

function formatOptionalMoney(value: number | null, currency: string) {
  return value == null ? "—" : formatMoney(value, currency);
}
