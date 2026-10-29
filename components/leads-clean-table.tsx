"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Columns3,
  Filter,
  Loader2,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { LeadInspector } from "@/components/crm/lead-inspector";
import { ChannelBadge, EmptyState, IntentLabel, StageBadge } from "@/components/ui";
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

type ColumnKey =
  | "lead"
  | "course"
  | "contact"
  | "source"
  | "stage"
  | "owner"
  | "signals"
  | "created";

const DEFAULT_COLUMNS: ColumnKey[] = [
  "lead",
  "course",
  "contact",
  "stage",
  "owner",
  "signals",
  "created",
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  lead: "Lead",
  course: "Course",
  contact: "Contact",
  source: "Source",
  stage: "Stage",
  owner: "Owner",
  signals: "Signals",
  created: "Created",
};

export function LeadsCleanTable({
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
  const [query, setQuery] = useState(filters.query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showViews, setShowViews] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const intelligenceByLead = useMemo(
    () => new Map(intelligence.map((row) => [row.lead_id, row])),
    [intelligence],
  );

  // Preserve the authoritative server order. The read model already owns the
  // requested sort mode; the browser should not silently replace it.
  const rows = useMemo<EnrichedLead[]>(
    () =>
      leads.map((lead) => ({
        lead,
        intel: intelligenceByLead.get(lead.id) ?? null,
      })),
    [leads, intelligenceByLead],
  );

  const updateUrl = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, rawValue] of Object.entries(updates)) {
        const value = rawValue == null ? "" : String(rawValue).trim();
        const remove =
          !value ||
          value === "all" ||
          (key === "page" && value === "1") ||
          (key === "sort" && value === "stage_age_desc");
        if (remove) next.delete(key);
        else next.set(key, value);
      }

      const nextQuery = next.toString();
      startTransition(() => {
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => setQuery(filters.query), [filters.query]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized === filters.query) return;
    const timer = window.setTimeout(
      () => updateUrl({ q: normalized, page: 1 }),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [filters.query, query, updateUrl]);

  useEffect(() => {
    function handleOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (toolbarRef.current?.contains(target)) return;
      setShowViews(false);
      setShowColumns(false);
    }

    document.addEventListener("pointerdown", handleOutside, true);
    return () => document.removeEventListener("pointerdown", handleOutside, true);
  }, []);

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedRows.has(row.lead.id));

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

  function toggleAll() {
    setSelectedRows((current) => {
      if (allSelected) return new Set();
      return new Set(rows.map((row) => row.lead.id));
    });
  }

  function toggleRow(id: string) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetFilters() {
    setQuery("");
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

  function toggleColumn(column: ColumnKey) {
    if (column === "lead") return;
    setVisibleColumns((current) =>
      current.includes(column)
        ? current.filter((item) => item !== column)
        : [...current, column],
    );
  }

  return (
    <>
      <section
        className={`overflow-hidden rounded-panel border border-line bg-surface shadow-xs transition-opacity ${
          isPending ? "opacity-80" : "opacity-100"
        }`}
      >
        <div ref={toolbarRef} className="border-b border-line px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowViews((value) => !value);
                    setShowColumns(false);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-ui border border-line bg-surface px-3 text-[11px] font-semibold text-copy-muted shadow-sm transition hover:border-line-strong hover:bg-surface-soft hover:text-copy-strong"
                >
                  {quickViewLabel(filters.quickView)}
                  <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] text-copy-muted">
                    {summaryForView(summary, filters.quickView)}
                  </span>
                  <ChevronDown size={13} className="text-copy-subtle" />
                </button>

                {showViews ? (
                  <Popover className="left-0 top-11 w-64">
                    <PopoverLabel>Operational views</PopoverLabel>
                    {([
                      ["all", "All leads", summary.all],
                      ["unassigned", "Unassigned", summary.unassigned],
                      ["stuck", "Stuck", summary.stuck],
                      ["followup_overdue", "Overdue follow-ups", summary.followupOverdue],
                      ["payment_pending", "Payment pending", summary.paymentPending],
                    ] as const).map(([value, label, count]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          updateUrl({ view: value === "all" ? null : value, page: 1 });
                          setShowViews(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-ui px-2.5 py-2 text-left text-xs font-medium text-copy-muted transition hover:bg-surface-soft hover:text-copy-strong"
                      >
                        <span className="flex-1">{label}</span>
                        <span className="text-[10px] text-copy-subtle">{count}</span>
                        {filters.quickView === value ? <Check size={13} /> : null}
                      </button>
                    ))}
                  </Popover>
                ) : null}
              </div>

              <QuickViewButton
                label="Needs action"
                active={filters.quickView === "stuck" || filters.quickView === "followup_overdue"}
                onClick={() => updateUrl({ view: "followup_overdue", page: 1 })}
              />
              <QuickViewButton
                label="Payment"
                active={filters.quickView === "payment_pending"}
                onClick={() => updateUrl({ view: "payment_pending", page: 1 })}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[220px] flex-1 xl:flex-none">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-copy-subtle" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search leads"
                  className="h-9 w-full rounded-ui border border-line bg-surface pl-9 pr-3 text-xs text-copy outline-none transition placeholder:text-copy-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={`inline-flex h-9 items-center gap-2 rounded-ui px-2.5 text-[11px] font-semibold transition ${
                  showFilters || filtersActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-copy-muted hover:bg-surface-soft hover:text-copy-strong"
                }`}
              >
                <Filter size={14} /> Filter
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowColumns((value) => !value);
                    setShowViews(false);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-ui px-2.5 text-[11px] font-semibold text-copy-muted transition hover:bg-surface-soft hover:text-copy-strong"
                >
                  <Columns3 size={14} /> Fields
                </button>
                {showColumns ? (
                  <Popover className="right-0 top-11 w-56">
                    <PopoverLabel>Visible fields</PopoverLabel>
                    {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((column) => (
                      <label key={column} className="flex cursor-pointer items-center gap-2 rounded-ui px-2.5 py-2 text-xs text-copy-muted hover:bg-surface-soft hover:text-copy-strong">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(column)}
                          disabled={column === "lead"}
                          onChange={() => toggleColumn(column)}
                          className="h-3.5 w-3.5 rounded border-line"
                        />
                        {COLUMN_LABELS[column]}
                      </label>
                    ))}
                  </Popover>
                ) : null}
              </div>
            </div>
          </div>

          {showFilters ? (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-ui bg-surface-soft p-3">
              <FilterSelect label="Stage" value={filters.stage || "all"} options={options.stages} onChange={(value) => updateUrl({ stage: value, page: 1 })} />
              <FilterSelect label="Source" value={filters.source || "all"} options={options.sources} onChange={(value) => updateUrl({ source: value, page: 1 })} />
              <FilterSelect label="Channel" value={filters.channel || "all"} options={options.channels} onChange={(value) => updateUrl({ channel: value, page: 1 })} />
              <FilterSelect label="Owner" value={filters.owner || "all"} options={options.owners} onChange={(value) => updateUrl({ owner: value, page: 1 })} />
              <FilterSelect label="Course" value={filters.course || "all"} options={options.courses} onChange={(value) => updateUrl({ course: value, page: 1 })} />
              <FilterSelect label="Aging" value={filters.aging || "all"} options={["healthy", "warning", "stuck", "untracked"]} onChange={(value) => updateUrl({ aging: value, page: 1 })} />
              <label className="min-w-[150px]">
                <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">Sort</span>
                <select
                  value={filters.sort}
                  onChange={(event) => updateUrl({ sort: event.target.value, page: 1 })}
                  className="h-9 w-full rounded-ui border border-line bg-surface px-2.5 text-[11px] font-medium text-copy outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="stage_age_desc">Stage age</option>
                  <option value="followup_asc">Next follow-up</option>
                  <option value="name">Name</option>
                </select>
              </label>
              {filtersActive ? (
                <button type="button" onClick={resetFilters} className="mb-px inline-flex h-9 items-center gap-1.5 rounded-ui px-3 text-xs font-semibold text-copy-muted hover:bg-surface hover:text-brand-700">
                  <X size={13} /> Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isPending ? (
          <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-line bg-surface-soft px-4 py-2 text-[11px] font-semibold text-copy-muted">
            <Loader2 size={13} className="animate-spin text-brand-700" />
            Updating leads…
          </div>
        ) : null}

        {selectedRows.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-soft px-4 py-2.5 text-xs">
            <span className="font-semibold text-copy-strong">{selectedRows.size} selected</span>
            <Link href="/follow-ups" className="rounded-ui px-2.5 py-1.5 font-medium text-copy-muted hover:bg-surface hover:text-copy-strong">Create follow-up</Link>
            <button type="button" onClick={() => setSelectedRows(new Set())} className="ml-auto text-copy-subtle hover:text-brand-700">Clear selection</button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-soft text-left">
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible leads" className="h-3.5 w-3.5 rounded border-line" />
                </th>
                {visibleColumns.includes("lead") ? <HeaderCell>Lead</HeaderCell> : null}
                {visibleColumns.includes("course") ? <HeaderCell>Course</HeaderCell> : null}
                {visibleColumns.includes("contact") ? <HeaderCell>Contact</HeaderCell> : null}
                {visibleColumns.includes("source") ? <HeaderCell>Source</HeaderCell> : null}
                {visibleColumns.includes("stage") ? <HeaderCell>Stage</HeaderCell> : null}
                {visibleColumns.includes("owner") ? <HeaderCell>Owner</HeaderCell> : null}
                {visibleColumns.includes("signals") ? <HeaderCell>Signals</HeaderCell> : null}
                {visibleColumns.includes("created") ? <HeaderCell>Created</HeaderCell> : null}
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>

            <tbody>
              {rows.length ? (
                rows.map(({ lead, intel }) => {
                  const checked = selectedRows.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      tabIndex={0}
                      onClick={() => setSelectedId(lead.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(lead.id);
                        }
                      }}
                      className={`group cursor-pointer border-b border-line transition last:border-b-0 hover:bg-surface-soft focus:bg-surface-soft focus:outline-none ${checked ? "bg-brand-50/70" : ""}`}
                    >
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={checked} onChange={() => toggleRow(lead.id)} aria-label={`Select ${lead.name || lead.leadCode}`} className="h-3.5 w-3.5 rounded border-line" />
                      </td>

                      {visibleColumns.includes("lead") ? (
                        <td className="px-3 py-3">
                          <div className="flex min-w-[190px] items-center gap-3">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${avatarTone(lead.currentContactChannel)}`}>{initials(lead.name || lead.leadCode)}</span>
                            <div className="min-w-0">
                              <div className="max-w-[220px] truncate text-[12px] font-semibold text-copy-strong">{lead.name || lead.leadCode}</div>
                              <div className="mt-0.5 truncate text-[10px] text-copy-subtle">{lead.leadCode}{lead.country ? ` · ${lead.country}` : ""}</div>
                            </div>
                          </div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("course") ? (
                        <td className="px-3 py-3">
                          <div className="max-w-[220px] truncate text-[12px] font-medium text-copy">{lead.course || "—"}</div>
                          <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-copy-subtle">{intel?.batch_code || lead.location || "Not selected"}</div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("contact") ? (
                        <td className="px-3 py-3">
                          <div className="max-w-[220px] truncate text-[11px] text-copy">{lead.email || lead.phone || "—"}</div>
                          <div className="mt-1"><ChannelBadge channel={lead.currentContactChannel} /></div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("source") ? (
                        <td className="px-3 py-3">
                          <div className="max-w-[160px] truncate text-[11px] font-medium text-copy">{pretty(lead.firstTouchSource || "Unknown")}</div>
                          <div className="mt-0.5 max-w-[160px] truncate text-[10px] text-copy-subtle">{lead.firstTouchCampaign || lead.firstTouchMedium || "—"}</div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("stage") ? (
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1.5"><StageBadge stage={lead.stage} /><IntentLabel intent={lead.intent} /></div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("owner") ? (
                        <td className="px-3 py-3">
                          <div className="text-[11px] font-medium text-copy">{intel?.owner_name || lead.owner || "Unassigned"}</div>
                          <div className="mt-0.5 text-[10px] text-copy-subtle">{nextAction(lead, intel)}</div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("signals") ? (
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <AgingPill status={intel?.aging_status} />
                            {isOverdue(lead.nextFollowupAt) ? <SignalPill tone="attention">Follow-up overdue</SignalPill> : null}
                            {lead.stage === "payment_pending" ? <SignalPill tone="money">Payment</SignalPill> : null}
                            {!intel?.owner_name && !lead.owner ? <SignalPill tone="neutral">Unassigned</SignalPill> : null}
                          </div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("created") ? (
                        <td className="px-3 py-3">
                          <div className="whitespace-nowrap text-[11px] font-medium text-copy">{relativeDate(lead.createdAt)}</div>
                          <div className="mt-0.5 whitespace-nowrap text-[10px] text-copy-subtle">{formatDate(lead.createdAt)}</div>
                        </td>
                      ) : null}

                      <td className="px-2 py-3 text-right">
                        <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(lead.id); }} aria-label={`Inspect ${lead.name || lead.leadCode}`} className="grid h-8 w-8 place-items-center rounded-ui text-copy-subtle opacity-0 transition hover:bg-surface hover:text-brand-700 group-hover:opacity-100 group-focus:opacity-100">
                          <MoreHorizontal size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="px-6 py-10">
                    <EmptyState
                      compact
                      title="No leads match this view"
                      description="Try adjusting your search or filters to see more leads."
                      action={filtersActive ? (
                        <button type="button" onClick={resetFilters} className="btn-secondary">
                          Clear filters
                        </button>
                      ) : undefined}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div className="text-[11px] text-copy-subtle">
            {pagination.total > 0 ? `${pagination.from}–${pagination.to} of ${pagination.total}` : "0 leads"}
            {mock ? " · Demo" : " · Live"} · {sortLabel(filters.sort)}
          </div>
          {pagination.totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled={isPending || pagination.page <= 1} onClick={() => updateUrl({ page: pagination.page - 1 })} className="inline-flex h-8 items-center gap-1 rounded-ui border border-line bg-surface px-2.5 text-[11px] font-medium text-copy-muted transition hover:bg-surface-soft hover:text-copy-strong disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft size={12} /> Previous</button>
              <span className="text-[10px] text-copy-subtle">{pagination.page} / {pagination.totalPages}</span>
              <button type="button" disabled={isPending || pagination.page >= pagination.totalPages} onClick={() => updateUrl({ page: pagination.page + 1 })} className="inline-flex h-8 items-center gap-1 rounded-ui border border-line bg-surface px-2.5 text-[11px] font-medium text-copy-muted transition hover:bg-surface-soft hover:text-copy-strong disabled:cursor-not-allowed disabled:opacity-40">Next <ArrowRight size={12} /></button>
            </div>
          ) : null}
        </div>
      </section>

      <LeadInspector leadId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2.5 text-[10px] font-medium text-copy-subtle">{children}</th>;
}

