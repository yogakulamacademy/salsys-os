import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  ListFilter,
  Target,
  UsersRound,
} from "lucide-react";

import { EmptyState, PageHeader } from "@/components/ui";
import {
  getRevenueAttributionActions,
  hasRevenueAttributionScope,
  type ExactAttributionScope,
  type RevenueAttributionOpportunity,
} from "@/lib/attribution-investigation-data";
import { describeInvestigationScope, type InvestigationScope } from "@/lib/investigation-scope";

type SearchParams = {
  source?: string | string[];
  creation_channel?: string | string[];
  last_touch_source?: string | string[];
  from?: string | string[];
};

export default async function RevenueAttributionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const query = (await searchParams) ?? {};
  const scope: ExactAttributionScope = {
    firstTouchSource: one(query.source) || undefined,
    creationChannel: one(query.creation_channel) || undefined,
    lastTouchSource: one(query.last_touch_source) || undefined,
  };

  if (!hasRevenueAttributionScope(scope)) {
    redirect("/revenue");
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const payload = await getRevenueAttributionActions(currentMonth, scope);
  const investigationScope: InvestigationScope = {
    source: scope.firstTouchSource,
    creationChannel: scope.creationChannel,
    lastTouchSource: scope.lastTouchSource,
  };
  const chips = describeInvestigationScope(investigationScope);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Revenue · Exact attribution cohort"
        title="Revenue evidence focus"
        description="Commercial action rows are selected from the full authorized Revenue forecast only after the exact attribution cohort is resolved. Global Revenue totals and forecast definitions remain unchanged."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/marketing?view=attribution" className="btn-secondary">
              <ArrowLeft size={14} /> Attribution
            </Link>
            <Link href="/revenue" className="btn-primary">
              Full Revenue workspace <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      {payload.warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          {payload.warning}
        </div>
      ) : null}

      <section className="rounded-2xl border border-violet-200 bg-violet-50/55 px-5 py-4 dark:border-violet-900/60 dark:bg-violet-950/15">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
              <ListFilter size={13} /> Exact attribution evidence active
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              Attribution comes from canonical lead evidence; opportunity value, weighting and collected amounts come from Revenue forecast/payment evidence. No fuzzy matching or cross-model substitution is used.
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

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          icon={<UsersRound size={15} />}
          label="Matching leads"
          value={formatNumber(payload.matchingLeads)}
          detail="Authorized CRM leads inside the exact attribution cohort"
        />
        <MetricCard
          icon={<CircleDollarSign size={15} />}
          label="Open valued opportunities"
          value={formatNumber(payload.matchingOpenValued)}
          detail="Open forecast rows with a recorded positive potential value"
        />
        <MetricCard
          icon={<CalendarDays size={15} />}
          label="Closing this month"
          value={formatNumber(payload.closingThisMonth.length)}
          detail="Matching valued opportunities with a recorded close date this month"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-violet-600 dark:text-violet-300">
              Scoped commercial action list
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
              Highest-value matching opportunities
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Ranked after cohort filtering, not filtered from the global top-ten list.
            </p>
          </div>
          <Target size={18} className="text-violet-500" />
        </div>

        {payload.topOpportunities.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {payload.topOpportunities.map((row) => (
              <OpportunityRow key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No valued open opportunities in this cohort"
            description="Matching leads may exist, but none currently have an open positive-value Revenue forecast. SalsysOS does not substitute unrelated opportunities."
            compact
          />
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-900">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Expected close window
          </div>
          <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
            Matching opportunities closing this month
          </h2>
        </div>

        {payload.closingThisMonth.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {payload.closingThisMonth.map((row) => (
              <OpportunityRow key={`closing-${row.id}`} row={row} showCloseDate />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No matching close dates this month"
            description="No valued open opportunity in this exact attribution cohort has a recorded expected close date in the current month."
            compact
          />
        )}
      </section>

      <p className="text-[10px] leading-5 text-slate-400">
        This focused renderer intentionally does not recalculate pipeline, weighted forecast, collected revenue, refunds, outstanding balances or monthly charts. Those remain authoritative in the full Revenue workspace.
      </p>
    </div>
  );
}

function OpportunityRow({
  row,
  showCloseDate = false,
}: {
  row: RevenueAttributionOpportunity;
  showCloseDate?: boolean;
}) {
  const evidence = [
    row.first_touch_source ? `First: ${pretty(row.first_touch_source)}` : null,
    row.lead_creation_channel ? `Creation: ${pretty(row.lead_creation_channel)}` : null,
    row.last_touch_source ? `Last: ${pretty(row.last_touch_source)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(220px,1fr)_130px_130px_130px] lg:items-center">
      <div className="min-w-0">
        <Link href={`/leads/${row.id}`} className="truncate text-sm font-semibold text-slate-950 hover:text-violet-600 dark:text-white dark:hover:text-violet-300">
          {row.lead_name || row.lead_code || "Lead"}
        </Link>
        <div className="mt-0.5 text-xs text-slate-500">
          {[row.current_stage ? pretty(row.current_stage) : null, row.preferred_location, showCloseDate && row.expected_close_date ? `Close ${formatDate(row.expected_close_date)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {evidence ? <div className="mt-1 text-[10px] text-slate-400">{evidence}</div> : null}
      </div>
      <MiniMetric label="Potential" value={formatMoney(row.potential_value, row.currency)} />
      <MiniMetric label="Weighted" value={formatMoney(row.weighted_value, row.currency)} />
      <MiniMetric label="Collected" value={formatMoney(row.net_paid, row.currency)} />
    </div>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="lg:text-right">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
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

function formatMoney(value: number | string | null | undefined, currency: string | null) {
  if (value == null) return "—";
  const code = currency?.trim().toUpperCase();
  if (!code) return formatNumber(value);
  try {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(toNumber(value));
  } catch {
    return `${code} ${formatNumber(value)}`;
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
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
