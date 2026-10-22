import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganizationId } from "@/lib/workspace";

export type DashboardPeriodPreset = "7d" | "30d" | "90d" | "ytd" | "custom";

export type DashboardPeriodSelection = {
  preset: DashboardPeriodPreset;
  startDate: string;
  endDate: string;
  startIso: string;
  endExclusiveIso: string;
  previousStartIso: string;
  previousEndExclusiveIso: string;
  label: string;
  previousLabel: string;
  days: number;
};

export type DashboardPeriodRevenue = {
  currency: string;
  current: number;
  previous: number;
  changePercent: number | null;
};

export type DashboardRevenuePoint = {
  date: string;
  value: number;
};

export type DashboardPeriodSource = {
  source: string;
  leads: number;
  qualified: number;
  conversionRate: number | null;
};

export type DashboardPeriodAnalytics = {
  period: DashboardPeriodSelection;
  available: {
    leads: boolean;
    revenue: boolean;
    enrollments: boolean;
  };
  revenue: DashboardPeriodRevenue[];
  primaryCurrency: string | null;
  revenueSeries: DashboardRevenuePoint[];
  leads: {
    current: number;
    previous: number;
    changePercent: number | null;
    qualified: number;
    conversionRate: number | null;
  };
  enrollments: {
    current: number;
    previous: number;
    changePercent: number | null;
  };
  sources: DashboardPeriodSource[];
};

type PeriodInput = {
  period?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

type LeadRow = {
  created_at: string | null;
  current_stage: string | null;
  first_touch_source: string | null;
};

type PaymentRow = {
  amount: number | string | null;
  currency: string | null;
  payment_kind: string | null;
  status: string | null;
  paid_at: string | null;
};

type StageHistoryRow = {
  lead_id: string | null;
  changed_at: string | null;
  to_stage: string | null;
};

const QUALIFIED_STAGES = new Set([
  "qualified",
  "high_intent",
  "payment_pending",
  "enrolled",
]);

export function resolveDashboardPeriod(input: PeriodInput = {}): DashboardPeriodSelection {
  const requested = scalar(input.period).toLowerCase();
  const today = utcStartOfDay(new Date());
  const tomorrow = addUtcDays(today, 1);

  let preset: DashboardPeriodPreset =
    requested === "7d" || requested === "30d" || requested === "90d" || requested === "ytd"
      ? requested
      : requested === "custom"
        ? "custom"
        : "30d";

  let start = addUtcDays(today, -29);
  let endExclusive = tomorrow;

  if (preset === "7d") start = addUtcDays(today, -6);
  if (preset === "90d") start = addUtcDays(today, -89);
  if (preset === "ytd") start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  if (preset === "custom") {
    const parsedFrom = parseDateOnly(scalar(input.from));
    const parsedTo = parseDateOnly(scalar(input.to));

    if (parsedFrom && parsedTo && parsedFrom.getTime() <= parsedTo.getTime()) {
      const cappedTo = parsedTo.getTime() > today.getTime() ? today : parsedTo;
      const earliestAllowed = addUtcDays(cappedTo, -365);
      start = parsedFrom.getTime() < earliestAllowed.getTime() ? earliestAllowed : parsedFrom;
      endExclusive = addUtcDays(cappedTo, 1);
    } else {
      preset = "30d";
    }
  }

  const days = Math.max(1, Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000));
  const previousEndExclusive = start;
  const previousStart = addUtcDays(previousEndExclusive, -days);
  const endInclusive = addUtcDays(endExclusive, -1);
  const previousEndInclusive = addUtcDays(previousEndExclusive, -1);

  return {
    preset,
    startDate: toDateOnly(start),
    endDate: toDateOnly(endInclusive),
    startIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
    previousStartIso: previousStart.toISOString(),
    previousEndExclusiveIso: previousEndExclusive.toISOString(),
    label: formatRangeLabel(start, endInclusive),
    previousLabel: formatRangeLabel(previousStart, previousEndInclusive),
    days,
  };
}

