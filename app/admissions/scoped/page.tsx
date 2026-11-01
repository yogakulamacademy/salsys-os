import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  Filter,
  ListFilter,
  MapPin,
  UsersRound,
} from "lucide-react";

import { EmptyState, PageHeader } from "@/components/ui";
import { getAdmissionsSnapshot } from "@/lib/admissions-data";
import {
  describeInvestigationScope,
  transferInvestigationScope,
  type InvestigationScope,
} from "@/lib/investigation-scope";

type PriorityRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  current_contact_channel: string | null;
  first_touch_source: string | null;
  preferred_location: string | null;
  course_name: string | null;
  created_at: string | null;
  payment_status: string | null;
  outstanding_balance: number | string | null;
  currency: string | null;
  priority_band: string | null;
  priority_score: number | string | null;
  next_best_action: string | null;
  priority_reason: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
};

type RevenueRow = {
  lead_id: string;
  lead_name: string | null;
  current_stage: string | null;
  currency: string | null;
  outstanding_balance: number | string | null;
  payment_status: string | null;
};

type AdmissionsBatchCapacityRow = {
  batch_id: string;
  course_name: string | null;
  batch_code: string | null;
  location: string | null;
  start_date: string | null;
  capacity: number | string | null;
  enrolled_count: number | string | null;
  payment_pending: number | string | null;
  hot_prospects: number | string | null;
  needs_reply: number | string | null;
  calculated_seats_remaining: number | string | null;
  capacity_status: string | null;
};

type ScopedAdmissionsView = "queue" | "payments" | "capacity";

type SearchParams = {
  view?: string | string[];
  scope?: string | string[];
  source?: string | string[];
  course?: string | string[];
  location?: string | string[];
  stage?: string | string[];
  owner?: string | string[];
  band?: string | string[];
};

type OutstandingSummary = {
  display: string;
  hasAmount: boolean;
  missingCurrencyRecords: number;
};

const scopedViews = new Set<ScopedAdmissionsView>([
  "queue",
  "payments",
  "capacity",
]);

const supportedScopeKeys: Record<ScopedAdmissionsView, Set<keyof InvestigationScope>> = {
  queue: new Set(["source", "course", "location", "stage", "owner"]),
  payments: new Set(["source", "course", "location", "stage", "owner"]),
  capacity: new Set(["course", "location"]),
};

