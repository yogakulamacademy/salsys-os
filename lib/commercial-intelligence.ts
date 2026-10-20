import type {
  AttributionMetricsRow,
  AttributionPerformanceRow,
  AttributionWorkspacePayload,
} from "@/components/attribution-workspace";
import type { FunnelWorkspace } from "@/lib/funnel-data";
import type {
  RevenueCurrencySummary,
  RevenueSourceRow,
  RevenueWorkspace,
} from "@/lib/revenue-data";

export type IntelligenceTone = "positive" | "info" | "watch" | "risk";

export type IntelligenceSignal = {
  label: string;
  value: string;
  detail: string;
  tone: IntelligenceTone;
};

export type IntelligenceAction = {
  title: string;
  detail: string;
  href?: string;
  tone: IntelligenceTone;
};

export type CommercialIntelligenceBrief = {
  title: string;
  summary: string;
  readinessLabel: string;
  readinessScore: number;
  readinessDetail: string;
  signals: IntelligenceSignal[];
  actions: IntelligenceAction[];
  methodology: string;
};

export type RevenueAttributionReconciliation = {
  status: "aligned" | "review" | "insufficient";
  headline: string;
  detail: string;
  currencies: Array<{
    currency: string;
    revenueActual: number;
    attributedRevenue: number;
    difference: number;
    aligned: boolean;
  }>;
};

type UnknownRecord = Record<string, unknown>;

type FunnelTransition = {
  label: string;
  from: number;
  to: number;
  rate: number;
};

export function buildFunnelIntelligence(
  workspace: FunnelWorkspace,
): CommercialIntelligenceBrief {
  const overview = asRecord(workspace.funnel.overview);
  const repeat = asRecord(workspace.funnel.repeat);
  const sources = workspace.funnel.sources.map(asRecord);

  const sessions = numberValue(overview.sessions);
  const leads = numberValue(overview.leads);
  const qualified = numberValue(overview.qualified_leads);
  const enrolled = numberValue(overview.enrolled_leads);
  const formStarts = numberValue(overview.form_start_visitors);
  const formSubmits = numberValue(overview.form_submit_visitors);
  const reengaged = numberValue(repeat.reengaged_leads);

  const transitions: FunnelTransition[] = [
    transition("Session → lead", sessions, leads),
    transition("Lead → qualified", leads, qualified),
    transition("Qualified → enrolled", qualified, enrolled),
    transition("Form start → submit", formStarts, formSubmits),
  ].filter((item) => item.from > 0);

  const largestLeak = [...transitions].sort((a, b) => a.rate - b.rate)[0] ?? null;
  const bestSource = selectBestObservedSource(sources);
  const formCompletion = ratio(formSubmits, formStarts);

  const evidenceChecks = [
    sessions > 0,
    leads > 0,
    sources.length > 0,
    !workspace.fallback,
  ];
  const readinessScore = percentage(
    evidenceChecks.filter(Boolean).length,
    evidenceChecks.length,
  );

  const signals: IntelligenceSignal[] = [
    {
      label: "Largest observed leak",
      value: largestLeak ? formatPercent(largestLeak.rate) : "Not enough data",
      detail: largestLeak
        ? `${largestLeak.label}: ${formatInteger(largestLeak.from)} → ${formatInteger(largestLeak.to)}.`
        : "No valid funnel transition has a non-zero denominator yet.",
      tone:
        largestLeak && largestLeak.rate < 0.25
          ? "risk"
          : largestLeak
            ? "watch"
            : "info",
    },
    {
      label: "Form completion",
      value: formStarts > 0 ? formatPercent(formCompletion) : "Not observed",
      detail:
        formStarts > 0
          ? `${formatInteger(formSubmits)} submitters from ${formatInteger(formStarts)} visitors who started a form.`
          : "No form-start denominator is available for the current 30-day window.",
      tone:
        formStarts === 0
          ? "info"
          : formCompletion >= 0.5
            ? "positive"
            : "watch",
    },
    {
      label: "Best observed source",
      value: bestSource?.name ?? "Not enough data",
      detail:
        bestSource?.detail ??
        "Source rows are not sufficient to identify an observed acquisition leader.",
      tone: bestSource ? "positive" : "info",
    },
    {
      label: "Re-engagement pool",
      value: formatInteger(reengaged),
      detail:
        reengaged > 0
          ? "Previously known leads have returned and can be prioritized with current intent evidence."
          : "No re-engaged leads are visible in the current funnel evidence.",
      tone: reengaged > 0 ? "positive" : "info",
    },
  ];

  const actions: IntelligenceAction[] = [];

  if (largestLeak) {
    actions.push({
      title: `Investigate ${largestLeak.label}`,
      detail:
        "This is the lowest observed conversion step with a valid denominator. Segment it by source, landing page, device/country and sales stage before changing spend or messaging.",
      href: "/funnel",
      tone: largestLeak.rate < 0.25 ? "risk" : "watch",
    });
  }

  if (formStarts > 0 && formSubmits < formStarts) {
    actions.push({
      title: "Reduce form abandonment",
      detail: `${formatInteger(formStarts - formSubmits)} observed form starters did not reach a tracked submit. Validate UX friction and tracking integrity separately before assuming user drop-off.`,
      href: "/tracking",
      tone: "watch",
    });
  }

  if (reengaged > 0) {
    actions.push({
      title: "Work the re-engaged queue",
      detail:
        "Returning leads already have historical context. Prioritize them by current intent and recent conversation state rather than treating them as new traffic.",
      href: "/re-engaged",
      tone: "positive",
    });
  }

  if (workspace.fallback) {
    actions.unshift({
      title: "Restore the optimized funnel read model",
      detail:
        "The page is using the reduced compatibility path. Treat funnel conclusions as incomplete until the optimized tenant-scoped read is healthy again.",
      href: "/system-health",
      tone: "risk",
    });
  }

  return {
    title: "Funnel intelligence",
    summary:
      largestLeak && bestSource
        ? `${largestLeak.label} is the weakest observed step, while ${bestSource.name} is currently the strongest observed source signal.`
        : "SalsysOS is evaluating conversion leakage, form completion, source quality and re-engagement from observed funnel evidence.",
    readinessLabel: "Evidence readiness",
    readinessScore,
    readinessDetail:
      "Readiness measures whether sessions, leads, source breakdowns and the optimized read model are available. It is not a conversion probability.",
    signals,
    actions: actions.slice(0, 4),
    methodology:
      "Deterministic decision support from observed 30-day funnel facts. No synthetic conversions are created, and unavailable behavior is treated as unknown rather than negative intent.",
  };
}

