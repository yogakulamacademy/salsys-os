import { createClient } from "@/lib/supabase/server";

async function getCurrentOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "Unable to resolve current organization: user is not authenticated.",
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(2);

  if (membershipError) {
    throw new Error(
      `Unable to resolve current organization: ${membershipError.message}`,
    );
  }

  if (!memberships || memberships.length === 0) {
    throw new Error("No active organization membership was found.");
  }

  if (memberships.length > 1) {
    throw new Error(
      "Multiple active organization memberships were found. Workspace selection is required.",
    );
  }

  return String(memberships[0].organization_id);
}

export type RevenueCurrencySummary = {
  currency: string;
  pipeline: number;
  weighted: number;
  actual: number;
  gross: number;
  refunds: number;
  outstanding: number;
  balanceLeads: number;
  successfulPayments: number;
  opportunities: number;
};

type RpcRevenueCurrencySummary = {
  currency?: string | null;
  pipeline?: number | string | null;
  weighted?: number | string | null;
  actual?: number | string | null;
  gross?: number | string | null;
  refunds?: number | string | null;
  outstanding?: number | string | null;
  balanceLeads?: number | string | null;
  successfulPayments?: number | string | null;
  opportunities?: number | string | null;
};

export type RevenueStageRow = {
  currency: string;
  current_stage: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
  net_collected: number | string | null;
};

export type RevenueMonthlyRow = {
  forecast_month: string;
  currency: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
  net_collected: number | string | null;
};

export type RevenueSourceRow = {
  source: string;
  currency: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
  net_collected: number | string | null;
};

export type RevenueLocationRow = {
  location: string;
  currency: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
  net_collected: number | string | null;
};

export type ActualRevenueMonthlyRow = {
  revenue_month: string;
  currency: string;
  gross_received: number | string | null;
  refunds: number | string | null;
  actual_revenue: number | string | null;
  successful_payments: number | string | null;
};

export type RevenueOpportunityRow = {
  id: string;
  lead_code: string;
  lead_name: string | null;
  current_stage: string;
  preferred_location: string | null;
  first_touch_source: string | null;
  expected_close_date?: string | null;
  potential_value: number | string | null;
  currency: string | null;
  weighted_value: number | string | null;
  net_paid: number | string | null;
};

export type RevenueWorkspace = {
  totalsByCurrency: RevenueCurrencySummary[];
  unvaluedLeads: number;
  stages: RevenueStageRow[];
  monthly: RevenueMonthlyRow[];
  sources: RevenueSourceRow[];
  locations: RevenueLocationRow[];
  actualMonthly: ActualRevenueMonthlyRow[];
  topOpportunities: RevenueOpportunityRow[];
  closingThisMonth: RevenueOpportunityRow[];
  fallback: boolean;
  warning: string | null;
};

type ForecastRow = {
  id: string;
  lead_code: string;
  lead_name: string | null;
  current_stage: string;
  preferred_location: string | null;
  expected_close_date: string | null;
  first_touch_source: string | null;
  potential_value: number | string | null;
  currency: string | null;
  weighted_value: number | string | null;
  forecast_month: string | null;
};

type StageRow = {
  currency: string;
  current_stage: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
};

type MonthlyRow = {
  forecast_month: string;
  currency: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
};

type SourceRow = {
  source: string;
  currency: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
};

type LocationRow = {
  location: string;
  currency: string;
  lead_count: number | string;
  pipeline_value: number | string | null;
  weighted_forecast: number | string | null;
};

type ActualRevenueRow = {
  currency: string;
  gross_received: number | string | null;
  refunds: number | string | null;
  actual_revenue: number | string | null;
  successful_payments: number | string | null;
};

type LeadRevenueStatusRow = {
  lead_id: string;
  net_paid: number | string | null;
};

type OutstandingRevenueRow = {
  currency: string;
  leads_with_balance: number | string | null;
  outstanding_revenue: number | string | null;
};

