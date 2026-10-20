"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Columns3,
  Copy,
  Filter,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

type ColumnKey =
  | "lead"
  | "course"
  | "contact"
  | "source"
  | "stage"
  | "owner"
  | "created";

const DEFAULT_COLUMNS: ColumnKey[] = [
  "lead",
  "course",
  "contact",
  "source",
  "stage",
  "owner",
  "created",
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  lead: "Lead",
  course: "Course",
  contact: "Contact",
  source: "Source",
  stage: "Stage",
  owner: "Owner",
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
  const [showMore, setShowMore] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [copied, setCopied] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const intelligenceByLead = useMemo(
    () => new Map(intelligence.map((row) => [row.lead_id, row])),
    [intelligence],
  );

  const rows = useMemo<EnrichedLead[]>(
    () =>
      leads
        .map((lead) => ({
          lead,
          intel: intelligenceByLead.get(lead.id) ?? null,
        }))
        .sort(
          (a, b) =>
            Date.parse(b.lead.createdAt || "") - Date.parse(a.lead.createdAt || ""),
        ),
    [leads, intelligenceByLead],
  );

  const selectedLead = useMemo(
    () => rows.find((row) => row.lead.id === selectedId) ?? null,
    [rows, selectedId],
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

  useEffect(() => {
    setQuery(filters.query);
  }, [filters.query]);

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
      setShowMore(false);
    }

    document.addEventListener("pointerdown", handleOutside, true);
    return () => document.removeEventListener("pointerdown", handleOutside, true);
  }, []);

  const allSelected = rows.length > 0 && rows.every((row) => selectedRows.has(row.lead.id));

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

  async function shareView() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
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
        className={`overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-opacity dark:border-slate-800 dark:bg-slate-950 ${
          isPending ? "opacity-70" : "opacity-100"
        }`}
      >
        <div ref={toolbarRef} className="border-b border-slate-100 px-4 py-3 dark:border-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowViews((value) => !value);
                    setShowColumns(false);
                    setShowMore(false);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <Search size={14} />
                  {quickViewLabel(filters.quickView)} ({summaryForView(summary, filters.quickView)})
                  <ChevronDown size={13} className="text-slate-400" />
                </button>

                {showViews ? (
                  <Popover className="left-0 top-11 w-64">
                    <PopoverLabel>Views</PopoverLabel>
                    {[
                      ["all", "All leads", summary.all],
                      ["unassigned", "Unassigned", summary.unassigned],
                      ["stuck", "Stuck", summary.stuck],
                      ["followup_overdue", "Overdue follow-ups", summary.followupOverdue],
                      ["payment_pending", "Payment pending", summary.paymentPending],
                    ].map(([value, label, count]) => (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => {
                          updateUrl({ view: value === "all" ? null : String(value), page: 1 });
                          setShowViews(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                      >
                        <span className="flex-1">{String(label)}</span>
                        <span className="text-[10px] text-slate-400">{String(count)}</span>
                        {filters.quickView === value ? <Check size={13} /> : null}
                      </button>
                    ))}
                  </Popover>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowFilters(true);
                  setShowViews(false);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <Plus size={14} /> New view
              </button>

              <button
                type="button"
                onClick={() => void shareView()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                {copied ? <Check size={14} /> : <Share2 size={14} />}
                {copied ? "Copied" : "Share view"}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowMore((value) => !value);
                    setShowViews(false);
                    setShowColumns(false);
                  }}
                  aria-label="More lead view options"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <MoreHorizontal size={16} />
                </button>
                {showMore ? (
                  <Popover className="left-0 top-11 w-52">
                    <button
                      type="button"
                      onClick={() => {
                        resetFilters();
                        setShowMore(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <ListFilter size={14} /> Reset view
                    </button>
                    <button
                      type="button"
                      onClick={() => void shareView()}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <Copy size={14} /> Copy view link
                    </button>
                  </Popover>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[220px] flex-1 xl:flex-none">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search leads"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-[12px] font-medium transition ${
                  showFilters || filtersActive
                    ? "bg-slate-100 text-slate-950 dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                }`}
              >
                <Filter size={15} /> Filter
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowColumns((value) => !value);
                    setShowViews(false);
                    setShowMore(false);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <Columns3 size={15} /> Visible fields
                </button>
                {showColumns ? (
                  <Popover className="right-0 top-11 w-56">
                    <PopoverLabel>Visible fields</PopoverLabel>
                    {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((column) => (
                      <label
                        key={column}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(column)}
                          disabled={column === "lead"}
                          onChange={() => toggleColumn(column)}
                          className="h-3.5 w-3.5 rounded border-slate-300"
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
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
              <FilterSelect label="Stage" value={filters.stage || "all"} options={options.stages} onChange={(value) => updateUrl({ stage: value, page: 1 })} />
              <FilterSelect label="Source" value={filters.source || "all"} options={options.sources} onChange={(value) => updateUrl({ source: value, page: 1 })} />
              <FilterSelect label="Channel" value={filters.channel || "all"} options={options.channels} onChange={(value) => updateUrl({ channel: value, page: 1 })} />
              <FilterSelect label="Owner" value={filters.owner || "all"} options={options.owners} onChange={(value) => updateUrl({ owner: value, page: 1 })} />
              <FilterSelect label="Course" value={filters.course || "all"} options={options.courses} onChange={(value) => updateUrl({ course: value, page: 1 })} />
              {filtersActive ? (
                <button type="button" onClick={resetFilters} className="mb-px inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-950 dark:hover:bg-slate-950 dark:hover:text-white">
                  <X size={13} /> Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {selectedRows.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-900 dark:bg-slate-900/40">
            <span className="font-semibold text-slate-900 dark:text-white">{selectedRows.size} selected</span>
            <Link href="/follow-ups" className="rounded-lg px-2.5 py-1.5 font-medium text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-950">Create follow-up</Link>
            <button type="button" onClick={() => setSelectedRows(new Set())} className="ml-auto text-slate-400 hover:text-slate-900 dark:hover:text-white">Clear selection</button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left dark:border-slate-900 dark:bg-slate-900/30">
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible leads" className="h-3.5 w-3.5 rounded border-slate-300" />
                </th>
                {visibleColumns.includes("lead") ? <HeaderCell>Lead</HeaderCell> : null}
                {visibleColumns.includes("course") ? <HeaderCell>Course</HeaderCell> : null}
                {visibleColumns.includes("contact") ? <HeaderCell>Contact</HeaderCell> : null}
                {visibleColumns.includes("source") ? <HeaderCell>Source</HeaderCell> : null}
                {visibleColumns.includes("stage") ? <HeaderCell>Stage</HeaderCell> : null}
                {visibleColumns.includes("owner") ? <HeaderCell>Owner</HeaderCell> : null}
                {visibleColumns.includes("created") ? <HeaderCell>Created</HeaderCell> : null}
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>

            <tbody>
              {rows.length ? (
                rows.map((row, index) => {
                  const { lead, intel } = row;
                  const checked = selectedRows.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedId(lead.id)}
                      className={`group cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-900 dark:hover:bg-slate-900/40 ${checked ? "bg-violet-50/40 dark:bg-violet-950/10" : ""}`}
                    >
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={checked} onChange={() => toggleRow(lead.id)} aria-label={`Select ${lead.name || lead.leadCode}`} className="h-3.5 w-3.5 rounded border-slate-300" />
                      </td>

                      {visibleColumns.includes("lead") ? (
                        <td className="px-3 py-3">
                          <div className="flex min-w-[190px] items-center gap-3">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${avatarTone(lead.currentContactChannel)}`}>
                              {initials(lead.name || lead.leadCode)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="max-w-[220px] truncate text-[12px] font-semibold text-slate-950 dark:text-white">{lead.name || lead.leadCode}</span>
                                {index === 0 ? <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[8px] font-bold text-violet-600 dark:bg-violet-950/30 dark:text-violet-300">Newest</span> : null}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-slate-400">{lead.leadCode}{lead.country ? ` · ${lead.country}` : ""}</div>
                            </div>
                          </div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("course") ? (
                        <td className="px-3 py-3">
                          <div className="max-w-[220px] truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">{lead.course || "—"}</div>
                          <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-slate-400">{intel?.batch_code || lead.location || "Not selected"}</div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("contact") ? (
                        <td className="px-3 py-3">
                          <div className="max-w-[220px] truncate text-[11px] text-slate-700 dark:text-slate-200">{lead.email || lead.phone || "—"}</div>
                          <div className="mt-1"><ChannelBadge channel={lead.currentContactChannel} /></div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("source") ? (
                        <td className="px-3 py-3">
                          <div className="max-w-[160px] truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{pretty(lead.firstTouchSource || "Unknown")}</div>
                          <div className="mt-0.5 max-w-[160px] truncate text-[10px] text-slate-400">{lead.firstTouchCampaign || lead.firstTouchMedium || "—"}</div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("stage") ? (
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1.5"><StageBadge stage={lead.stage} /><IntentLabel intent={lead.intent} /></div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("owner") ? (
                        <td className="px-3 py-3">
                          <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{intel?.owner_name || lead.owner || "Unassigned"}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{nextAction(lead, intel)}</div>
                        </td>
                      ) : null}

                      {visibleColumns.includes("created") ? (
                        <td className="px-3 py-3">
                          <div className="whitespace-nowrap text-[11px] font-medium text-slate-700 dark:text-slate-200">{relativeDate(lead.createdAt)}</div>
                          <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">{formatDate(lead.createdAt)}</div>
                        </td>
                      ) : null}

                      <td className="px-2 py-3 text-right">
                        <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(lead.id); }} aria-label={`Open ${lead.name || lead.leadCode}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 opacity-0 transition hover:bg-white hover:text-slate-800 group-hover:opacity-100 dark:hover:bg-slate-950 dark:hover:text-white">
                          <MoreHorizontal size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="px-6 py-16 text-center">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">No leads match this view</div>
                    <button type="button" onClick={resetFilters} className="mt-2 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">Clear filters</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-900">
          <div className="text-[11px] text-slate-400">
            {pagination.total > 0 ? `${pagination.from}–${pagination.to} of ${pagination.total}` : "0 leads"}
            {mock ? " · Demo" : " · Live"} · newest first
          </div>
          {pagination.totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled={isPending || pagination.page <= 1} onClick={() => updateUrl({ page: pagination.page - 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300"><ArrowLeft size={12} /> Previous</button>
              <span className="text-[10px] text-slate-400">{pagination.page} / {pagination.totalPages}</span>
              <button type="button" disabled={isPending || pagination.page >= pagination.totalPages} onClick={() => updateUrl({ page: pagination.page + 1 })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300">Next <ArrowRight size={12} /></button>
            </div>
          ) : null}
        </div>
      </section>

      {selectedLead ? <LeadDrawer row={selectedLead} onClose={() => setSelectedId(null)} /> : null}
    </>
  );
}

function LeadDrawer({ row, onClose }: { row: EnrichedLead; onClose: () => void }) {
  const { lead, intel } = row;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button type="button" onClick={onClose} aria-label="Close lead preview" className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" />
      <aside className="relative h-full w-full max-w-[440px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur dark:border-slate-900 dark:bg-slate-950/95">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-xs font-bold ${avatarTone(lead.currentContactChannel)}`}>{initials(lead.name || lead.leadCode)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-slate-950 dark:text-white">{lead.name || lead.leadCode}</div>
            <div className="mt-1 flex flex-wrap gap-1.5"><StageBadge stage={lead.stage} /><IntentLabel intent={lead.intent} /></div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"><X size={16} /></button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/leads/${lead.id}`} className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Open profile</Link>
            <Link href={`/conversations?lead=${lead.id}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">Conversation</Link>
          </div>

          <section className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/15">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-violet-600 dark:text-violet-300"><Sparkles size={12} /> Next action</div>
            <div className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">{nextAction(lead, intel)}</div>
            <div className="mt-1 text-[11px] leading-5 text-slate-500">Based on current CRM stage, ownership and follow-up state.</div>
          </section>

          <section className="space-y-3">
            <DrawerField label="Course" value={lead.course || "Not selected"} />
            <DrawerField label="Batch / location" value={intel?.batch_code || lead.location || "Not selected"} />
            <DrawerField label="Email" value={lead.email || "—"} />
            <DrawerField label="Phone" value={lead.phone || "—"} />
            <DrawerField label="Source" value={pretty(lead.firstTouchSource || "Unknown")} />
            <DrawerField label="Campaign" value={lead.firstTouchCampaign || "—"} />
            <DrawerField label="Owner" value={intel?.owner_name || lead.owner || "Unassigned"} />
            <DrawerField label="Created" value={formatDateTime(lead.createdAt)} />
          </section>
        </div>
      </aside>
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{children}</th>;
}

function Popover({ children, className }: { children: React.ReactNode; className: string }) {
  return <div className={`absolute z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-950 ${className}`}>{children}</div>;
}

function PopoverLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1.5 pt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{children}</div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="min-w-[150px]">
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}
      </select>
    </label>
  );
}

function DrawerField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 dark:border-slate-900">
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <span className="max-w-[240px] text-right text-[11px] font-medium text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
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

function initials(value: string) {
  const result = value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return result || "L";
}

function avatarTone(channel: LeadOverview["currentContactChannel"]) {
  if (channel === "whatsapp") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (channel === "instagram") return "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300";
  if (channel === "email") return "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300";
  if (channel === "phone") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
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

function pretty(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

function formatDateTime(value: string) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}