export function buildAttributionIntelligence(
  workspace: AttributionWorkspacePayload,
): CommercialIntelligenceBrief {
  const metrics = new Map(
    workspace.metricsByModel.map((row) => [row.modelName, row]),
  );
  const firstTouch = metrics.get("first_touch") ?? emptyAttributionMetric("first_touch");
  const lastTouch = metrics.get("last_touch") ?? emptyAttributionMetric("last_touch");
  const leadCreation = metrics.get("lead_creation") ?? emptyAttributionMetric("lead_creation");

  const firstPerformance = workspace.performanceRows.filter(
    (row) => row.modelName === "first_touch" && !isUnknownValue(row.value),
  );
  const bestSource = selectBestAttributionSource(firstPerformance);
  const unknownFirst = workspace.performanceRows.find(
    (row) => row.modelName === "first_touch" && isUnknownValue(row.value),
  );
  const disagreement = selectLargestModelDisagreement(workspace.comparison);

  const coverageValues = [
    firstTouch.coverage,
    leadCreation.coverage,
    lastTouch.coverage,
  ].filter((value) => Number.isFinite(value));
  const readinessScore = clamp(
    coverageValues.length > 0
      ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length
      : 0,
    0,
    100,
  );

  const unknownRevenue = formatDualCurrency(
    unknownFirst?.revenueInr ?? 0,
    unknownFirst?.revenueUsd ?? 0,
  );

  const signals: IntelligenceSignal[] = [
    {
      label: "First-touch coverage",
      value: formatPercent100(firstTouch.coverage),
      detail: `${formatInteger(firstTouch.known)} of ${formatInteger(firstTouch.total)} filtered leads have a known acquisition source.`,
      tone: coverageTone(firstTouch.coverage),
    },
    {
      label: "Last-marketing coverage",
      value: formatPercent100(lastTouch.coverage),
      detail:
        "This depends on the canonical last-marketing touchpoint pointer; missing pointers remain Unknown by design.",
      tone: coverageTone(lastTouch.coverage),
    },
    {
      label: "Best observed acquisition source",
      value: bestSource?.value ?? "Not enough data",
      detail:
        bestSource?.detail ??
        "There is not enough known first-touch performance evidence to rank acquisition sources.",
      tone: bestSource ? "positive" : "info",
    },
    {
      label: "Unattributed first-touch revenue",
      value: unknownRevenue,
      detail:
        unknownFirst && (unknownFirst.revenueInr !== 0 || unknownFirst.revenueUsd !== 0)
          ? "Real payment revenue exists on leads whose first-touch source is still Unknown."
          : "No unattributed first-touch payment revenue is visible in the filtered workspace.",
      tone:
        unknownFirst && (unknownFirst.revenueInr !== 0 || unknownFirst.revenueUsd !== 0)
          ? "risk"
          : "positive",
    },
  ];

  const actions: IntelligenceAction[] = [];

  if (firstTouch.unknown > 0) {
    actions.push({
      title: "Reduce unknown acquisition",
      detail: `${formatInteger(firstTouch.unknown)} filtered leads do not have a known first-touch source. Repair source capture/identity lineage before using source ROI for budget decisions.`,
      href: "/tracking",
      tone: "risk",
    });
  }

  if (lastTouch.unknown > 0) {
    actions.push({
      title: "Improve last-marketing lineage",
      detail: `${formatInteger(lastTouch.unknown)} filtered leads lack a canonical last-marketing touch. Keep this Unknown rather than backfilling from unrelated CRM activity.`,
      href: "/tracking",
      tone: "watch",
    });
  }

  if (bestSource) {
    actions.push({
      title: `Validate ${bestSource.value} before scaling`,
      detail:
        "It leads the observed acquisition outcome count. Compare spend, lead quality, refund rate and sample size before reallocating budget.",
      href: "/campaigns",
      tone: "positive",
    });
  }

  if (disagreement) {
    actions.push({
      title: `Inspect model disagreement around ${disagreement.value}`,
      detail:
        "First touch, lead creation, last marketing touch and current channel intentionally answer different questions. Large count differences should be explained by real journey changes, not silently collapsed into one source.",
      href: "/attribution",
      tone: "info",
    });
  }

  return {
    title: "Attribution intelligence",
    summary:
      bestSource
        ? `${bestSource.value} currently leads observed acquisition outcomes; first-touch coverage is ${formatPercent100(firstTouch.coverage)} and canonical last-marketing coverage is ${formatPercent100(lastTouch.coverage)}.`
        : `First-touch coverage is ${formatPercent100(firstTouch.coverage)}. SalsysOS is preserving Unknown values instead of inventing attribution.` ,
    readinessLabel: "Attribution evidence",
    readinessScore,
    readinessDetail:
      "The score is the average observed coverage of first touch, lead creation and last marketing touch. It measures data completeness, not causal certainty.",
    signals,
    actions: actions.slice(0, 4),
    methodology:
      "Attribution remains multi-model and lineage-based: first touch, lead creation, last marketing touch and current channel stay distinct. Payment revenue is never reassigned just to improve coverage.",
  };
}