export default async function AdmissionsScopedPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = (await searchParams) ?? {};
  const requestedView = one(resolved.view) as ScopedAdmissionsView;
  const view = scopedViews.has(requestedView) ? requestedView : null;
  const band = one(resolved.band) || "all";
  const scope = compactScope({
    source: one(resolved.source) || undefined,
    course: one(resolved.course) || undefined,
    location: one(resolved.location) || undefined,
    stage: one(resolved.stage) || undefined,
    owner: one(resolved.owner) || undefined,
  });

  if (!view) {
    redirect("/admissions");
  }

  const visibleKeys = supportedScopeKeys[view];
  const visibleScope = Object.fromEntries(
    Object.entries(scope).filter(([key]) => visibleKeys.has(key as keyof InvestigationScope)),
  ) as InvestigationScope;

  if (!Object.keys(visibleScope).length) {
    redirect(baseAdmissionsHref(view, band));
  }

  const snapshot = await getAdmissionsSnapshot();
  const userId = snapshot.user?.id ?? null;
  const priorityQueue = snapshot.priorityQueue as PriorityRow[];
  const paymentPending = snapshot.paymentPending as RevenueRow[];
  const batchCapacity = snapshot.batchCapacity as AdmissionsBatchCapacityRow[];

  const scopedOwnerRows = priorityQueue.filter((row) =>
    matchesQueueScope(row, visibleScope, userId),
  );
  const filteredPriority =
    band === "all"
      ? scopedOwnerRows
      : scopedOwnerRows.filter((row) => sameDimension(row.priority_band, band));
  const criticalCount = scopedOwnerRows.filter((row) =>
    sameDimension(row.priority_band, "critical"),
  ).length;
  const highCount = scopedOwnerRows.filter((row) =>
    sameDimension(row.priority_band, "high"),
  ).length;

  const queueMetadata = new Map(priorityQueue.map((row) => [row.lead_id, row]));
  const scopedPayments = paymentPending.filter((row) =>
    matchesPaymentScope(row, queueMetadata.get(row.lead_id), visibleScope, userId),
  );
  const scopedOutstanding = summarizeOutstanding(scopedPayments);
  const scopedCapacity = batchCapacity.filter((row) =>
    matchesCapacityScope(row, visibleScope),
  );

  const chips = describeInvestigationScope(visibleScope).filter((chip) =>
    visibleKeys.has(chip.key),
  );
  const currentOwner = visibleScope.owner || "all";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM / Admissions · Scoped investigation"
        title="Admissions"
        description="Transferred investigation dimensions are applied to the underlying Admissions records on the server. Unknown metadata is not treated as a match."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={clearScopeHref(view, band)} className="btn-secondary">
              <Filter size={14} /> Clear transferred scope
            </Link>
            <Link href="/admissions" className="btn-primary">
              <ArrowLeft size={14} /> Admissions overview
            </Link>
          </div>
        }
      />

      <ScopeBanner view={view} chips={chips} />

      <nav
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950"
        aria-label="Admissions workspace views"
      >
        <div className="flex min-w-max items-center gap-1">
          <ViewTab href="/admissions" active={false} label="Overview" />
          <ViewTab
            href={scopedAdmissionsHref("queue", visibleScope, { band, owner: currentOwner })}
            active={view === "queue"}
            label="Work Queue"
          />
          <ViewTab href="/admissions?view=pipeline" active={false} label="Pipeline" />
          <ViewTab
            href={scopedAdmissionsHref("payments", visibleScope, { owner: currentOwner })}
            active={view === "payments"}
            label="Payments"
          />
          <ViewTab
            href={scopedAdmissionsHref("capacity", visibleScope)}
            active={view === "capacity"}
            label="Capacity"
          />
          <ViewTab href="/admissions?view=performance" active={false} label="Performance" />
        </div>
      </nav>

      {view === "queue" ? (
        <ScopedQueueView
          rows={filteredPriority}
          scope={visibleScope}
          band={band}
          currentOwner={currentOwner}
          criticalCount={criticalCount}
          highCount={highCount}
          userId={userId}
        />
      ) : null}

      {view === "payments" ? (
        <ScopedPaymentsView
          rows={scopedPayments}
          metadata={queueMetadata}
          outstanding={scopedOutstanding}
          scope={visibleScope}
        />
      ) : null}

      {view === "capacity" ? (
        <ScopedCapacityView rows={scopedCapacity} />
      ) : null}
    </div>
  );
}