function Popover({ children, className }: { children: ReactNode; className: string }) {
  return <div className={`absolute z-50 rounded-ui border border-line bg-surface p-1.5 shadow-panel ${className}`}>{children}</div>;
}

function PopoverLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-copy-subtle">{children}</div>;
}

function QuickViewButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`h-9 rounded-ui px-3 text-[11px] font-semibold transition ${active ? "bg-brand-50 text-brand-700" : "text-copy-muted hover:bg-surface-soft hover:text-copy-strong"}`}>{label}</button>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="min-w-[145px]">
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-copy-subtle">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-ui border border-line bg-surface px-2.5 text-[11px] font-medium text-copy outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}
      </select>
    </label>
  );
}

function AgingPill({ status }: { status: LeadListIntelligence["aging_status"] | undefined }) {
  if (!status || status === "untracked") return <SignalPill tone="neutral">Untracked</SignalPill>;
  if (status === "stuck") return <SignalPill tone="attention">Stuck</SignalPill>;
  if (status === "warning") return <SignalPill tone="warning">Aging</SignalPill>;
  return <SignalPill tone="healthy">Healthy</SignalPill>;
}

function SignalPill({ children, tone }: { children: ReactNode; tone: "attention" | "warning" | "money" | "neutral" | "healthy" }) {
  const className =
    tone === "attention"
      ? "bg-red-50 text-red-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "money"
          ? "bg-violet-50 text-violet-700"
          : tone === "healthy"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${className}`}>{children}</span>;
}

function quickViewLabel(view: LeadsWorkspaceFilters["quickView"]) {
  if (view === "unassigned") return "Unassigned";
  if (view === "stuck") return "Stuck";
  if (view === "followup_overdue") return "Overdue";
  if (view === "payment_pending") return "Payment pending";
  return "All leads";
}

function summaryForView(summary: LeadsWorkspaceSummary, view: LeadsWorkspaceFilters["quickView"]) {
  if (view === "unassigned") return summary.unassigned;
  if (view === "stuck") return summary.stuck;
  if (view === "followup_overdue") return summary.followupOverdue;
  if (view === "payment_pending") return summary.paymentPending;
  return summary.all;
}

function sortLabel(sort: LeadsWorkspaceFilters["sort"]) {
  if (sort === "followup_asc") return "next follow-up first";
  if (sort === "name") return "name order";
  return "highest stage age first";
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "L";
}

function avatarTone(channel: LeadOverview["currentContactChannel"]) {
  if (channel === "whatsapp") return "bg-emerald-100 text-emerald-700";
  if (channel === "instagram") return "bg-fuchsia-100 text-fuchsia-700";
  if (channel === "email") return "bg-sky-100 text-sky-700";
  if (channel === "phone") return "bg-amber-100 text-amber-700";
  return "bg-violet-100 text-violet-700";
}

function nextAction(lead: LeadOverview, intel: LeadListIntelligence | null) {
  const followup = lead.nextFollowupAt ? Date.parse(lead.nextFollowupAt) : Number.NaN;
  if (Number.isFinite(followup) && followup < Date.now()) return "Follow-up overdue";
  if (lead.stage === "payment_pending") return "Follow payment";
  if (!intel?.owner_name && !lead.owner) return "Assign owner";
  if (intel?.aging_status === "stuck") return "Review stalled lead";
  if (lead.stage === "new") return "Make first contact";
  if (lead.stage === "qualified" || lead.stage === "high_intent") return "Move toward enrollment";
  return "Continue conversation";
}

function isOverdue(value?: string) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function pretty(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function relativeDate(value: string) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "—";
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(timestamp));
}

function formatDate(value: string) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(timestamp));
}