export function buildRevenueIntelligence(
  workspace: RevenueWorkspace,
  now = new Date(),
): CommercialIntelligenceBrief {
  const opportunityCount = workspace.totalsByCurrency.reduce(
    (sum, row) => sum + row.opportunities,
    0,
  );
  const valuedCoverage = ratio(
    opportunityCount,
    opportunityCount + workspace.unvaluedLeads,
  );
  const top = workspace.topOpportunities;
  const dateCoverage = ratio(
    top.filter((row) => Boolean(row.expected_close_date)).length,
    top.length,
  );
  const sourceCoverage = ratio(
    top.filter((row) => !isUnknownValue(row.first_touch_source)).length,
    top.length,
  );
  const readinessParts = [valuedCoverage, dateCoverage, sourceCoverage];
  const readinessScore = clamp(
    (readinessParts.reduce((sum, value) => sum + value, 0) /
      readinessParts.length) *
      100 -
      (workspace.fallback ? 25 : 0),
    0,
    100,
  );

  const overdue = top.filter((row) => {
    if (!row.expected_close_date) return false;
    const date = new Date(`${row.expected_close_date}T23:59:59Z`);
    return Number.isFinite(date.getTime()) && date.getTime() < now.getTime();
  });

  const refundRows = workspace.totalsByCurrency
    .filter((row) => row.gross > 0 || row.refunds > 0)
    .map((row) => ({
      currency: row.currency,
      rate: ratio(Math.abs(row.refunds), Math.abs(row.gross)),
    }));
  const highestRefund = [...refundRows].sort((a, b) => b.rate - a.rate)[0] ?? null;
  const concentration = selectHighestSourceConcentration(
    workspace.sources,
    workspace.totalsByCurrency,
  );

  const signals: IntelligenceSignal[] = [
    {
      label: "Valued opportunity coverage",
      value:
        opportunityCount + workspace.unvaluedLeads > 0
          ? formatPercent(valuedCoverage)
          : "No open pipeline",
      detail: `${formatInteger(opportunityCount)} valued open opportunities; ${formatInteger(workspace.unvaluedLeads)} open leads have no potential value.`,
      tone:
        workspace.unvaluedLeads === 0
          ? "positive"
          : valuedCoverage >= 0.8
            ? "watch"
            : "risk",
    },
    {
      label: "Top-opportunity close-date coverage",
      value: top.length > 0 ? formatPercent(dateCoverage) : "No opportunities",
      detail: `${formatInteger(top.filter((row) => Boolean(row.expected_close_date)).length)} of ${formatInteger(top.length)} top weighted opportunities have an expected close date.`,
      tone:
        top.length === 0
          ? "info"
          : dateCoverage >= 0.8
            ? "positive"
            : "watch",
    },
    {
      label: "Highest observed refund rate",
      value: highestRefund
        ? `${highestRefund.currency} ${formatPercent(highestRefund.rate)}`
        : "No gross receipts",
      detail:
        highestRefund
          ? "Refund rate is calculated from recorded gross receipts and refunds in the same currency; currencies are never mixed."
          : "No recorded gross receipts are available for a refund-rate denominator.",
      tone:
        highestRefund && highestRefund.rate >= 0.1
          ? "risk"
          : highestRefund && highestRefund.rate > 0
            ? "watch"
            : "positive",
    },
    {
      label: "Pipeline concentration",
      value: concentration
        ? `${concentration.source} · ${formatPercent(concentration.share)}`
        : "Not enough data",
      detail:
        concentration
          ? `${concentration.currency} weighted forecast share for the largest source in that currency.`
          : "No positive weighted source forecast is available for concentration analysis.",
      tone:
        concentration && concentration.share >= 0.5
          ? "watch"
          : concentration
            ? "info"
            : "info",
    },
  ];

  const actions: IntelligenceAction[] = [];

  if (workspace.unvaluedLeads > 0) {
    actions.push({
      title: "Value open opportunities",
      detail: `${formatInteger(workspace.unvaluedLeads)} open leads are excluded from meaningful pipeline sizing until potential value is recorded from real course/accommodation/pricing evidence.`,
      href: "/pipeline",
      tone: "risk",
    });
  }

  if (overdue.length > 0) {
    actions.push({
      title: "Refresh overdue close dates",
      detail: `${formatInteger(overdue.length)} top weighted opportunities have expected close dates in the past. Update them from the real sales situation rather than allowing stale dates to distort monthly forecasting.`,
      href: "/pipeline",
      tone: "watch",
    });
  }

  const outstandingLeads = workspace.totalsByCurrency.reduce(
    (sum, row) => sum + row.balanceLeads,
    0,
  );
  if (outstandingLeads > 0) {
    actions.push({
      title: "Work outstanding balances",
      detail: `${formatInteger(outstandingLeads)} leads have recorded balances. Prioritize according to enrollment/payment state and verified due context, not just amount.`,
      href: "/follow-ups",
      tone: "positive",
    });
  }

  if (concentration && concentration.share >= 0.5) {
    actions.push({
      title: `Review dependence on ${concentration.source}`,
      detail:
        "One source contributes at least half of the weighted forecast within a single currency. Validate source quality, spend efficiency and refund behavior before assuming concentration is healthy.",
      href: "/attribution",
      tone: "watch",
    });
  }

  if (workspace.fallback) {
    actions.unshift({
      title: "Restore the optimized revenue read model",
      detail:
        "The revenue page is using compatibility views. Keep authoritative payment truth, but treat forecast diagnostics as degraded until the optimized tenant-scoped read is healthy.",
      href: "/system-health",
      tone: "risk",
    });
  }

  return {
    title: "Revenue intelligence",
    summary:
      overdue.length > 0
        ? `${formatInteger(overdue.length)} top opportunities have stale close dates; forecast readiness is ${Math.round(readinessScore)}/100 based on observable data completeness.`
        : `Forecast readiness is ${Math.round(readinessScore)}/100 based on valuation, close-date and source completeness.` ,
    readinessLabel: "Forecast readiness",
    readinessScore,
    readinessDetail:
      "This is an explainable operational data-readiness score. It is not a win probability, calibrated prediction or revenue guarantee.",
    signals,
    actions: actions.slice(0, 4),
    methodology:
      "Revenue intelligence uses recorded potential value, stage-weighted forecast fields, payments, refunds, balances and expected close dates. INR and USD remain separate unless an explicit FX layer converts them for display.",
  };
}

