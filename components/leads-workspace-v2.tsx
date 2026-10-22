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
  Clock3,
  Eye,
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
    () =>
      leads
        .map((lead) => ({
          lead,
          intel: intelligenceByLead.get(lead.id) ?? null,
        }))
        .sort(
          (a, b) =>
            sortableCreatedAt(b.lead.createdAt) -
            sortableCreatedAt(a.lead.createdAt),
        ),
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
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
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
    const timer = window.setTimeout(
      () => updateUrl({ q: normalized, page: 1 }),
      350,
    );
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
      <section
        className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-opacity dark:border-slate-800 dark:bg-slate-950 ${
          isPending ? "opacity-70" : "opacity-100"
        }`}
      >
        <div className="border-b border-slate-100 p-4 dark:border-slate-900">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              active={filters.quickView === "all"}
              label="All leads"
              value={summary.all}
              detail="Newest first"
              icon={<Sparkles size={15} />}
              tone="violet"
              onClick={() => updateUrl({ view: null, page: 1 })}
            />
            <SummaryCard
              active={filters.quickView === "unassigned"}
              label="Unassigned"
              value={summary.unassigned}
              detail="Need an owner"
              icon={<UserRoundX size={15} />}
              tone="amber"
              onClick={() => updateUrl({ view: "unassigned", page: 1 })}
            />
            <SummaryCard
              active={filters.quickView === "stuck"}
              label="Stuck"
              value={summary.stuck}
              detail="Needs review"
              icon={<AlertTriangle size={15} />}
              tone="rose"
              onClick={() => updateUrl({ view: "stuck", page: 1 })}
            />
            <SummaryCard
              active={filters.quickView === "followup_overdue"}
              label="Overdue"
              value={summary.followupOverdue}
              detail="Follow-up missed"
              icon={<CalendarClock size={15} />}
              tone="rose"
              onClick={() => updateUrl({ view: "followup_overdue", page: 1 })}
            />
            <SummaryCard
              active={filters.quickView === "payment_pending"}
              label="Payment"
              value={summary.paymentPending}
              detail="Decision stage"
              icon={<CircleDollarSign size={15} />}
              tone="emerald"
              onClick={() => updateUrl({ view: "payment_pending", page: 1 })}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 xl:flex-row xl:items-center">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 text-slate-400"
              />
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search name, course, source, country, campaign…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:bg-slate-950 dark:focus:ring-violet-950/20"
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
                className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-[10px] font-black transition ${
                  showFilters || filtersActive
                    ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200"
                    : "border-slate-200 bg-white text-slate-500 hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                }`}
              >
                <Filter size={13} /> Filters
              </button>
            </div>
          </div>

          {showFilters ? (
            <div className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4 dark:border-slate-800 dark:bg-slate-900/60">
              <FilterSelect
                label="Channel"
                value={filters.channel || "all"}
                options={options.channels}
                onChange={(value) => updateUrl({ channel: value, page: 1 })}
              />
              <FilterSelect
                label="Owner"
                value={filters.owner || "all"}
                options={options.owners}
                onChange={(value) => updateUrl({ owner: value, page: 1 })}
              />
              <FilterSelect
                label="Course"
                value={filters.course || "all"}
                options={options.courses}
                onChange={(value) => updateUrl({ course: value, page: 1 })}
              />
              <FilterSelect
                label="Aging"
                value={filters.aging || "all"}
                options={["healthy", "warning", "stuck", "untracked"]}
                onChange={(value) => updateUrl({ aging: value, page: 1 })}
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={11} />
              {pagination.total > 0
                ? `${pagination.from.toLocaleString("en-IN")}–${pagination.to.toLocaleString("en-IN")} of ${pagination.total.toLocaleString("en-IN")}`
                : "0 leads"}
              {mock ? " · Demo data" : " · Live"}
              {isPending ? " · Updating…" : " · newest lead first"}
            </span>
            {filtersActive ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 font-black text-violet-600 hover:underline dark:text-violet-300"
              >
                <X size={11} /> Reset filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-900">
          {enriched.length ? (
            enriched.map((item, index) => (
              <LeadListRow
                key={item.lead.id}
                item={item}
                now={now}
                newest={index === 0}
                onOpen={() => setSelectedId(item.lead.id)}
              />
            ))
          ) : (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-900">
                <Search size={17} />
              </div>
              <div className="mt-3 text-xs font-black text-slate-600 dark:text-slate-300">
                No leads match this view
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-2 text-[10px] font-black text-violet-600 hover:underline dark:text-violet-300"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-900 dark:bg-slate-900/30">
            <span className="text-[10px] font-bold text-slate-400">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending || pagination.page <= 1}
                onClick={() => updateUrl({ page: pagination.page - 1 })}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              >
                <ArrowLeft size={12} /> Previous
              </button>
              <button
                type="button"
                disabled={isPending || pagination.page >= pagination.totalPages}
                onClick={() => updateUrl({ page: pagination.page + 1 })}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              >
                Next <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selected ? (
        <LeadQuickDrawer
          item={selected}
          now={now}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}

function LeadListRow({
  item,
  now,
  newest,
  onOpen,
}: {
  item: EnrichedLead;
  now: number;
  newest: boolean;
  onOpen: () => void;
}) {
  const { lead, intel } = item;
  const signal = leadSignal(lead, intel, now);
  const createdLabel = relativeCreatedAt(lead.createdAt, now);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative grid w-full gap-3 px-4 py-4 text-left transition hover:bg-gradient-to-r hover:from-violet-50/60 hover:via-white hover:to-white sm:grid-cols-[minmax(190px,1.25fr)_minmax(170px,1fr)_145px_130px_145px_58px] sm:items-center dark:hover:from-violet-950/15 dark:hover:via-slate-950 dark:hover:to-slate-950"
    >
      <span className={`absolute bottom-2 left-0 top-2 w-1 rounded-r-full ${stageAccent(lead.stage)}`} />

      <span className="flex min-w-0 items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[10px] font-black shadow-sm ${avatarTone(lead.currentContactChannel)}`}>
          {leadInitials(lead.name)}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-black text-slate-950 dark:text-white">
              {lead.name || lead.leadCode}
            </span>
            {newest ? (
              <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900">
                Newest
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-[9px] text-slate-400">
            {lead.leadCode} · {lead.country || "Unknown country"}
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-[8px] font-bold text-slate-400">
            <Clock3 size={9} /> {createdLabel}
          </span>
        </span>
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">
          {lead.course || "Course not set"}
        </span>
        <span className="mt-1 block truncate text-[9px] text-slate-400">
          {intel?.batch_code || lead.location || "Batch not set"}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-1.5">
        <StageBadge stage={lead.stage} />
        <IntentLabel intent={lead.intent} />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[10px] font-bold text-slate-600 dark:text-slate-300">
          {pretty(lead.firstTouchSource || "Unknown source")}
        </span>
        <span className="mt-1 block">
          <ChannelBadge channel={lead.currentContactChannel} />
        </span>
      </span>

      <span className="min-w-0">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[0.05em] ${signal.className}`}>
          {signal.icon}
          {signal.label}
        </span>
        <span className="mt-1 block truncate text-[9px] text-slate-400">
          {signal.detail}
        </span>
      </span>

      <span className="hidden items-center justify-end gap-1 text-[9px] font-black text-slate-300 transition group-hover:text-violet-600 sm:flex">
        <Eye size={12} /> Preview
      </span>
    </button>
  );
}

function LeadQuickDrawer({
  item,
  now,
  onClose,
}: {
  item: EnrichedLead;
  now: number;
  onClose: () => void;
}) {
  const { lead, intel } = item;
  const signal = leadSignal(lead, intel, now);
  const age = toNumber(intel?.stage_age_days);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close lead preview"
        className="absolute inset-0 bg-slate-950/25 backdrop-blur-[2px]"
      />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-900 dark:bg-slate-950/95">
          <div className="flex items-start gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xs font-black shadow-sm ${avatarTone(lead.currentContactChannel)}`}>
              {leadInitials(lead.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-black tracking-[-0.03em] text-slate-950 dark:text-white">
                {lead.name || lead.leadCode}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StageBadge stage={lead.stage} />
                <IntentLabel intent={lead.intent} />
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-500 dark:bg-slate-900 dark:text-slate-300">
                  {relativeCreatedAt(lead.createdAt, now)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:rotate-90 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Link
              href={`/leads/${lead.id}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[10px] font-black text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
            >
              Full profile <ArrowRight size={12} />
            </Link>
            <Link
              href={`/conversations?lead=${lead.id}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
            >
              Conversation
            </Link>
            <Link
              href="/follow-ups"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
            >
              Follow-ups
            </Link>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <section className="overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4 shadow-sm dark:border-violet-900/50 dark:from-violet-950/20 dark:via-slate-950 dark:to-sky-950/10">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">
              <Sparkles size={12} /> Recommended next move
            </div>
            <div className="mt-2 text-base font-black tracking-[-0.02em] text-slate-950 dark:text-white">
              {signal.recommendation}
            </div>
            <div className="mt-1 text-[10px] leading-5 text-slate-500">
              {signal.reason}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              Journey snapshot
            </div>
            <div className="mt-4 grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 gap-y-4">
              <TimelineDot active />
              <TimelineItem label="Captured" value={`${pretty(lead.firstTouchSource || "Unknown")} · ${relativeCreatedAt(lead.createdAt, now)}`} />
              <TimelineDot active />
              <TimelineItem label="Current stage" value={pretty(lead.stage)} />
              <TimelineDot active={Boolean(lead.nextFollowupAt)} />
              <TimelineItem label="Next follow-up" value={formatDateTimeLocal(lead.nextFollowupAt)} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <DataPoint label="Lead ID" value={lead.leadCode} />
            <DataPoint label="Owner" value={intel?.owner_name || "Unassigned"} />
            <DataPoint label="Course" value={lead.course || "Not set"} />
            <DataPoint label="Location" value={lead.location || intel?.batch_location || "Not set"} />
            <DataPoint label="First touch" value={lead.firstTouchSource || "Unknown"} />
            <DataPoint label="Channel" value={pretty(lead.currentContactChannel || "Unknown")} />
            <DataPoint label="Stage age" value={age > 0 ? formatAge(age) : "Untracked"} />
            <DataPoint label="Created" value={formatDateTimeLocal(lead.createdAt)} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              Acquisition context
            </div>
            <div className="mt-3 space-y-3">
              <DetailRow
                label="Source / medium"
                value={`${lead.firstTouchSource || "Unknown"}${lead.firstTouchMedium ? ` / ${lead.firstTouchMedium}` : ""}`}
              />
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

function SummaryCard({
  active,
  label,
  value,
  detail,
  icon,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone: "violet" | "amber" | "rose" | "emerald";
  onClick: () => void;
}) {
  const tones = {
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
        active
          ? "border-violet-200 bg-violet-50/40 ring-2 ring-violet-100 dark:border-violet-900 dark:bg-violet-950/20 dark:ring-violet-950/40"
          : "border-slate-100 bg-slate-50/70 hover:border-slate-200 hover:bg-white dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900"
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">{label}</span>
        <span className="mt-0.5 block text-lg font-black leading-none text-slate-950 dark:text-white">{value.toLocaleString("en-IN")}</span>
        <span className="mt-1 block truncate text-[8px] font-bold text-slate-400">{detail}</span>
      </span>
    </button>
  );
}

function leadSignal(
  lead: LeadOverview,
  intel: LeadListIntelligence | null,
  now: number,
) {
  const overdue = isOverdue(lead.nextFollowupAt, now);
  if (lead.stage === "payment_pending")
    return {
      label: "Payment",
      detail: "Decision stage",
      recommendation: "Follow the pending payment",
      reason:
        "This lead is already at payment pending, so the next useful action is payment resolution — not more nurturing.",
      className:
        "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
      icon: <CircleDollarSign size={9} />,
    };
  if (overdue)
    return {
      label: "Overdue",
      detail: formatDateTimeLocal(lead.nextFollowupAt),
      recommendation: "Complete the overdue follow-up",
      reason:
        "A scheduled follow-up is already past due. This is an operational priority, not a predictive score.",
      className:
        "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
      icon: <CalendarClock size={9} />,
    };
  if (intel?.aging_status === "stuck")
    return {
      label: "Stuck",
      detail: `${formatAge(toNumber(intel.stage_age_days))} in stage`,
      recommendation: "Review why this lead is stuck",
      reason:
        "The lead has exceeded the configured stage-aging threshold and needs a human decision or next action.",
      className:
        "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
      icon: <AlertTriangle size={9} />,
    };
  if (!intel?.owner_user_id)
    return {
      label: "Owner",
      detail: "Unassigned",
      recommendation: "Assign an owner",
      reason:
        "An active lead without ownership can be missed. Assign responsibility before deeper analysis.",
      className:
        "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
      icon: <UserRoundX size={9} />,
    };
  if (lead.stage === "high_intent")
    return {
      label: "High intent",
      detail: "Active opportunity",
      recommendation: "Move the decision forward",
      reason:
        "The CRM stage is high intent. Use the latest conversation and commercial context to decide the next human action.",
      className:
        "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
      icon: <Flame size={9} />,
    };
  return {
    label: "On track",
    detail: intel?.owner_name || "Active",
    recommendation: "Continue the current sales motion",
    reason:
      "No overdue follow-up, stuck-stage warning, missing owner or payment-pending signal is currently present.",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    icon: <UserRoundCheck size={9} />,
  };
}

function CompactSelect({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <label className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-[10px] font-bold text-slate-600 outline-none transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {pretty(option)}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-[10px] font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
        >
          <option value="all">All</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {pretty(option)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}

function TimelineDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex justify-center">
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ring-4 ${active ? "bg-violet-500 ring-violet-50 dark:ring-violet-950/40" : "bg-slate-300 ring-slate-100 dark:bg-slate-700 dark:ring-slate-900"}`} />
      <span className="absolute bottom-[-18px] top-4 w-px bg-slate-200 last:hidden dark:bg-slate-800" />
    </span>
  );
}

function TimelineItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">{value}</div>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className="mt-1 truncate text-[11px] font-black text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className="max-w-[65%] text-right text-[10px] font-bold text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function stageAccent(stage: string) {
  if (stage === "payment_pending") return "bg-violet-500";
  if (stage === "high_intent") return "bg-orange-500";
  if (stage === "qualified") return "bg-sky-500";
  if (stage === "new") return "bg-cyan-500";
  if (stage === "enrolled") return "bg-emerald-500";
  return "bg-slate-300 dark:bg-slate-700";
}

function avatarTone(channel: string) {
  if (channel === "whatsapp")
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900";
  if (channel === "instagram")
    return "bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-100 dark:bg-fuchsia-950/30 dark:text-fuchsia-300 dark:ring-fuchsia-900";
  if (channel === "email")
    return "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-900";
  return "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800";
}

function isOverdue(value: string | null | undefined, now: number) {
  if (!value || !now) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < now;
}

function sortableCreatedAt(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function relativeCreatedAt(value: string | null | undefined, now: number) {
  if (!value) return "Created date unknown";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Created date unknown";
  if (!now) return formatDateTimeLocal(value);
  const diff = Math.max(0, now - time);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTimeLocal(value);
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatAge(days: number) {
  if (days < 1) return `${Math.max(0, Math.round(days * 24))}h`;
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function leadInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => (Array.from(part)[0] ?? "").toLocaleUpperCase("en-IN"))
    .join("");
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
