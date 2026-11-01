import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CircleDollarSign,
  Filter,
  ListFilter,
  UsersRound,
} from "lucide-react";

import { EmptyState, PageHeader } from "@/components/ui";
import { getAdmissionsSnapshot } from "@/lib/admissions-data";
import {
  getAttributionInvestigationLeadCohort,
  type ExactAttributionScope,
} from "@/lib/attribution-investigation-data";
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
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string | null;
  currency: string | null;
  outstanding_balance: number | string | null;
  payment_status: string | null;
};

type View = "queue" | "payments";

type SearchParams = {
  view?: string | string[];
  source?: string | string[];
  course?: string | string[];
  location?: string | string[];
  stage?: string | string[];
  owner?: string | string[];
  band?: string | string[];
  creation_channel?: string | string[];
  last_touch_source?: string | string[];
};

export default async function AdmissionsAttributionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const query = (await searchParams) ?? {};
  const requestedView = one(query.view);
  const view: View = requestedView === "payments" ? "payments" : "queue";
  const band = one(query.band) || "all";
  const scope = compactScope({
    source: one(query.source) || undefined,
    course: one(query.course) || undefined,
    location: one(query.location) || undefined,
    stage: one(query.stage) || undefined,
    owner: one(query.owner) || undefined,
    creationChannel: one(query.creation_channel) || undefined,
    lastTouchSource: one(query.last_touch_source) || undefined,
  });

  const exactScope: ExactAttributionScope = {
    creationChannel: scope.creationChannel,
    lastTouchSource: scope.lastTouchSource,
  };

  if (!exactScope.creationChannel && !exactScope.lastTouchSource) {
    redirect(`/admissions?view=${view}`);
  }

  const [snapshot, cohort] = await Promise.all([
    getAdmissionsSnapshot(),
    getAttributionInvestigationLeadCohort(exactScope),
  ]);

  const userId = snapshot.user?.id ?? null;
  const priorityQueue = snapshot.priorityQueue as PriorityRow[];
  const paymentPending = snapshot.paymentPending as RevenueRow[];
  const queueMetadata = new Map(priorityQueue.map((row) => [row.lead_id, row]));

  const scopedQueue = priorityQueue.filter(
    (row) =>
      cohort.leadIds.has(row.lead_id) &&
      matchesQueueScope(row, scope, userId),
  );
  const filteredQueue =
    band === "all"
      ? scopedQueue
      : scopedQueue.filter((row) => sameDimension(row.priority_band, band));

  const scopedPayments = paymentPending.filter(
    (row) =>
      cohort.leadIds.has(row.lead_id) &&
      matchesPaymentScope(row, queueMetadata.get(row.lead_id), scope, userId),
  );

  const chips = describeInvestigationScope(scope).filter((chip) =>
    [
      "source",
      "course",
      "location",
      "stage",
      "owner",
      "creationChannel",
      "lastTouchSource",
    ].includes(chip.key),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM / Admissions · Exact attribution cohort"
        title="Admissions"
        description="Lead Creation and Last Marketing Touch are resolved against canonical lead attribution first, then matched to Admissions records by lead ID. No fuzzy source substitution is used."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admissions?view=${view}`} className="btn-secondary">
              <Filter size={14} /> Clear attribution scope
            </Link>
            <Link href="/admissions" className="btn-primary">
              <ArrowLeft size={14} /> Admissions overview
            </Link>
          </div>
        }
      />

      {cohort.warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          {cohort.warning}
        </div>
      ) : null}

      <section className="rounded-2xl border border-violet-200 bg-violet-50/55 px-5 py-4 dark:border-violet-900/60 dark:bg-violet-950/15">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
              <ListFilter size={13} /> Canonical attribution cohort active
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              {formatNumber(cohort.matchingLeads)} authorized lead{cohort.matchingLeads === 1 ? "" : "s"} match the exact attribution dimensions. Queue and payment rows must also match their native Admissions filters.
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

      <nav className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex min-w-max items-center gap-1">
          <ViewTab href="/admissions" active={false} label="Overview" />
          <ViewTab
            href={scopedHref("queue", scope, { band })}
            active={view === "queue"}
            label="Work Queue"
          />
          <ViewTab href="/admissions?view=pipeline" active={false} label="Pipeline" />
          <ViewTab
            href={scopedHref("payments", scope)}
            active={view === "payments"}
            label="Payments"
          />
          <ViewTab href="/admissions?view=capacity" active={false} label="Capacity" />
        </div>
      </nav>

      {view === "queue" ? (
        <QueueView
          rows={filteredQueue}
          scope={scope}
          band={band}
          userId={userId}
        />
      ) : (
        <PaymentsView rows={scopedPayments} metadata={queueMetadata} />
      )}
    </div>
  );
}

function QueueView({
  rows,
  scope,
  band,
  userId,
}: {
  rows: PriorityRow[];
  scope: InvestigationScope;
  band: string;
  userId: string | null;
}) {
  const allScoped = rows;
  const owner = scope.owner || "all";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-900 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">
            Attribution-matched action center
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
            Prioritized work queue
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {formatNumber(allScoped.length)} lead{allScoped.length === 1 ? "" : "s"} match the exact cohort and local queue filters.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterTab href={scopedHref("queue", scope, { owner: "all", band })} active={owner === "all"} label="Team" />
          {userId ? (
            <FilterTab href={scopedHref("queue", scope, { owner: "mine", band })} active={owner === "mine"} label="Mine" />
          ) : null}
          <FilterTab href={scopedHref("queue", scope, { owner: "unassigned", band })} active={owner === "unassigned"} label="Unassigned" />
          <span className="mx-1 h-8 w-px bg-slate-200 dark:bg-slate-800" />
          <FilterTab href={scopedHref("queue", scope, { owner, band: "all" })} active={band === "all"} label="All" />
          <FilterTab href={scopedHref("queue", scope, { owner, band: "critical" })} active={band === "critical"} label="Critical" />
          <FilterTab href={scopedHref("queue", scope, { owner, band: "high" })} active={band === "high"} label="High" />
        </div>
      </div>

      {rows.length ? (
        <div className="space-y-2 p-3">
          {rows.slice(0, 40).map((row) => (
            <article key={row.lead_id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      {pretty(row.priority_band || "normal")}
                    </span>
                    <Link href={`/leads/${row.lead_id}`} className="text-sm font-semibold text-slate-950 hover:text-violet-600 dark:text-white">
                      {row.lead_name || row.lead_code || "Lead"}
                    </Link>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      {pretty(row.current_stage || "new")}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500">
                    {[row.course_name, row.preferred_location, row.first_touch_source, row.current_contact_channel]
                      .filter(Boolean)
                      .map((value) => pretty(String(value)))
                      .join(" · ") || "Context unavailable"}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {row.priority_reason || "Priority is based on the current CRM state."}
                  </p>
                  <div className="mt-2 text-[10px] text-slate-400">
                    Owner: {row.owner_name || "Unassigned"}
                  </div>
                </div>
                <Link href={`/leads/${row.lead_id}`} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
                  Review lead <ArrowRight size={12} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="p-5">
          <EmptyState
            title="No Admissions leads match this exact cohort"
            description="The attribution cohort and native Admissions filters are being applied exactly. Clear or change the scope to broaden the queue."
            compact
          />
        </div>
      )}
    </section>
  );
}

function PaymentsView({
  rows,
  metadata,
}: {
  rows: RevenueRow[];
  metadata: Map<string, PriorityRow>;
}) {
  const totals = summarizeOutstanding(rows);
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={<UsersRound size={15} />} label="Matching payment leads" value={formatNumber(rows.length)} detail="Payment rows whose lead IDs are inside the exact attribution cohort" />
        <MetricCard icon={<CircleDollarSign size={15} />} label="Outstanding" value={totals || "—"} detail="Totals remain separated by recorded currency" />
        <MetricCard icon={<ListFilter size={15} />} label="Evidence join" value="Lead ID" detail="Attribution is never inferred from payment text or amount" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">Attribution-matched payments</div>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">Payment follow-up</h2>
        </div>
        {rows.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {rows.map((row) => {
              const meta = metadata.get(row.lead_id);
              return (
                <div key={row.lead_id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(220px,1fr)_120px_150px] sm:items-center">
                  <div className="min-w-0">
                    <Link href={`/leads/${row.lead_id}`} className="truncate text-sm font-semibold text-slate-950 hover:text-violet-600 dark:text-white">
                      {row.lead_name || row.lead_code || meta?.lead_name || "Lead"}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {[row.current_stage, meta?.course_name, meta?.preferred_location]
                        .filter(Boolean)
                        .map((value) => pretty(String(value)))
                        .join(" · ")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Status</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{pretty(row.payment_status || "pending")}</div>
                  </div>
                  <div className="sm:text-right">
                    <div className="text-[10px] text-slate-400">Outstanding</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-950 dark:text-white">
                      {row.currency ? formatMoney(row.outstanding_balance, row.currency) : formatNumber(row.outstanding_balance)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No payment rows match this exact cohort"
            description="No current payment-pending record belongs to the selected attribution cohort and native Admissions filters."
            compact
          />
        )}
      </section>
    </div>
  );
}

function matchesQueueScope(row: PriorityRow, scope: InvestigationScope, userId: string | null) {
  return (
    matchesOwner(row, scope.owner, userId) &&
    matchesOptional(row.first_touch_source, scope.source) &&
    matchesOptional(row.course_name, scope.course) &&
    matchesOptional(row.preferred_location, scope.location) &&
    matchesOptional(row.current_stage, scope.stage)
  );
}

function matchesPaymentScope(
  row: RevenueRow,
  metadata: PriorityRow | undefined,
  scope: InvestigationScope,
  userId: string | null,
) {
  if (!matchesOptional(row.current_stage || metadata?.current_stage, scope.stage)) return false;

  const requiresMetadata = Boolean(scope.source || scope.course || scope.location || scope.owner);
  if (requiresMetadata && !metadata) return false;
  if (!metadata) return true;

  return (
    matchesOwner(metadata, scope.owner, userId) &&
    matchesOptional(metadata.first_touch_source, scope.source) &&
    matchesOptional(metadata.course_name, scope.course) &&
    matchesOptional(metadata.preferred_location, scope.location)
  );
}

function matchesOwner(row: PriorityRow, owner: string | undefined, userId: string | null) {
  if (!owner || owner === "all") return true;
  if (owner === "mine") return Boolean(userId) && row.owner_user_id === userId;
  if (owner === "unassigned") return !row.owner_user_id;
  return sameDimension(row.owner_user_id, owner) || sameDimension(row.owner_name, owner);
}

function matchesOptional(value: string | null | undefined, expected: string | undefined) {
  if (!expected) return true;
  if (!value) return false;
  return sameDimension(value, expected);
}

function sameDimension(value: string | null | undefined, expected: string | null | undefined) {
  if (!value || !expected) return false;
  return normalize(value) === normalize(expected);
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function scopedHref(
  view: View,
  scope: InvestigationScope,
  options?: { owner?: string; band?: string },
) {
  const params = new URLSearchParams({ view });
  const nextScope = { ...scope };
  if (view === "queue" && options?.band && options.band !== "all") params.set("band", options.band);
  if (options && "owner" in options) {
    nextScope.owner = options.owner && options.owner !== "all" ? options.owner : undefined;
  }
  return transferInvestigationScope(`/admissions?${params.toString()}`, nextScope).href;
}

function ViewTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"}`}>
      {label}
    </Link>
  );
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${active ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"}`}>
      {label}
    </Link>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="text-violet-600 dark:text-violet-300">{icon}</span>{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

function summarizeOutstanding(rows: RevenueRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const amount = toNumber(row.outstanding_balance);
    const currency = row.currency?.trim().toUpperCase();
    if (!currency || amount === 0) continue;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" · ");
}

function compactScope(scope: InvestigationScope): InvestigationScope {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => typeof value === "string" && value.trim().length > 0)) as InvestigationScope;
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

function pretty(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