export function reconcileRevenueAttribution(
  attribution: AttributionWorkspacePayload,
  revenue: RevenueWorkspace,
): RevenueAttributionReconciliation {
  const firstTouch = attribution.metricsByModel.find(
    (row) => row.modelName === "first_touch",
  );

  if (!firstTouch) {
    return {
      status: "insufficient",
      headline: "Revenue reconciliation needs attribution facts",
      detail:
        "First-touch attribution metrics are unavailable, so SalsysOS will not pretend revenue lineage has been reconciled.",
      currencies: [],
    };
  }

  const actualByCurrency = new Map(
    revenue.totalsByCurrency.map((row) => [row.currency.toUpperCase(), row.actual]),
  );
  const attributed: Record<string, number> = {
    INR: firstTouch.revenueInr,
    USD: firstTouch.revenueUsd,
  };

  const currencies = Array.from(
    new Set([...actualByCurrency.keys(), "INR", "USD"]),
  )
    .map((currency) => {
      const revenueActual = actualByCurrency.get(currency) ?? 0;
      const attributedRevenue = attributed[currency] ?? 0;
      const difference = revenueActual - attributedRevenue;
      const tolerance = Math.max(0.01, Math.abs(revenueActual) * 0.0001);
      return {
        currency,
        revenueActual,
        attributedRevenue,
        difference,
        aligned: Math.abs(difference) <= tolerance,
      };
    })
    .filter(
      (row) => row.revenueActual !== 0 || row.attributedRevenue !== 0,
    );

  if (currencies.length === 0) {
    return {
      status: "insufficient",
      headline: "No payment revenue to reconcile yet",
      detail:
        "The canonical payment and attribution views currently expose no non-zero INR or USD net revenue for comparison.",
      currencies: [],
    };
  }

  const aligned = currencies.every((row) => row.aligned);

  return {
    status: aligned ? "aligned" : "review",
    headline: aligned
      ? "Revenue and attribution payment truth reconcile"
      : "Revenue lineage needs review",
    detail: aligned
      ? "Net payment revenue in the Revenue workspace matches the payment revenue attached to first-touch Attribution facts for each observed currency."
      : "At least one currency differs between Revenue payment truth and Attribution payment totals. Investigate tenant scope, payment/refund semantics and lead lineage before using source ROI as authoritative.",
    currencies,
  };
}

