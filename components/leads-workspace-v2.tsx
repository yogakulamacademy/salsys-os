"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  Filter,
  Flame,
  Search,
  Sparkles,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { ChannelBadge, IntentLabel, StageBadge } from "@/components/ui";
import type {
  LeadListIntelligence,
  LeadsQuickView,
  LeadsSortMode,
  LeadsWorkspaceFilters,
  LeadsWorkspaceOptions,
  LeadsWorkspacePagination,
  LeadsWorkspaceSummary,
} from "@/lib/leads-data";
import type { LeadOverview } from "@/types/crm";

type EnrichedLead = {
  lead: LeadOverview;
  intel: LeadListIntelligence | null;
};

export function LeadsWorkspaceV2({
  leads,
  intelligence,
  mock,
  filters,
  options,
  summary,
  pagination,
}: {
  leads: LeadOverview[];
  intelligence: LeadListIntelligence[];
  mock: boolean;
  filters: LeadsWorkspaceFilters;
  options: LeadsWorkspaceOptions;
  summary: LeadsWorkspaceSummary;
  pagination: LeadsWorkspacePagination;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [queryInput, setQueryInput] = useState(filters.query);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const intelligenceByLead = useMemo(
    () => new Map(intelligence.map((row) => [row.lead_id, row])),
    [intelligence],
  );

  const enriched = useMemo<EnrichedLead[]>(
    () => leads.map((lead) => ({ lead, intel: intelligenceByLead.get(lead.id) ?? null })),
    [leads, intelligenceByLead],
  );

  const selected = useMemo(
    () => enriched.find((item) => item.lead.id === selectedId) ?? null,
    [enriched, selectedId],
  );

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const updateUrl = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, rawValue] of Object.entries(updates)) {
        const value = rawValue == null ? "" : String(rawValue).trim();
        const remove =
          !value ||
          value === "all" ||
          (key === "sort" && value === "stage_age_desc") ||
          (key === "page" && value === "1");
        if (remove) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setQueryInput(filters.query);
  }, [filters.query]);

  useEffect(() => {
    const normalized = queryInput.trim();
    if (normalized === filters.query) return;
    const timer = window.setTimeout(() => updateUrl({ q: normalized, page: 1 }), 350);
    return () => window.clearTimeout(timer);
  }, [queryInput, filters.query, updateUrl]);

  const filtersActive = Boolean(
    filters.query ||
      filters.stage ||
      filters.source ||
      filters.channel ||
      filters.owner ||
      filters.course ||
      filters.aging ||
      filters.quickView !== "all",
  );

  function resetFilters() {
    setQueryInput("");
    updateUrl({
      q: null,
      stage: null,
      source: null,
      channel: null,
      owner: null,
      course: null,
      aging: null,
      view: null,
      sort: null,
      page: null,
    });
  }

  return (
    <>
      <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-opacity dark:border-slate-800 dark:bg-slate-950 ${isPending ? "opacity-70" : "opacity-100"}`}>
        <div className="border-b border-slate-100 p-4 dark:border-slate-900">
          <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
            <QuickView active={filters.quickView === "all"} label="All" count={summary.all} onClick={() => updateUrl({ view: null, page: 1 })} />
            <QuickView active={filters.quickView === "unassigned"} label="Unassigned" count={summary.unassigned} onClick={() => updateUrl({ view: "unassigned", page: 1 })} icon={<UserRoundX size={12} />} />
            <QuickView active={filters.quickView === "stuck"} label="Stuck" count={summary.stuck} onClick={() => updateUrl({ view: "stuck", page: 1 })} icon={<AlertTriangle size={12} />} />
            <QuickView active={filters.quickView === "followup_overdue"} label="Overdue" count={summary.followupOverdue} onClick={() => updateUrl({ view: "followup_overdue", page: 1 })} icon={<CalendarClock size={12} />} />
            <QuickView active={filters.quickView === "payment_pending"} label="Payment" count={summary.paymentPending} onClick={() => updateUrl({ view: "payment_pending", page: 1 })} icon={<CircleDollarSign size={12} />} />
          </div>

          <div className="mt-3 flex flex-col gap-2 xl:flex-row xl:items-center">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search size={14} className="pointer-events-none absolute left-3 text-slate-400" />
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search leads…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-violet-300 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:bg-slate-950"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <CompactSelect
                value={filters.stage || "all"}
                onChange={(value) => updateUrl({ stage: value, page: 1 })}
                options={options.stages}
                allLabel="All stages"
              />
              <CompactSelect
                value={filters.source || "all"}
                onChange={(value) => updateUrl({ source: value, page: 1 })}
                options={options.sources}
                allLabel="All sources"
              />
              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[10px] font-black transition ${showFilters || filtersActive ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"}`}
              >
                <Filter size={13} /> More
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-5 dark:bg-slate-900/60">
              <FilterSelect label="Channel" value={filters.channel || "all"} options={options.channels} onChange={(value) => updateUrl({ channel: value, page: 1 })} />
              <FilterSelect label="Owner" value={filters.owner || "all"} options={options.owners} onChange={(value) => updateUrl({ owner: value, page: 1 })} />
              <FilterSelect label="Course" value={filters.course || "all"} options={options.courses} onChange={(value) => updateUrl({ course: value, page: 1 })} />
              <FilterSelect label="Aging" value={filters.aging || "all"} options={["healthy", "warning", "stuck", "untracked"]} onChange={(value) => updateUrl({ aging: value, page: 1 })} />
              <label>
                <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Sort</span>
                <div className="relative">
                  <select
                    value={filters.sort}
                    onChange={(event) => updateUrl({ sort: event.target.value as LeadsSortMode, page: 1 })}
                    className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-[10px] font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="stage_age_desc">Oldest in stage</option>
                    <option value="followup_asc">Next follow-up</option>
                    <option value="name">Name A–Z</option>
                  </select>
                  <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
            <span>
              {pagination.total > 0 ? `${pagination.from.toLocaleString("en-IN")}–${pagination.to.toLocaleString("en-IN")} of ${pagination.total.toLocaleString("en-IN")}` : "0 leads"}
              {mock ? " · Demo data" : " · Live"}
              {isPending ? " · Updating…" : ""}
            </span>
            {filtersActive ? <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-black text-violet-600 hover:underline dark:text-violet-300"><X size={11} /> Reset</button> : null}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {enriched.length ? (
            enriched.map((item) => (
              <LeadListRow key={item.lead.id} item={item} now={now} onOpen={() => setSelectedId(item.lead.id)} />
            ))
          ) : (
            <div className="px-5 py-14 text-center">
              <div className="text-xs font-black text-slate-600 dark:text-slate-300">No leads match this view</div>
              <button type="button" onClick={resetFilters} className="mt-2 text-[10px] font-black text-violet-600 hover:underline dark:text-violet-300">Clear filters</button>
            </div>
          )}
        </div>

        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-900 dark:bg-slate-900/30">
            <span className="text-[10px] font-bold text-slate-400">Page {pagination.page} of {pagination.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={isPending || pagination.page <= 1} onClick={() => updateUrl({ page: pagination.page - 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"><ArrowLeft size={12} /> Previous</button>
              <button type="button" disabled={isPending || pagination.page >= pagination.totalPages} onClick={() => updateUrl({ page: pagination.page + 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">Next <ArrowRight size={12} /></button>
            </div>
          </div>
        ) : null}
      </section>

      {selected ? <LeadQuickDrawer item={selected} now={now} onClose={() => setSelectedId(null)} /> : null}
    </>
  );
}

function LeadListRow({ item, now, onOpen }: { item: EnrichedLead; now: number; onOpen: () => void }) {
  const { lead, intel } = item;
  const signal = leadSignal(lead, intel, now);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group grid w-full gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_140px_120px_130px_20px] sm:items-center dark:hover:bg-slate-900/60"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-[10px] font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">{leadInitials(lead.name)}</span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-black text-slate-900 dark:text-white">{lead.name}</span>
          <span className="mt-0.5 block truncate text-[9px] text-slate-400">{lead.leadCode} · {lead.country || "Unknown country"}</span>
        </span>
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">{lead.course || "Course not set"}</span>
        <span className="mt-0.5 block truncate text-[9px] text-slate-400">{intel?.batch_code || lead.location || "Batch not set"}</span>
      </span>

      <span className="flex flex-wrap items-center gap-1.5">
        <StageBadge stage={lead.stage} />
        <IntentLabel intent={lead.intent} />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[10px] font-bold text-slate-600 dark:text-slate-300">{lead.firstTouchSource || "Unknown source"}</span>
        <span className="mt-0.5 block"><ChannelBadge channel={lead.currentContactChannel} /></span>
      </span>

      <span className="min-w-0">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[0.05em] ${signal.className}`}>{signal.icon}{signal.label}</span>
        <span className="mt-1 block truncate text-[9px] text-slate-400">{signal.detail}</span>
      </span>

      <ArrowRight size={13} className="hidden text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500 sm:block" />
    </button>
  );
}

function LeadQuickDrawer({ item, now, onClose }: { item: EnrichedLead; now: number; onClose: () => void }) {
  const { lead, intel } = item;
  const signal = leadSignal(lead, intel, now);
  const age = toNumber(intel?.stage_age_days);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button type="button" onClick={onClose} aria-label="Close lead preview" className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" />
      <aside className="relative h-full w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-900 dark:bg-slate-950/95">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">{leadInitials(lead.name)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-black tracking-[-0.03em] text-slate-950 dark:text-white">{lead.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5"><StageBadge stage={lead.stage} /><IntentLabel intent={lead.intent} /></div>
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"><X size={16} /></button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/leads/${lead.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-[10px] font-black text-white dark:bg-white dark:text-slate-950">Open full profile <ArrowRight size={12} /></Link>
            <Link href="/conversations" className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600 dark:border-slate-800 dark:text-slate-300">Inbox</Link>
            <Link href="/follow-ups" className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600 dark:border-slate-800 dark:text-slate-300">Follow-ups</Link>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <section className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300"><Sparkles size={12} /> Next action</div>
            <div className="mt-2 text-sm font-black text-slate-900 dark:text-white">{signal.recommendation}</div>
            <div className="mt-1 text-[10px] leading-4 text-slate-500">{signal.reason}</div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <DataPoint label="Lead ID" value={lead.leadCode} />
            <DataPoint label="Owner" value={intel?.owner_name || "Unassigned"} />
            <DataPoint label="Course" value={lead.course || "Not set"} />
            <DataPoint label="Location" value={lead.location || intel?.batch_location || "Not set"} />
            <DataPoint label="First touch" value={lead.firstTouchSource || "Unknown"} />
            <DataPoint label="Current channel" value={pretty(lead.currentContactChannel || "Unknown")} />
            <DataPoint label="Stage age" value={age > 0 ? formatAge(age) : "Untracked"} />
            <DataPoint label="Next follow-up" value={formatDateTimeLocal(lead.nextFollowupAt)} />
          </section>

          <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Acquisition</div>
            <div className="mt-3 space-y-2">
              <DetailRow label="Source / medium" value={`${lead.firstTouchSource || "Unknown"}${lead.firstTouchMedium ? ` / ${lead.firstTouchMedium}` : ""}`} />
              <DetailRow label="Campaign" value={lead.firstTouchCampaign || "No campaign"} />
              <DetailRow label="Lead creation" value={pretty(lead.leadCreationChannel || "Unknown")} />
              <DetailRow label="Batch" value={intel?.batch_code || "Not selected"} />
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function leadSignal(lead: LeadOverview, intel: LeadListIntelligence | null, now: number) {
  const overdue = isOverdue(lead.nextFollowupAt, now);
  if (lead.stage === "payment_pending") return { label: "Payment", detail: "Decision stage", recommendation: "Follow the pending payment", reason: "This lead is already at payment pending, so the next useful action is payment resolution—not more nurturing.", className: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300", icon: <CircleDollarSign size={9} /> };
  if (overdue) return { label: "Overdue", detail: formatDateTimeLocal(lead.nextFollowupAt), recommendation: "Complete the overdue follow-up", reason: "A scheduled follow-up is already past due. This is an operational priority, not a predictive score.", className: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300", icon: <CalendarClock size={9} /> };
  if (intel?.aging_status === "stuck") return { label: "Stuck", detail: `${formatAge(toNumber(intel.stage_age_days))} in stage`, recommendation: "Review why this lead is stuck", reason: "The lead has exceeded the configured stage-aging threshold and needs a human decision or next action.", className: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300", icon: <AlertTriangle size={9} /> };
  if (!intel?.owner_user_id) return { label: "Owner", detail: "Unassigned", recommendation: "Assign an owner", reason: "An active lead without ownership can be missed. Assign responsibility before deeper analysis.", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300", icon: <UserRoundX size={9} /> };
  if (lead.stage === "high_intent") return { label: "High intent", detail: "Active opportunity", recommendation: "Move the decision forward", reason: "The CRM stage is high intent. Use the latest conversation and commercial context to decide the next human action.", className: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300", icon: <Flame size={9} /> };
  return { label: "On track", detail: intel?.owner_name || "Active", recommendation: "Continue the current sales motion", reason: "No overdue follow-up, stuck-stage warning, missing owner or payment-pending signal is currently present.", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300", icon: <UserRoundCheck size={9} /> };
}

function QuickView({ active, label, count, onClick, icon }: { active: boolean; label: string; count: number; onClick: () => void; icon?: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-black transition ${active ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "bg-slate-100 text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:hover:text-white"}`}>{icon}{label}<span className={`rounded-full px-1.5 py-0.5 text-[8px] ${active ? "bg-white/15 text-inherit dark:bg-slate-950/10" : "bg-white text-slate-400 dark:bg-slate-950"}`}>{count}</span></button>;
}

function CompactSelect({ value, onChange, options, allLabel }: { value: string; onChange: (value: string) => void; options: string[]; allLabel: string }) {
  return <label className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-[10px] font-bold text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"><option value="all">{allLabel}</option>{options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" /></label>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="mb-1 block text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span><div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-[10px] font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"><option value="all">All</option>{options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" /></div></label>;
}

function DataPoint({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div><div className="mt-1 truncate text-[11px] font-black text-slate-800 dark:text-slate-100">{value}</div></div>; }
function DetailRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><span className="text-[10px] text-slate-400">{label}</span><span className="max-w-[65%] text-right text-[10px] font-bold text-slate-700 dark:text-slate-200">{value}</span></div>; }
function isOverdue(value: string | null | undefined, now: number) { if (!value || !now) return false; const time = new Date(value).getTime(); return Number.isFinite(time) && time < now; }
function formatDateTimeLocal(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); if (Number.isNaN(date.getTime())) return "—"; return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date); }
function formatAge(days: number) { if (days < 1) return `${Math.max(0, Math.round(days * 24))}h`; if (days < 10) return `${days.toFixed(1)}d`; return `${Math.round(days)}d`; }
function toNumber(value: number | string | null | undefined) { const number = Number(value ?? 0); return Number.isFinite(number) ? number : 0; }
function leadInitials(name: string) { const parts = name.trim().split(/\s+/).filter(Boolean); if (!parts.length) return "?"; return parts.slice(0, 2).map((part) => (Array.from(part)[0] ?? "").toLocaleUpperCase("en-IN")).join(""); }
function pretty(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