type RpcPayload = {
  totals_by_currency?: RpcRevenueCurrencySummary[];
  unvalued_leads?: number | string | null;
  stages?: RevenueStageRow[];
  monthly?: RevenueMonthlyRow[];
  sources?: RevenueSourceRow[];
  locations?: RevenueLocationRow[];
  actual_monthly?: ActualRevenueMonthlyRow[];
  top_opportunities?: RevenueOpportunityRow[];
  closing_this_month?: RevenueOpportunityRow[];
};

export async function getRevenueWorkspace(
  currentMonth: string,
): Promise<RevenueWorkspace> {
  const supabase = await createClient();

  const organizationId = await getCurrentOrganizationId(supabase);

  const { data, error } = await supabase.rpc("get_revenue_workspace", {
    p_current_month: currentMonth,
    p_organization_id: organizationId,
  });

  if (!error) {
    const payload = (data ?? {}) as RpcPayload;

    return {
      totalsByCurrency: normalizeCurrencySummaries(payload.totals_by_currency),

      unvaluedLeads: toNumber(payload.unvalued_leads),

      stages: arrayValue(payload.stages),

      monthly: arrayValue(payload.monthly),

      sources: arrayValue(payload.sources),

      locations: arrayValue(payload.locations),

      actualMonthly: arrayValue(payload.actual_monthly),

      topOpportunities: arrayValue(payload.top_opportunities),

      closingThisMonth: arrayValue(payload.closing_this_month),

      fallback: false,
      warning: null,
    };
  }

  const fallback = await getLegacyRevenueWorkspace(
    supabase,
    currentMonth,
    organizationId,
  );

  return {
    ...fallback,
    fallback: true,
    warning: `Optimized Revenue read model unavailable: ${error.message}`,
  };
}