function transition(label: string, from: number, to: number): FunnelTransition {
  return {
    label,
    from,
    to,
    rate: ratio(to, from),
  };
}

function selectBestObservedSource(rows: UnknownRecord[]) {
  const candidates = rows
    .map((row) => {
      const source = textValue(row.source) || "Unknown";
      const medium = textValue(row.medium);
      const sessions = numberValue(row.sessions);
      const linkedLeads = numberValue(row.linked_leads);
      const qualified = numberValue(row.qualified_linked_leads);
      const enrolled = numberValue(row.enrolled_linked_leads);
      return {
        source,
        medium,
        sessions,
        linkedLeads,
        qualified,
        enrolled,
        rate: ratio(linkedLeads, sessions),
      };
    })
    .filter((row) => !isUnknownValue(row.source) && row.sessions > 0)
    .sort(
      (a, b) =>
        b.enrolled - a.enrolled ||
        b.qualified - a.qualified ||
        b.linkedLeads - a.linkedLeads ||
        b.rate - a.rate ||
        b.sessions - a.sessions,
    );

  const best = candidates[0];
  if (!best) return null;

  return {
    name: best.medium ? `${best.source} / ${best.medium}` : best.source,
    detail: `${formatInteger(best.linkedLeads)} linked leads, ${formatInteger(best.qualified)} qualified and ${formatInteger(best.enrolled)} enrolled from ${formatInteger(best.sessions)} observed sessions.`,
  };
}