function ScopeBanner({
  view,
  chips,
}: {
  view: ScopedAdmissionsView;
  chips: ReturnType<typeof describeInvestigationScope>;
}) {
  const viewNote =
    view === "payments"
      ? "Payment rows are joined by lead ID to current Admissions CRM metadata for source, course, location and owner. If required metadata is missing, that row is excluded rather than inferred."
      : view === "capacity"
        ? "Capacity scoping uses the recorded course and location on each upcoming batch. Marketing source and pipeline stage are intentionally not applied to capacity."
        : "Queue scoping uses the recorded source, course, location, stage and ownership fields already present in the Admissions priority snapshot.";

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/55 px-5 py-4 dark:border-violet-900/60 dark:bg-violet-950/15">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
            <ListFilter size={13} /> Native filters active
          </div>
          <p className="mt-1.5 max-w-4xl text-xs leading-5 text-slate-600 dark:text-slate-300">
            {viewNote}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-[48%] lg:justify-end">
          {chips.map((chip) => (
            <span
              key={`${chip.key}-${chip.value}`}
              className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-violet-700 dark:border-violet-900/70 dark:bg-slate-950 dark:text-violet-300"
            >
              {chip.label}: {chip.value}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScopedQueueView({
  rows,
  scope,
  band,
  currentOwner,
  criticalCount,
  highCount,
  userId,
}: {
  rows: PriorityRow[];
  scope: InvestigationScope;
  band: string;
  currentOwner: string;
  criticalCount: number;
  highCount: number;
  userId: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-900 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-600 dark:text-violet-300">
            Scoped action center
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
            Prioritized work queue
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {formatNumber(rows.length)} matching lead{rows.length === 1 ? "" : "s"} after transferred and local filters.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterTab
            href={scopedAdmissionsHref("queue", scope, { owner: "all", band })}
            active={currentOwner === "all"}
            label="Team"
          />
          {userId ? (
            <FilterTab
              href={scopedAdmissionsHref("queue", scope, { owner: "mine", band })}
              active={currentOwner === "mine"}
              label="Mine"
            />
          ) : null}
          <FilterTab
            href={scopedAdmissionsHref("queue", scope, { owner: "unassigned", band })}
            active={currentOwner === "unassigned"}
            label="Unassigned"
          />
          <span className="mx-1 h-8 w-px bg-slate-200 dark:bg-slate-800" />
          <FilterTab
            href={scopedAdmissionsHref("queue", scope, { owner: currentOwner, band: "all" })}
            active={band === "all"}
            label="All"
          />
          <FilterTab
            href={scopedAdmissionsHref("queue", scope, { owner: currentOwner, band: "critical" })}
            active={band === "critical"}
            label={`Critical ${criticalCount}`}
          />
          <FilterTab
            href={scopedAdmissionsHref("queue", scope, { owner: currentOwner, band: "high" })}
            active={band === "high"}
            label={`High ${highCount}`}
          />
        </div>
      </div>

      {rows.length ? (
        <div className="space-y-2 p-3">
          {rows.slice(0, 40).map((row) => (
            <ScopedQueueRow key={row.lead_id} row={row} />
          ))}
        </div>
      ) : (
        <div className="px-5 py-5">
          <EmptyState
            title="No leads match this investigation scope"
            description="The transferred dimensions are being applied exactly. Clear the scope or change the local owner/priority filters to broaden the queue."
            compact
          />
        </div>
      )}
    </section>
  );
}

function ScopedQueueRow({ row }: { row: PriorityRow }) {
  const actionHref = row.next_best_action?.toLowerCase().includes("reply")
    ? `/conversations?lead=${row.lead_id}`
    : `/leads/${row.lead_id}`;
  const context = [
    row.course_name,
    row.preferred_location,
    row.first_touch_source,
    row.current_contact_channel,
  ]
    .filter(Boolean)
    .map((value) => pretty(String(value)))
    .join(" · ");

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-violet-900/70">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityPill value={row.priority_band} />
            <Link
              href={`/leads/${row.lead_id}`}
              className="truncate text-sm font-semibold text-slate-950 hover:text-violet-600 dark:text-white dark:hover:text-violet-300"
            >
              {row.lead_name || row.lead_code || "Lead"}
            </Link>
            <StagePill value={row.current_stage || "new"} />
            {row.priority_score != null ? (
              <span className="text-[10px] font-semibold text-slate-400">
                Priority {formatNumber(row.priority_score)}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 truncate text-xs text-slate-500">
            {context || "Context unavailable"}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {row.priority_reason || "Priority is based on the current CRM state."}
          </p>
          <div className="mt-2 text-[10px] font-medium text-slate-400">
            Owner: {row.owner_name || "Unassigned"}
          </div>
        </div>
        <Link
          href={actionHref}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          {row.next_best_action?.toLowerCase().includes("reply") ? "Reply" : "Open"}
          <ArrowRight size={12} />
        </Link>
      </div>
    </article>
  );
}

function ScopedPaymentsView({
  rows,
  metadata,
  outstanding,
  scope,
}: {
  rows: RevenueRow[];
  metadata: Map<string, PriorityRow>;
  outstanding: OutstandingSummary;
  scope: InvestigationScope;
}) {
  const outstandingDetail = outstanding.missingCurrencyRecords > 0
    ? `${outstanding.missingCurrencyRecords} matching amount ${outstanding.missingCurrencyRecords === 1 ? "record is" : "records are"} excluded from totals because currency is missing`
    : "Matching amounts remain separated by recorded currency";

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={<CircleDollarSign size={15} />}
          label="Matching payment leads"
          value={formatNumber(rows.length)}
          detail="Payment-stage opportunities that match the transferred CRM scope"
        />
        <MetricCard
          icon={<CircleDollarSign size={15} />}
          label="Recorded outstanding"
          value={outstanding.hasAmount ? outstanding.display : "—"}
          detail={outstandingDetail}
        />
        <MetricCard
          icon={<UsersRound size={15} />}
          label="Matching method"
          value="Lead ID"
          detail="Payment evidence joined to current Admissions metadata without inferred dimensions"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Scoped conversion
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
              Payment-pending opportunities
            </h2>
          </div>
          <Link href="/revenue" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">
            Revenue <ArrowRight size={12} />
          </Link>
        </div>

        {rows.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {rows.map((row) => {
              const meta = metadata.get(row.lead_id);
              const context = [meta?.course_name, meta?.preferred_location, meta?.first_touch_source]
                .filter(Boolean)
                .map((value) => pretty(String(value)))
                .join(" · ");

              return (
                <Link
                  key={row.lead_id}
                  href={`/leads/${row.lead_id}`}
                  className="group grid gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-900/60 sm:grid-cols-[minmax(0,1fr)_180px_150px_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                      {row.lead_name || meta?.lead_name || "Lead"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {context || pretty(row.current_stage || "payment_pending")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Status</div>
                    <div className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {pretty(row.payment_status || "pending")}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className="text-[10px] text-slate-400">Outstanding</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-white">
                      {row.outstanding_balance == null || !row.currency
                        ? "—"
                        : formatMoney(row.outstanding_balance, row.currency)}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No payment opportunities match this scope"
            description="No payment-stage lead has recorded CRM metadata that satisfies the transferred dimensions. Missing metadata is not treated as a match."
            compact
          />
        )}
      </section>

      {(scope.source || scope.course || scope.location || scope.owner) ? (
        <p className="text-[10px] leading-5 text-slate-400">
          Scope-sensitive payment totals only include rows whose lead ID can be matched to the required Admissions metadata. This prevents unknown source, course, location or ownership from being silently classified.
        </p>
      ) : null}
    </div>
  );
}

function ScopedCapacityView({ rows }: { rows: AdmissionsBatchCapacityRow[] }) {
  const hot = rows.reduce((sum, row) => sum + toNumber(row.hot_prospects), 0);
  const seats = rows.reduce(
    (sum, row) => sum + Math.max(0, toNumber(row.calculated_seats_remaining)),
    0,
  );
  const nearCapacity = rows.filter((row) => {
    if (row.calculated_seats_remaining == null) return false;
    return toNumber(row.calculated_seats_remaining) <= 3;
  }).length;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={<MapPin size={15} />}
          label="Matching batches"
          value={formatNumber(rows.length)}
          detail="Upcoming batches matching the transferred course/location scope"
        />
        <MetricCard
          icon={<UsersRound size={15} />}
          label="Hot prospects"
          value={formatNumber(hot)}
          detail="High-intent demand attached to matching batches"
        />
        <MetricCard
          icon={<Filter size={15} />}
          label="Near capacity"
          value={formatNumber(nearCapacity)}
          detail={`${formatNumber(seats)} calculated seats remain across matching batches`}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Scoped demand planning
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
              Batch capacity & prospect pressure
            </h2>
          </div>
          <Link href="/course-management" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">
            Manage batches <ArrowRight size={12} />
          </Link>
        </div>

        {rows.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {rows.map((row) => {
              const remaining = row.calculated_seats_remaining == null
                ? null
                : toNumber(row.calculated_seats_remaining);
              return (
                <div
                  key={row.batch_id}
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(220px,1fr)_95px_95px_95px_105px] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {row.course_name || row.batch_code || "Batch"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {[row.batch_code, row.location, row.start_date ? formatDate(row.start_date) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <MiniMetric label="Hot" value={formatNumber(row.hot_prospects)} />
                  <MiniMetric label="Seats" value={remaining == null ? "—" : formatNumber(remaining)} />
                  <MiniMetric label="Enrolled" value={formatNumber(row.enrolled_count)} />
                  <MiniMetric label="Payment" value={formatNumber(row.payment_pending)} />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No batches match this scope"
            description="No upcoming batch has the recorded course and location requested by the transferred investigation scope."
            compact
          />
        )}
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="text-violet-600 dark:text-violet-300">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

function ViewTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
        active
          ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
          : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
      }`}
    >
      {label}
    </Link>
  );
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
        active
          ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
      }`}
    >
      {label}
    </Link>
  );
}

function PriorityPill({ value }: { value: string | null }) {
  const normalized = normalizeDimension(value) || "normal";
  const className = normalized === "critical"
    ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
    : normalized === "high"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
      : normalized === "medium"
        ? "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
        : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300";

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${className}`}>
      {pretty(normalized)}
    </span>
  );
}

function StagePill({ value }: { value: string }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
      {pretty(value)}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

function matchesQueueScope(
  row: PriorityRow,
  scope: InvestigationScope,
  userId: string | null,
) {
  return (
    matchesOwner(row, scope.owner, userId) &&
    matchesOptionalDimension(row.first_touch_source, scope.source) &&
    matchesOptionalDimension(row.course_name, scope.course) &&
    matchesOptionalDimension(row.preferred_location, scope.location) &&
    matchesOptionalDimension(row.current_stage, scope.stage)
  );
}

function matchesPaymentScope(
  row: RevenueRow,
  metadata: PriorityRow | undefined,
  scope: InvestigationScope,
  userId: string | null,
) {
  if (!matchesOptionalDimension(row.current_stage || metadata?.current_stage, scope.stage)) {
    return false;
  }

  const requiresMetadata = Boolean(scope.source || scope.course || scope.location || scope.owner);
  if (requiresMetadata && !metadata) return false;
  if (!metadata) return true;

  return (
    matchesOwner(metadata, scope.owner, userId) &&
    matchesOptionalDimension(metadata.first_touch_source, scope.source) &&
    matchesOptionalDimension(metadata.course_name, scope.course) &&
    matchesOptionalDimension(metadata.preferred_location, scope.location)
  );
}

function matchesCapacityScope(
  row: AdmissionsBatchCapacityRow,
  scope: InvestigationScope,
) {
  return (
    matchesOptionalDimension(row.course_name, scope.course) &&
    matchesOptionalDimension(row.location, scope.location)
  );
}

function matchesOwner(
  row: PriorityRow,
  owner: string | undefined,
  userId: string | null,
) {
  if (!owner || owner === "all") return true;
  if (owner === "mine") return Boolean(userId) && row.owner_user_id === userId;
  if (owner === "unassigned") return !row.owner_user_id;
  return sameDimension(row.owner_user_id, owner) || sameDimension(row.owner_name, owner);
}

function matchesOptionalDimension(
  value: string | null | undefined,
  expected: string | undefined,
) {
  if (!expected) return true;
  if (!value) return false;
  return sameDimension(value, expected);
}

function sameDimension(
  value: string | null | undefined,
  expected: string | null | undefined,
) {
  if (!value || !expected) return false;
  return normalizeDimension(value) === normalizeDimension(expected);
}

function normalizeDimension(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function scopedAdmissionsHref(
  view: ScopedAdmissionsView,
  scope: InvestigationScope,
  options?: { owner?: string; band?: string },
) {
  const params = new URLSearchParams({ view });
  const nextScope = { ...scope };

  if (options?.band && options.band !== "all" && view === "queue") {
    params.set("band", options.band);
  }

  if (options && "owner" in options) {
    nextScope.owner = options.owner && options.owner !== "all"
      ? options.owner
      : undefined;
  }

  return transferInvestigationScope(`/admissions?${params.toString()}`, nextScope).href;
}

function baseAdmissionsHref(view: ScopedAdmissionsView, band: string) {
  const params = new URLSearchParams({ view });
  if (view === "queue" && band !== "all") params.set("band", band);
  return `/admissions?${params.toString()}`;
}

function clearScopeHref(view: ScopedAdmissionsView, band: string) {
  return baseAdmissionsHref(view, band);
}

function compactScope(scope: InvestigationScope): InvestigationScope {
  return Object.fromEntries(
    Object.entries(scope).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0,
    ),
  ) as InvestigationScope;
}

function summarizeOutstanding(rows: RevenueRow[]): OutstandingSummary {
  const totals = new Map<string, number>();
  let missingCurrencyRecords = 0;

  for (const row of rows) {
    const amount = toNumber(row.outstanding_balance);
    if (amount === 0) continue;

    const currency = row.currency?.trim().toUpperCase();
    if (!currency) {
      missingCurrencyRecords += 1;
      continue;
    }

    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }

  return {
    display: [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => formatMoney(amount, currency))
      .join(" · "),
    hasAmount: totals.size > 0,
    missingCurrencyRecords,
  };
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(toNumber(value));
}

function formatMoney(value: number | string | null | undefined, currency: string) {
  try {
    return new Intl.NumberFormat(currency.toUpperCase() === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(toNumber(value));
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