export async function getDashboardPeriodAnalytics(
  input: PeriodInput = {},
): Promise<DashboardPeriodAnalytics> {
  const period = resolveDashboardPeriod(input);
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();

  if (auth.error || !auth.data.user) {
    throw new Error("Unable to authenticate dashboard period analytics.");
  }

  const organizationId = await requireCurrentOrganizationId(supabase, auth.data.user.id);

  const [leadResult, paymentResult, stageResult] = await Promise.all([
    supabase
      .from("leads")
      .select("created_at,current_stage,first_touch_source")
      .eq("organization_id", organizationId)
      .neq("status", "archived")
      .gte("created_at", period.previousStartIso)
      .lt("created_at", period.endExclusiveIso),
    supabase
      .from("payments")
      .select("amount,currency,payment_kind,status,paid_at")
      .eq("organization_id", organizationId)
      .gte("paid_at", period.previousStartIso)
      .lt("paid_at", period.endExclusiveIso)
      .in("status", ["paid", "refunded"]),
    supabase
      .from("lead_stage_history")
      .select("lead_id,changed_at,to_stage,lead:leads!inner(organization_id)")
      .eq("lead.organization_id", organizationId)
      .eq("to_stage", "enrolled")
      .gte("changed_at", period.previousStartIso)
      .lt("changed_at", period.endExclusiveIso),
  ]);

  const leads = (leadResult.data ?? []) as LeadRow[];
  const payments = (paymentResult.data ?? []) as PaymentRow[];
  const stageRows = (stageResult.data ?? []) as unknown as StageHistoryRow[];

  const currentLeads = leads.filter((row) => inCurrentPeriod(row.created_at, period));
  const previousLeads = leads.filter((row) => inPreviousPeriod(row.created_at, period));
  const qualifiedCurrent = currentLeads.filter((row) => QUALIFIED_STAGES.has(String(row.current_stage ?? ""))).length;

  const currentEnrollmentIds = uniqueLeadIds(
    stageRows.filter((row) => inCurrentPeriod(row.changed_at, period)),
  );
  const previousEnrollmentIds = uniqueLeadIds(
    stageRows.filter((row) => inPreviousPeriod(row.changed_at, period)),
  );

  const revenueMap = new Map<string, { current: number; previous: number }>();

  for (const payment of payments) {
    const currency = normalizeCurrency(payment.currency);
    if (!currency || !payment.paid_at) continue;

    const bucket = revenueMap.get(currency) ?? { current: 0, previous: 0 };
    const signed = signedRevenue(payment);

    if (inCurrentPeriod(payment.paid_at, period)) bucket.current += signed;
    if (inPreviousPeriod(payment.paid_at, period)) bucket.previous += signed;
    revenueMap.set(currency, bucket);
  }

  const revenue: DashboardPeriodRevenue[] = [...revenueMap.entries()]
    .map(([currency, values]) => ({
      currency,
      current: roundMoney(values.current),
      previous: roundMoney(values.previous),
      changePercent: percentChange(values.current, values.previous),
    }))
    .sort((a, b) => Math.abs(b.current) - Math.abs(a.current) || a.currency.localeCompare(b.currency));

  const primaryCurrency = revenue.find((row) => row.current !== 0)?.currency ?? revenue[0]?.currency ?? null;
  const revenueSeries = primaryCurrency
    ? buildRevenueSeries(payments, primaryCurrency, period)
    : [];

  return {
    period,
    available: {
      leads: !leadResult.error,
      revenue: !paymentResult.error,
      enrollments: !stageResult.error,
    },
    revenue,
    primaryCurrency,
    revenueSeries,
    leads: {
      current: currentLeads.length,
      previous: previousLeads.length,
      changePercent: percentChange(currentLeads.length, previousLeads.length),
      qualified: qualifiedCurrent,
      conversionRate: currentLeads.length
        ? Math.round((qualifiedCurrent / currentLeads.length) * 1000) / 10
        : null,
    },
    enrollments: {
      current: currentEnrollmentIds.size,
      previous: previousEnrollmentIds.size,
      changePercent: percentChange(currentEnrollmentIds.size, previousEnrollmentIds.size),
    },
    sources: buildSources(currentLeads),
  };
}

function buildSources(rows: LeadRow[]): DashboardPeriodSource[] {
  const grouped = new Map<string, { leads: number; qualified: number }>();

  for (const row of rows) {
    const source = String(row.first_touch_source ?? "").trim() || "Unknown";
    const bucket = grouped.get(source) ?? { leads: 0, qualified: 0 };
    bucket.leads += 1;
    if (QUALIFIED_STAGES.has(String(row.current_stage ?? ""))) bucket.qualified += 1;
    grouped.set(source, bucket);
  }

  return [...grouped.entries()]
    .map(([source, values]) => ({
      source,
      leads: values.leads,
      qualified: values.qualified,
      conversionRate: values.leads
        ? Math.round((values.qualified / values.leads) * 1000) / 10
        : null,
    }))
    .sort((a, b) => b.leads - a.leads || b.qualified - a.qualified || a.source.localeCompare(b.source))
    .slice(0, 5);
}

function buildRevenueSeries(
  payments: PaymentRow[],
  currency: string,
  period: DashboardPeriodSelection,
): DashboardRevenuePoint[] {
  const buckets = new Map<string, number>();
  const start = new Date(period.startIso);

  for (let index = 0; index < period.days; index += 1) {
    buckets.set(toDateOnly(addUtcDays(start, index)), 0);
  }

  for (const payment of payments) {
    if (!payment.paid_at || normalizeCurrency(payment.currency) !== currency) continue;
    if (!inCurrentPeriod(payment.paid_at, period)) continue;
    const date = toDateOnly(new Date(payment.paid_at));
    buckets.set(date, (buckets.get(date) ?? 0) + signedRevenue(payment));
  }

  return [...buckets.entries()].map(([date, value]) => ({
    date,
    value: roundMoney(value),
  }));
}

function uniqueLeadIds(rows: StageHistoryRow[]) {
  return new Set(rows.map((row) => row.lead_id).filter((value): value is string => Boolean(value)));
}

function signedRevenue(payment: PaymentRow) {
  const amount = Number(payment.amount ?? 0);
  if (!Number.isFinite(amount)) return 0;
  const kind = String(payment.payment_kind ?? "");
  const status = String(payment.status ?? "");

  if (kind === "refund" && (status === "paid" || status === "refunded")) return -amount;
  if (kind !== "refund" && status === "paid") return amount;
  return 0;
}

function inCurrentPeriod(value: string | null, period: DashboardPeriodSelection) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(period.startIso).getTime() && time < new Date(period.endExclusiveIso).getTime();
}

function inPreviousPeriod(value: string | null, period: DashboardPeriodSelection) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(period.previousStartIso).getTime() && time < new Date(period.previousEndExclusiveIso).getTime();
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcStartOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatRangeLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: start.getUTCFullYear() === end.getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  });
  const endFormatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(start)} – ${endFormatter.format(end)}`;
}

function normalizeCurrency(value: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