async function getLegacyRevenueWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentMonth: string,
  organizationId: string,
): Promise<Omit<RevenueWorkspace, "fallback" | "warning">> {
  const [
    forecastResult,
    stageResult,
    monthlyResult,
    sourceResult,
    locationResult,
    actualRevenueResult,
    actualMonthlyResult,
    leadRevenueStatusResult,
    outstandingResult,
  ] = await Promise.all([
    supabase
      .from("v_revenue_forecast")
      .select(
        `
        id,
        lead_code,
        lead_name,
        current_stage,
        preferred_location,
        expected_close_date,
        first_touch_source,
        potential_value,
        currency,
        weighted_value,
        forecast_month
      `,
      )
      .eq("organization_id", organizationId)
      .order("created_at", {
        ascending: false,
      }),

    supabase
      .from("v_revenue_forecast_by_stage")
      .select(`
        currency,
        current_stage,
        lead_count,
        pipeline_value,
        weighted_forecast
      `)
      .eq("organization_id", organizationId),

    supabase
      .from("v_revenue_forecast_monthly")
      .select(
        `
        forecast_month,
        currency,
        lead_count,
        pipeline_value,
        weighted_forecast
      `,
      )
      .eq("organization_id", organizationId)
      .order("forecast_month", {
        ascending: true,
      }),

    supabase
      .from("v_revenue_forecast_by_source")
      .select(`
        source,
        currency,
        lead_count,
        pipeline_value,
        weighted_forecast
      `)
      .eq("organization_id", organizationId),

    supabase
      .from("v_revenue_forecast_by_location")
      .select(`
        location,
        currency,
        lead_count,
        pipeline_value,
        weighted_forecast
      `)
      .eq("organization_id", organizationId),

    supabase
      .from("v_actual_revenue_by_currency")
      .select(`
        currency,
        gross_received,
        refunds,
        actual_revenue,
        successful_payments
      `)
      .eq("organization_id", organizationId),

    supabase
      .from("v_actual_revenue_monthly")
      .select(
        `
        revenue_month,
        currency,
        gross_received,
        refunds,
        actual_revenue,
        successful_payments
      `,
      )
      .eq("organization_id", organizationId)
      .order("revenue_month", {
        ascending: true,
      }),

    supabase
      .from("v_lead_revenue_status")
      .select(`
        lead_id,
        net_paid
      `)
      .eq("organization_id", organizationId),

    supabase
      .from("v_outstanding_revenue_by_currency")
      .select(`
        currency,
        leads_with_balance,
        outstanding_revenue
      `)
      .eq("organization_id", organizationId),
  ]);

  const errors = [
    forecastResult.error,
    stageResult.error,
    monthlyResult.error,
    sourceResult.error,
    locationResult.error,
    actualRevenueResult.error,
    actualMonthlyResult.error,
    leadRevenueStatusResult.error,
    outstandingResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(
      `Unable to load revenue workspace: ${errors
        .map((item) => item?.message)
        .join(" | ")}`,
    );
  }

  const forecasts = (forecastResult.data ?? []) as ForecastRow[];

  const stages = (stageResult.data ?? []) as StageRow[];

  const monthly = (monthlyResult.data ?? []) as MonthlyRow[];

  const sources = (sourceResult.data ?? []) as SourceRow[];

  const locations = (locationResult.data ?? []) as LocationRow[];

  const actualRevenue = (actualRevenueResult.data ?? []) as ActualRevenueRow[];

  const actualMonthly = (actualMonthlyResult.data ??
    []) as ActualRevenueMonthlyRow[];

  const leadRevenueStatus = (leadRevenueStatusResult.data ??
    []) as LeadRevenueStatusRow[];

  const outstanding = (outstandingResult.data ?? []) as OutstandingRevenueRow[];

  const paymentByLead = new Map<string, LeadRevenueStatusRow>();

  for (const row of leadRevenueStatus) {
    paymentByLead.set(row.lead_id, row);
  }

  const actualByCurrency = new Map<string, ActualRevenueRow>();

  for (const row of actualRevenue) {
    actualByCurrency.set(normalizeCurrency(row.currency), row);
  }

  const outstandingByCurrency = new Map<string, OutstandingRevenueRow>();

  for (const row of outstanding) {
    outstandingByCurrency.set(normalizeCurrency(row.currency), row);
  }

  const currencies = Array.from(
    new Set(
      [
        ...forecasts.map((row) => normalizeCurrency(row.currency)),

        ...actualRevenue.map((row) => normalizeCurrency(row.currency)),

        ...outstanding.map((row) => normalizeCurrency(row.currency)),

        ...actualMonthly.map((row) => normalizeCurrency(row.currency)),
      ].filter(Boolean),
    ),
  );

  if (!currencies.includes("INR")) {
    currencies.unshift("INR");
  }

  if (!currencies.includes("USD")) {
    currencies.push("USD");
  }

  const closedStages = new Set([
    "enrolled",
    "lost",
    "unqualified",
    "duplicate",
  ]);

  const netPaidForLead = (leadId: string) =>
    toNumber(paymentByLead.get(leadId)?.net_paid);

  const netCollected = (rows: ForecastRow[]) =>
    sum(rows.map((row) => netPaidForLead(row.id)));

  const totalsByCurrency = currencies.map(
    (currency): RevenueCurrencySummary => {
      const rows = forecasts.filter(
        (row) => normalizeCurrency(row.currency) === currency,
      );

      const valuedRows = rows.filter(
        (row) => toNumber(row.potential_value) > 0,
      );

      const openRows = valuedRows.filter(
        (row) => !closedStages.has(String(row.current_stage)),
      );

      const actual = actualByCurrency.get(currency);

      const balance = outstandingByCurrency.get(currency);

      return {
        currency,

        pipeline: sum(openRows.map((row) => row.potential_value)),

        weighted: sum(openRows.map((row) => row.weighted_value)),

        actual: toNumber(actual?.actual_revenue),

        gross: toNumber(actual?.gross_received),

        refunds: toNumber(actual?.refunds),

        outstanding: toNumber(balance?.outstanding_revenue),

        balanceLeads: toNumber(balance?.leads_with_balance),

        successfulPayments: toNumber(actual?.successful_payments),

        opportunities: openRows.length,
      };
    },
  );

  const unvaluedLeads = forecasts.filter(
    (row) =>
      !closedStages.has(String(row.current_stage)) &&
      toNumber(row.potential_value) <= 0,
  ).length;

  const topOpportunities = [...forecasts]
    .filter(
      (row) =>
        !closedStages.has(String(row.current_stage)) &&
        toNumber(row.potential_value) > 0,
    )
    .sort((a, b) => toNumber(b.weighted_value) - toNumber(a.weighted_value))
    .slice(0, 10)
    .map(
      (row): RevenueOpportunityRow => ({
        ...row,
        net_paid: netPaidForLead(row.id),
      }),
    );

  const closingThisMonth = forecasts
    .filter((row) => {
      if (!row.expected_close_date) {
        return false;
      }

      if (closedStages.has(String(row.current_stage))) {
        return false;
      }

      return row.expected_close_date.slice(0, 7) === currentMonth;
    })
    .sort((a, b) => toNumber(b.weighted_value) - toNumber(a.weighted_value))
    .map(
      (row): RevenueOpportunityRow => ({
        ...row,
        net_paid: netPaidForLead(row.id),
      }),
    );

  const stageRows: RevenueStageRow[] = stages.map((row) => {
    const currency = normalizeCurrency(row.currency);

    return {
      ...row,
      net_collected: netCollected(
        forecasts.filter(
          (item) =>
            normalizeCurrency(item.currency) === currency &&
            item.current_stage === row.current_stage,
        ),
      ),
    };
  });

  const monthlyRows: RevenueMonthlyRow[] = monthly.map((row) => {
    const currency = normalizeCurrency(row.currency);

    return {
      ...row,
      net_collected: netCollected(
        forecasts.filter(
          (item) =>
            normalizeCurrency(item.currency) === currency &&
            item.forecast_month === row.forecast_month,
        ),
      ),
    };
  });

  const sourceRows: RevenueSourceRow[] = sources.map((row) => {
    const currency = normalizeCurrency(row.currency);

    const source = row.source || "Unknown";

    return {
      ...row,
      net_collected: netCollected(
        forecasts.filter(
          (item) =>
            normalizeCurrency(item.currency) === currency &&
            (item.first_touch_source || "Unknown") === source,
        ),
      ),
    };
  });

  const locationRows: RevenueLocationRow[] = locations.map((row) => {
    const currency = normalizeCurrency(row.currency);

    const location = row.location || "Unknown";

    return {
      ...row,
      net_collected: netCollected(
        forecasts.filter(
          (item) =>
            normalizeCurrency(item.currency) === currency &&
            (item.preferred_location || "Unknown") === location,
        ),
      ),
    };
  });

  return {
    totalsByCurrency,
    unvaluedLeads,
    stages: stageRows,
    monthly: monthlyRows,
    sources: sourceRows,
    locations: locationRows,
    actualMonthly,
    topOpportunities,
    closingThisMonth,
  };
}

function arrayValue<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeCurrency(value: string | null | undefined) {
  return String(value || "").toUpperCase();
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function sum(values: unknown[]): number {
  return values.reduce<number>((total, value) => total + toNumber(value), 0);
}

function normalizeCurrencySummaries(
  rows: RpcRevenueCurrencySummary[] | undefined,
): RevenueCurrencySummary[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    currency: normalizeCurrency(row.currency) || "INR",
    pipeline: toNumber(row.pipeline),
    weighted: toNumber(row.weighted),
    actual: toNumber(row.actual),
    gross: toNumber(row.gross),
    refunds: toNumber(row.refunds),
    outstanding: toNumber(row.outstanding),
    balanceLeads: toNumber(row.balanceLeads),
    successfulPayments: toNumber(row.successfulPayments),
    opportunities: toNumber(row.opportunities),
  }));
}
