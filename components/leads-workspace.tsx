"use client";

import Link from "next/link";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Filter,
  Search,
  SlidersHorizontal,
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
  type ReactNode,
} from "react";

import type { LeadOverview } from "@/types/crm";

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

type EnrichedLead = {
  lead: LeadOverview;

  intel: LeadListIntelligence | null;
};

type LeadsWorkspaceProps = {
  leads: LeadOverview[];

  intelligence: LeadListIntelligence[];

  mock: boolean;

  filters: LeadsWorkspaceFilters;

  options: LeadsWorkspaceOptions;

  summary: LeadsWorkspaceSummary;

  pagination: LeadsWorkspacePagination;
};

export function LeadsWorkspace({
  leads,

  intelligence,

  mock,

  filters,

  options,

  summary,

  pagination,
}: LeadsWorkspaceProps) {
  const router = useRouter();

  const pathname = usePathname();

  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();

  const [queryInput, setQueryInput] = useState(filters.query);

  const [showMoreFilters, setShowMoreFilters] = useState(
    Boolean(
      filters.channel || filters.owner || filters.course || filters.aging,
    ),
  );

  const intelligenceByLead = useMemo(
    () => new Map(intelligence.map((row) => [row.lead_id, row])),

    [intelligence],
  );

  const enriched = useMemo<EnrichedLead[]>(
    () =>
      leads.map((lead) => ({
        lead,

        intel: intelligenceByLead.get(lead.id) ?? null,
      })),

    [leads, intelligenceByLead],
  );

  // Keep the initial server and client render identical to avoid hydration mismatches.
  // The real current time is applied after hydration and refreshed once per minute.
  const [now, setNow] = useState(0);

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());

    refreshNow();

    const timer = window.setInterval(refreshNow, 60_000);

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

        if (remove) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
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

    if (normalized === filters.query) {
      return;
    }

    const timer = window.setTimeout(() => {
      updateUrl({
        q: normalized,

        page: 1,
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [queryInput, filters.query, updateUrl]);

  const hasAdvancedFilters = Boolean(
    filters.stage ||
    filters.source ||
    filters.channel ||
    filters.owner ||
    filters.course ||
    filters.aging,
  );

  const moreFilterCount = [
    filters.channel,

    filters.owner,

    filters.course,

    filters.aging,
  ].filter(Boolean).length;

  const hasAnyFilters = Boolean(
    filters.query || hasAdvancedFilters || filters.quickView !== "all",
  );

  function setFilter(key: string, value: string) {
    updateUrl({
      [key]: value,

      page: 1,
    });
  }

  function setQuickView(value: LeadsQuickView) {
    updateUrl({
      view: value,

      page: 1,
    });
  }

  function setSortMode(value: LeadsSortMode) {
    updateUrl({
      sort: value,

      page: 1,
    });
  }

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
    <div
      className={`leads-premium card overflow-hidden transition-opacity ${
        isPending ? "opacity-70" : "opacity-100"
      }`}
    >
      <div className="leads-workspace-toolbar border-b border-slate-100 p-4">
        <div className="leads-quickviews flex flex-wrap items-center gap-2">
          <QuickViewButton
            active={filters.quickView === "all"}
            onClick={() => setQuickView("all")}
            label="All leads"
            count={summary.all}
          />

          <QuickViewButton
            active={filters.quickView === "unassigned"}
            onClick={() => setQuickView("unassigned")}
            label="Unassigned"
            count={summary.unassigned}
            icon={<UserRoundX size={13} />}
          />

          <QuickViewButton
            active={filters.quickView === "stuck"}
            onClick={() => setQuickView("stuck")}
            label="Stuck"
            count={summary.stuck}
            icon={<AlertTriangle size={13} />}
          />

          <QuickViewButton
            active={filters.quickView === "followup_overdue"}
            onClick={() => setQuickView("followup_overdue")}
            label="Follow-up overdue"
            count={summary.followupOverdue}
            icon={<CalendarClock size={13} />}
          />

          <QuickViewButton
            active={filters.quickView === "payment_pending"}
            onClick={() => setQuickView("payment_pending")}
            label="Payment pending"
            count={summary.paymentPending}
            icon={<CircleDollarSign size={13} />}
          />
        </div>

        <div className="leads-primary-filters mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="leads-search-box flex min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-brand/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/5">
            <Search size={16} className="shrink-0 text-slate-400" />

            <input
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              className="w-full bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-400"
              placeholder="Search name, lead ID, country, course, source, owner or batch..."
            />
          </div>

          <select
            value={filters.stage || "all"}
            onChange={(event) => setFilter("stage", event.target.value)}
            className="input xl:w-44"
          >
            <option value="all">All stages</option>

            {options.stages.map((item) => (
              <option key={item} value={item}>
                {pretty(item)}
              </option>
            ))}
          </select>

          <select
            value={filters.source || "all"}
            onChange={(event) => setFilter("source", event.target.value)}
            className="input xl:w-44"
          >
            <option value="all">All sources</option>

            {options.sources.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowMoreFilters((current) => !current)}
            className={`leads-more-filter-button btn-secondary ${
              showMoreFilters || hasAdvancedFilters
                ? "!border-brand/20 !bg-brand/[0.04] !text-brand"
                : ""
            }`}
          >
            <Filter size={15} />
            More filters
            {moreFilterCount > 0 && (
              <span className="leads-filter-count">{moreFilterCount}</span>
            )}
          </button>
        </div>

        {showMoreFilters && (
          <div className="leads-advanced-filters mt-3 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              label="Current channel"
              value={filters.channel || "all"}
              onChange={(value) => setFilter("channel", value)}
              options={options.channels}
            />

            <FilterSelect
              label="Owner"
              value={filters.owner || "all"}
              onChange={(value) => setFilter("owner", value)}
              options={options.owners}
              extraOptions={[
                {
                  value: "__unassigned__",

                  label: "Unassigned only",
                },
              ]}
            />

            <FilterSelect
              label="Course"
              value={filters.course || "all"}
              onChange={(value) => setFilter("course", value)}
              options={options.courses}
            />

            <label>
              <span className="field-label text-xs">Stage aging</span>

              <select
                value={filters.aging || "all"}
                onChange={(event) => setFilter("aging", event.target.value)}
                className="input"
              >
                <option value="all">All aging</option>

                <option value="healthy">Healthy</option>

                <option value="warning">Warning</option>

                <option value="stuck">Stuck</option>

                <option value="untracked">Untracked</option>
              </select>
            </label>
          </div>
        )}

        <div className="leads-list-meta mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              {pagination.total > 0 ? (
                <>
                  Showing{" "}
                  <strong className="text-slate-800">
                    {pagination.from.toLocaleString()}–
                    {pagination.to.toLocaleString()}
                  </strong>{" "}
                  of{" "}
                  <strong className="text-slate-800">
                    {pagination.total.toLocaleString()}
                  </strong>
                </>
              ) : (
                <strong className="text-slate-800">0 leads</strong>
              )}
            </span>

            <span>·</span>

            <span>{mock ? "Mock-data mode" : "Supabase live mode"}</span>

            {isPending && (
              <>
                <span>·</span>

                <span className="font-bold text-brand">Updating…</span>
              </>
            )}

            {hasAnyFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 font-bold text-brand hover:underline"
              >
                <X size={12} />
                Clear filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-slate-400" />

            <select
              value={filters.sort}
              onChange={(event) =>
                setSortMode(event.target.value as LeadsSortMode)
              }
              className="input !w-auto min-w-[170px] !py-2"
            >
              <option value="stage_age_desc">Oldest in stage</option>

              <option value="followup_asc">Next follow-up</option>

              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>
      </div>

      <div className="leads-table-wrap overflow-x-auto">
        <table className="leads-table min-w-[1240px] w-full text-left">
          <thead>
            <tr className="leads-table-head border-b border-slate-200 bg-slate-50/60 text-[10px] uppercase tracking-[0.08em] text-slate-400">
              <th className="px-4 py-3 font-bold">Lead</th>

              <th className="px-4 py-3 font-bold">Course / Batch</th>

              <th className="px-4 py-3 font-bold">Stage</th>

              <th className="px-4 py-3 font-bold">Owner</th>

              <th className="px-4 py-3 font-bold">Source</th>

              <th className="px-4 py-3 font-bold">Channel</th>

              <th className="px-4 py-3 font-bold">Stage age</th>

              <th className="px-4 py-3 font-bold">Next follow-up</th>

              <th className="px-4 py-3 font-bold">Attention</th>

              <th className="px-4 py-3 font-bold" />
            </tr>
          </thead>

          <tbody>
            {enriched.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center">
                  <div className="text-sm font-bold text-slate-600">
                    No leads match these filters.
                  </div>

                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-2 text-xs font-bold text-brand hover:underline"
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              enriched.map((item) => (
                <LeadRow key={item.lead.id} item={item} now={now} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        pagination={pagination}
        pending={isPending}
        onPageChange={(page) =>
          updateUrl({
            page,
          })
        }
      />
    </div>
  );
}

function PaginationBar({
  pagination,

  pending,

  onPageChange,
}: {
  pagination: LeadsWorkspacePagination;

  pending: boolean;

  onPageChange: (page: number) => void;
}) {
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="leads-pagination flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">
        Page{" "}
        <strong className="text-slate-800">
          {pagination.page.toLocaleString()}
        </strong>{" "}
        of{" "}
        <strong className="text-slate-800">
          {pagination.totalPages.toLocaleString()}
        </strong>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft size={14} />
          Previous
        </button>

        <button
          type="button"
          disabled={pending || pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function LeadRow({ item, now }: { item: EnrichedLead; now: number }) {
  const { lead, intel } = item;

  const overdue = isOverdue(lead.nextFollowupAt, now);

  const unassigned = !intel?.owner_user_id;

  const stuck = intel?.aging_status === "stuck";

  const paymentPending = lead.stage === "payment_pending";

  return (
    <tr className="leads-table-row border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="lead-avatar" aria-hidden="true">
            {leadInitials(lead.name)}
          </div>

          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">
              {lead.name}
            </div>

            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
              <span>{lead.leadCode}</span>

              <span>•</span>

              <span className="truncate">{lead.country || "—"}</span>
            </div>
          </div>
        </div>
      </td>

      <td className="max-w-[260px] px-4 py-3.5">
        <div className="truncate text-sm font-medium text-slate-700">
          {lead.course || "Course not set"}
        </div>

        <div className="mt-0.5 truncate text-xs text-slate-400">
          {intel?.batch_code || lead.location || "Batch not set"}
        </div>
      </td>

      <td className="px-4 py-3.5">
        <StageBadge stage={lead.stage} />

        <div className="mt-1">
          <IntentLabel intent={lead.intent} />
        </div>
      </td>

      <td className="px-4 py-3.5">
        {intel?.owner_name ? (
          <div className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <UserRoundCheck size={13} className="text-slate-400" />

            {intel.owner_name}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
            <UserRoundX size={11} />
            Unassigned
          </span>
        )}
      </td>

      <td className="max-w-[190px] px-4 py-3.5">
        <div className="truncate text-sm font-medium text-slate-700">
          {lead.firstTouchSource || "—"}
        </div>

        <div className="mt-0.5 truncate text-xs text-slate-400">
          {lead.firstTouchCampaign || "No campaign"}
        </div>
      </td>

      <td className="px-4 py-3.5">
        <ChannelBadge channel={lead.currentContactChannel} />
      </td>

      <td className="px-4 py-3.5">
        <AgingCell intel={intel} />
      </td>

      <td className="px-4 py-3.5">
        <div
          className={`text-sm font-medium ${
            overdue ? "text-red-700" : "text-slate-700"
          }`}
        >
          {formatDateTimeLocal(lead.nextFollowupAt)}
        </div>

        {overdue && (
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-red-500">
            Overdue
          </div>
        )}
      </td>

      <td className="px-4 py-3.5">
        <div className="flex max-w-[210px] flex-wrap gap-1">
          {stuck && (
            <AttentionBadge tone="danger" icon={<AlertTriangle size={10} />}>
              Stuck
            </AttentionBadge>
          )}

          {overdue && (
            <AttentionBadge tone="danger" icon={<CalendarClock size={10} />}>
              Follow-up
            </AttentionBadge>
          )}

          {paymentPending && (
            <AttentionBadge
              tone="warning"
              icon={<CircleDollarSign size={10} />}
            >
              Payment
            </AttentionBadge>
          )}

          {unassigned && (
            <AttentionBadge tone="warning" icon={<UserRoundX size={10} />}>
              Owner
            </AttentionBadge>
          )}

          {!stuck && !overdue && !paymentPending && !unassigned && (
            <span className="text-[10px] font-semibold text-slate-400">—</span>
          )}
        </div>
      </td>

      <td className="px-4 py-3.5 text-right">
        <Link
          href={`/leads/${lead.id}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand/20 hover:bg-white hover:text-brand"
        >
          <ArrowUpRight size={15} />
        </Link>
      </td>
    </tr>
  );
}

function AgingCell({ intel }: { intel: LeadListIntelligence | null }) {
  const status = intel?.aging_status ?? "untracked";

  const age = toNumber(intel?.stage_age_days);

  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.04em] ${agingBadgeClass(
          status,
        )}`}
      >
        {status === "stuck" && <AlertTriangle size={10} />}

        {status === "warning" && <Clock3 size={10} />}

        {pretty(status)}
      </span>

      <div className="mt-1 text-[10px] font-semibold text-slate-400">
        {formatAge(age)} in stage
      </div>
    </div>
  );
}

function QuickViewButton({
  active,

  onClick,

  label,

  count,

  icon,
}: {
  active: boolean;

  onClick: () => void;

  label: string;

  count: number;

  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`leads-quickview inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
        active
          ? "border-brand/20 bg-brand/[0.06] text-brand shadow-sm"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
      }`}
    >
      {icon}

      {label}

      <span
        className={`leads-quickview-count rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
          active ? "bg-white text-brand" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FilterSelect({
  label,

  value,

  onChange,

  options,

  extraOptions = [],
}: {
  label: string;

  value: string;

  onChange: (value: string) => void;

  options: string[];

  extraOptions?: Array<{
    value: string;

    label: string;
  }>;
}) {
  return (
    <label>
      <span className="field-label text-xs">{label}</span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input"
      >
        <option value="all">All</option>

        {extraOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}

        {options.map((option) => (
          <option key={option} value={option}>
            {pretty(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function AttentionBadge({
  tone,

  icon,

  children,
}: {
  tone: "danger" | "warning";

  icon: ReactNode;

  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[8px] font-semibold uppercase tracking-[0.04em] ${
        tone === "danger"
          ? "bg-red-50 text-red-600"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {icon}

      {children}
    </span>
  );
}

function isOverdue(value: string | null | undefined, now: number) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) && time < now;
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",

    month: "short",

    hour: "2-digit",

    minute: "2-digit",

    timeZone: "Asia/Kolkata",
  }).format(date);
}

function agingBadgeClass(status: string) {
  if (status === "stuck") {
    return "bg-red-100 text-red-700";
  }

  if (status === "warning") {
    return "bg-amber-100 text-amber-700";
  }

  if (status === "healthy") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-slate-100 text-slate-500";
}

function formatAge(days: number) {
  if (days < 1) {
    return `${Math.max(0, Math.round(days * 24))}h`;
  }

  if (days < 10) {
    return `${days.toFixed(1)}d`;
  }

  return `${Math.round(days)}d`;
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function leadInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  return parts

    .slice(0, 2)

    .map((part) => {
      // Array.from is Unicode-safe; part[0] can split emoji/non-BMP characters
      // and produce the replacement character shown in the hydration error.
      const firstCharacter = Array.from(part)[0] ?? "";

      return firstCharacter.toLocaleUpperCase("en-IN");
    })

    .join("");
}

function pretty(value: string) {
  return value

    .replaceAll("_", " ")

    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