function selectBestAttributionSource(rows: AttributionPerformanceRow[]) {
  const candidates = [...rows].sort(
    (a, b) =>
      b.enrolled - a.enrolled ||
      b.qualified - a.qualified ||
      b.leads - a.leads ||
      a.value.localeCompare(b.value),
  );
  const best = candidates[0];
  if (!best) return null;
  return {
    value: best.value,
    detail: `${formatInteger(best.enrolled)} enrolled, ${formatInteger(best.qualified)} qualified and ${formatInteger(best.leads)} leads in the current filtered attribution workspace.`,
  };
}

function selectLargestModelDisagreement(
  rows: AttributionWorkspacePayload["comparison"],
) {
  return [...rows]
    .map((row) => {
      const values = [
        row.firstTouch,
        row.leadCreation,
        row.lastTouch,
        row.currentChannel,
      ];
      return {
        value: row.value,
        spread: Math.max(...values) - Math.min(...values),
      };
    })
    .filter((row) => row.spread > 0)
    .sort((a, b) => b.spread - a.spread)[0] ?? null;
}

function selectHighestSourceConcentration(
  rows: RevenueSourceRow[],
  totals: RevenueCurrencySummary[],
) {
  const totalWeighted = new Map(
    totals.map((row) => [row.currency.toUpperCase(), Math.max(0, row.weighted)]),
  );
  const candidates = rows
    .map((row) => {
      const currency = String(row.currency || "").toUpperCase();
      const weighted = Math.max(0, numberValue(row.weighted_forecast));
      const denominator = totalWeighted.get(currency) ?? 0;
      return {
        source: row.source || "Unknown",
        currency,
        share: ratio(weighted, denominator),
        weighted,
      };
    })
    .filter(
      (row) =>
        row.weighted > 0 &&
        row.currency &&
        !isUnknownValue(row.source),
    )
    .sort((a, b) => b.share - a.share);

  return candidates[0] ?? null;
}

function emptyAttributionMetric(
  modelName: AttributionMetricsRow["modelName"],
): AttributionMetricsRow {
  return {
    modelName,
    total: 0,
    known: 0,
    unknown: 0,
    coverage: 0,
    qualified: 0,
    enrolled: 0,
    revenueInr: 0,
    revenueUsd: 0,
  };
}

function coverageTone(coverage: number): IntelligenceTone {
  if (coverage >= 90) return "positive";
  if (coverage >= 70) return "watch";
  return "risk";
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ratio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return clamp(numerator / denominator, 0, 1);
}

function percentage(numerator: number, denominator: number): number {
  return ratio(numerator, denominator) * 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isUnknownValue(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "unknown" ||
    normalized === "unattributed" ||
    normalized === "(not set)" ||
    normalized === "not set"
  );
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-IN");
}

function formatPercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function formatPercent100(value: number): string {
  return `${Math.round(clamp(value, 0, 100))}%`;
}

function formatDualCurrency(inr: number, usd: number): string {
  const values: string[] = [];
  if (inr !== 0) {
    values.push(`₹${Math.round(inr).toLocaleString("en-IN")}`);
  }
  if (usd !== 0) {
    values.push(
      `$${usd.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })}`,
    );
  }
  return values.length > 0 ? values.join(" + ") : "None observed";
}
