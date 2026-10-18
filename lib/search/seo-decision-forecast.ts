import 'server-only';

import type { SeoDecisionRecommendation } from '@/lib/search/seo-decision';

export type SeoActionLearningProfile = {
  action_kind: string;
  evidence_count: number;
  positive_count: number;
  negative_count: number;
  mixed_count: number;
  inconclusive_count: number;
  avg_effect_pct: number;
  positive_rate_pct: number;
  ranking_adjustment: number;
  last_evaluated_at: string | null;
};

export type SeoForecastScenario = {
  name: 'low' | 'base' | 'high';
  uplift_pct: number;
  projected_clicks: number | null;
  incremental_clicks: number | null;
  projected_ctr: number | null;
  projected_leads: number | null;
  incremental_leads: number | null;
  projected_revenue_inr: number | null;
  incremental_revenue_inr: number | null;
  projected_revenue_usd: number | null;
  incremental_revenue_usd: number | null;
};

export type SeoDecisionForecast = {
  page_id: string;
  action_kind: string;
  confidence: 'low' | 'medium' | 'high';
  confidence_reason: string;
  model: 'observed_funnel_scenario_v1';
  current: {
    impressions: number;
    clicks: number;
    ctr: number;
    organic_leads: number;
    revenue_inr: number;
    revenue_usd: number;
  };
  assumptions: {
    uplift_source: 'historical_action_learning' | 'conservative_action_default';
    historical_evidence_count: number;
    historical_avg_effect_pct: number | null;
    observed_click_to_lead_rate: number | null;
    observed_revenue_per_lead_inr: number | null;
    observed_revenue_per_lead_usd: number | null;
  };
  drivers: Array<{ key: string; score: number; label: string }>;
  scenarios: SeoForecastScenario[];
  caveats: string[];
};

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nested(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function defaultUplift(actionKind: string) {
  switch (actionKind) {
    case 'technical': return 20;
    case 'metadata_edit': return 15;
    case 'content_edit': return 15;
    case 'internal_link': return 10;
    case 'schema_update': return 8;
    default: return 10;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function driverLabel(key: string) {
  return ({
    demand: 'Search demand',
    opportunity: 'SEO opportunity',
    revenue: 'Business value',
    technical_gap: 'Technical gap',
    content_gap: 'Content gap',
    aeo_gap: 'AEO gap',
    geo_gap: 'GEO / AI gap',
    cannibalization: 'Cannibalization risk',
  } as Record<string, string>)[key] || key.replace(/_/g, ' ');
}

export function buildSeoDecisionForecast(
  recommendation: SeoDecisionRecommendation,
  learningProfile?: SeoActionLearningProfile | null,
): SeoDecisionForecast {
  const evidence = recommendation.evidence || {};
  const search = nested(evidence, 'search');
  const business = nested(evidence, 'business');
  const scores = nested(evidence, 'scores');

  const impressions = Math.max(0, finite(search.impressions));
  const clicks = Math.max(0, finite(search.clicks));
  const ctr = clamp(finite(search.ctr), 0, 1);
  const leads = Math.max(0, finite(business.organic_leads));
  const revenueInr = finite(business.revenue_inr);
  const revenueUsd = finite(business.revenue_usd);

  const evidenceCount = Math.max(0, learningProfile?.evidence_count || recommendation.learning_evidence_count || 0);
  const learnedAvg = learningProfile && evidenceCount >= 3
    ? clamp(learningProfile.avg_effect_pct, -25, 50)
    : null;
  const baseUplift = clamp(
    learnedAvg !== null && learnedAvg > 0 ? learnedAvg : defaultUplift(recommendation.recommended_action_kind),
    3,
    50,
  );

  const clickToLead = clicks > 0 && leads > 0 ? leads / clicks : null;
  const revenuePerLeadInr = leads > 0 && revenueInr > 0 ? revenueInr / leads : null;
  const revenuePerLeadUsd = leads > 0 && revenueUsd > 0 ? revenueUsd / leads : null;

  const scenarioDefs: Array<{ name: 'low' | 'base' | 'high'; multiplier: number }> = [
    { name: 'low', multiplier: 0.5 },
    { name: 'base', multiplier: 1 },
    { name: 'high', multiplier: 1.5 },
  ];

  const scenarios = scenarioDefs.map(({ name, multiplier }) => {
    const upliftPct = clamp(baseUplift * multiplier, 1, 60);
    const uplift = upliftPct / 100;

    let projectedClicks: number | null = null;
    let projectedCtr: number | null = null;

    if (recommendation.recommended_action_kind === 'metadata_edit' && impressions > 0 && ctr > 0) {
      projectedCtr = clamp(ctr * (1 + uplift), 0, 0.35);
      projectedClicks = impressions * projectedCtr;
    } else if (clicks > 0) {
      projectedClicks = clicks * (1 + uplift);
      projectedCtr = impressions > 0 ? projectedClicks / impressions : null;
    }

    const incrementalClicks = projectedClicks === null ? null : Math.max(0, projectedClicks - clicks);
    const projectedLeads = projectedClicks !== null && clickToLead !== null
      ? projectedClicks * clickToLead
      : null;
    const incrementalLeads = projectedLeads === null ? null : Math.max(0, projectedLeads - leads);

    const projectedRevenueInr = projectedLeads !== null && revenuePerLeadInr !== null
      ? projectedLeads * revenuePerLeadInr
      : null;
    const projectedRevenueUsd = projectedLeads !== null && revenuePerLeadUsd !== null
      ? projectedLeads * revenuePerLeadUsd
      : null;

    return {
      name,
      uplift_pct: round(upliftPct, 1),
      projected_clicks: projectedClicks === null ? null : round(projectedClicks, 1),
      incremental_clicks: incrementalClicks === null ? null : round(incrementalClicks, 1),
      projected_ctr: projectedCtr === null ? null : round(projectedCtr, 4),
      projected_leads: projectedLeads === null ? null : round(projectedLeads, 2),
      incremental_leads: incrementalLeads === null ? null : round(incrementalLeads, 2),
      projected_revenue_inr: projectedRevenueInr === null ? null : round(projectedRevenueInr, 2),
      incremental_revenue_inr: projectedRevenueInr === null ? null : round(Math.max(0, projectedRevenueInr - revenueInr), 2),
      projected_revenue_usd: projectedRevenueUsd === null ? null : round(projectedRevenueUsd, 2),
      incremental_revenue_usd: projectedRevenueUsd === null ? null : round(Math.max(0, projectedRevenueUsd - revenueUsd), 2),
    } satisfies SeoForecastScenario;
  });

  const drivers = Object.entries(scores)
    .filter(([key]) => key !== 'final_priority')
    .map(([key, value]) => ({ key, score: clamp(finite(value), 0, 100), label: driverLabel(key) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  let confidence: 'low' | 'medium' | 'high' = 'low';
  let confidenceReason = 'Forecast uses conservative action defaults because historical outcome evidence is still limited.';
  if (evidenceCount >= 5 && impressions >= 1000) {
    confidence = 'high';
    confidenceReason = 'Forecast is supported by repeated historical action outcomes and substantial observed search demand.';
  } else if (evidenceCount >= 3 || impressions >= 500) {
    confidence = 'medium';
    confidenceReason = evidenceCount >= 3
      ? 'Forecast uses historical outcomes for this action type, but more experiments will improve calibration.'
      : 'Forecast has meaningful search-volume evidence but limited action-specific historical learning.';
  }

  const caveats = [
    'This is a scenario model, not a guaranteed traffic or revenue prediction.',
    'Search demand is held constant; seasonality, SERP changes and competitor activity are not forecast.',
  ];
  if (clickToLead === null) caveats.push('Lead uplift is not projected because this page does not yet have a reliable observed click-to-lead rate.');
  if (revenuePerLeadInr === null && revenuePerLeadUsd === null) caveats.push('Revenue uplift is not projected because this page does not yet have enough observed organic revenue evidence.');

  return {
    page_id: recommendation.page_id,
    action_kind: recommendation.recommended_action_kind,
    confidence,
    confidence_reason: confidenceReason,
    model: 'observed_funnel_scenario_v1',
    current: {
      impressions: round(impressions, 0),
      clicks: round(clicks, 0),
      ctr: round(ctr, 4),
      organic_leads: round(leads, 0),
      revenue_inr: round(revenueInr, 2),
      revenue_usd: round(revenueUsd, 2),
    },
    assumptions: {
      uplift_source: learnedAvg !== null && learnedAvg > 0 ? 'historical_action_learning' : 'conservative_action_default',
      historical_evidence_count: evidenceCount,
      historical_avg_effect_pct: learnedAvg,
      observed_click_to_lead_rate: clickToLead === null ? null : round(clickToLead, 6),
      observed_revenue_per_lead_inr: revenuePerLeadInr === null ? null : round(revenuePerLeadInr, 2),
      observed_revenue_per_lead_usd: revenuePerLeadUsd === null ? null : round(revenuePerLeadUsd, 2),
    },
    drivers,
    scenarios,
    caveats,
  };
}
