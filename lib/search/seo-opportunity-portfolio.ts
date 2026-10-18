import 'server-only';

import type { SeoDecisionRecommendation } from '@/lib/search/seo-decision';
import type { SeoDecisionForecast } from '@/lib/search/seo-decision-forecast';

export type SeoPortfolioEffort = {
  level: 'small' | 'medium' | 'large';
  points: number;
  label: string;
};

export type SeoPortfolioItem = {
  rank: number;
  page_id: string;
  title: string | null;
  normalized_url: string | null;
  action_kind: string;
  decision_title: string;
  decision_priority_score: number;
  portfolio_score: number;
  upside_score: number;
  confidence_score: number;
  efficiency_score: number;
  risk_penalty: number;
  effort: SeoPortfolioEffort;
  confidence: 'low' | 'medium' | 'high';
  risk_level: string;
  base_uplift_pct: number | null;
  incremental_clicks: number | null;
  incremental_leads: number | null;
  incremental_revenue_inr: number | null;
  incremental_revenue_usd: number | null;
  reason: string;
};

export type SeoOpportunityPortfolio = {
  capacity: number;
  generated_at: string;
  items: SeoPortfolioItem[];
  selected: SeoPortfolioItem[];
  summary: {
    selected_count: number;
    total_effort_points: number;
    projected_incremental_clicks: number | null;
    projected_incremental_leads: number | null;
    projected_incremental_revenue_inr: number | null;
    projected_incremental_revenue_usd: number | null;
    projection_coverage: {
      clicks: number;
      leads: number;
      revenue: number;
    };
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function effortFor(actionKind: string): SeoPortfolioEffort {
  switch (actionKind) {
    case 'metadata_edit':
      return { level: 'small', points: 1, label: '2–4 hours' };
    case 'schema_update':
      return { level: 'small', points: 1, label: '2–4 hours' };
    case 'internal_link':
      return { level: 'small', points: 1, label: '2–4 hours' };
    case 'technical':
      return { level: 'medium', points: 2, label: '1–2 days' };
    case 'content_edit':
      return { level: 'medium', points: 2, label: '1–2 days' };
    default:
      return { level: 'large', points: 3, label: '2–4 days' };
  }
}

function confidenceScore(value: SeoDecisionForecast['confidence']) {
  if (value === 'high') return 100;
  if (value === 'medium') return 75;
  return 50;
}

function riskPenalty(value: string) {
  if (value === 'high') return 18;
  if (value === 'medium') return 8;
  return 0;
}

function upsideScore(forecast: SeoDecisionForecast) {
  const base = forecast.scenarios.find((scenario) => scenario.name === 'base');
  if (!base) return 0;

  const clickScore = base.incremental_clicks === null
    ? 0
    : clamp((base.incremental_clicks / 50) * 100, 0, 100);
  const leadScore = base.incremental_leads === null
    ? 0
    : clamp((base.incremental_leads / 4) * 100, 0, 100);
  const inrScore = base.incremental_revenue_inr === null
    ? 0
    : clamp((base.incremental_revenue_inr / 50000) * 100, 0, 100);
  const usdScore = base.incremental_revenue_usd === null
    ? 0
    : clamp((base.incremental_revenue_usd / 500) * 100, 0, 100);
  const revenueScore = Math.max(inrScore, usdScore);

  const available: number[] = [clickScore];
  if (base.incremental_leads !== null) available.push(leadScore);
  if (base.incremental_revenue_inr !== null || base.incremental_revenue_usd !== null) available.push(revenueScore);

  return available.length > 0
    ? clamp(available.reduce((sum, value) => sum + value, 0) / available.length, 0, 100)
    : 0;
}

function reasonFor(item: Omit<SeoPortfolioItem, 'rank' | 'reason'>) {
  const parts = [
    `${item.decision_priority_score.toFixed(0)}/100 decision priority`,
    `${item.confidence} forecast confidence`,
    `${item.effort.level} effort`,
  ];
  if (item.incremental_clicks !== null) parts.push(`~${Math.round(item.incremental_clicks)} base-scenario extra clicks`);
  if (item.incremental_leads !== null) parts.push(`~${item.incremental_leads.toFixed(1)} extra leads`);
  return parts.join(' · ');
}

function nullableSum(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return round(present.reduce((sum, value) => sum + value, 0), 2);
}

export function buildSeoOpportunityPortfolio(input: {
  recommendations: SeoDecisionRecommendation[];
  forecasts: Map<string, SeoDecisionForecast>;
  capacity?: number;
}): SeoOpportunityPortfolio {
  const capacity = clamp(Math.trunc(input.capacity || 5), 1, 10);

  const items = input.recommendations
    .map((recommendation) => {
      const forecast = input.forecasts.get(recommendation.page_id);
      if (!forecast) return null;
      const effort = effortFor(recommendation.recommended_action_kind);
      const base = forecast.scenarios.find((scenario) => scenario.name === 'base') || null;
      const upside = upsideScore(forecast);
      const confidence = confidenceScore(forecast.confidence);
      const efficiency = clamp(100 - ((effort.points - 1) * 30), 40, 100);
      const penalty = riskPenalty(recommendation.risk_level);
      const score = clamp(
        recommendation.decision_priority_score * 0.4
          + upside * 0.3
          + confidence * 0.15
          + efficiency * 0.15
          - penalty,
        0,
        100,
      );

      const item: Omit<SeoPortfolioItem, 'rank' | 'reason'> = {
        page_id: recommendation.page_id,
        title: recommendation.title,
        normalized_url: recommendation.normalized_url,
        action_kind: recommendation.recommended_action_kind,
        decision_title: recommendation.decision_title,
        decision_priority_score: recommendation.decision_priority_score,
        portfolio_score: round(score, 1),
        upside_score: round(upside, 1),
        confidence_score: confidence,
        efficiency_score: efficiency,
        risk_penalty: penalty,
        effort,
        confidence: forecast.confidence,
        risk_level: recommendation.risk_level,
        base_uplift_pct: base?.uplift_pct ?? null,
        incremental_clicks: base?.incremental_clicks ?? null,
        incremental_leads: base?.incremental_leads ?? null,
        incremental_revenue_inr: base?.incremental_revenue_inr ?? null,
        incremental_revenue_usd: base?.incremental_revenue_usd ?? null,
      };

      return { ...item, rank: 0, reason: reasonFor(item) } satisfies SeoPortfolioItem;
    })
    .filter((item): item is SeoPortfolioItem => item !== null)
    .sort((a, b) => b.portfolio_score - a.portfolio_score || b.decision_priority_score - a.decision_priority_score)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const selected = items.slice(0, capacity);
  const clickValues = selected.map((item) => item.incremental_clicks);
  const leadValues = selected.map((item) => item.incremental_leads);
  const inrValues = selected.map((item) => item.incremental_revenue_inr);
  const usdValues = selected.map((item) => item.incremental_revenue_usd);

  return {
    capacity,
    generated_at: new Date().toISOString(),
    items,
    selected,
    summary: {
      selected_count: selected.length,
      total_effort_points: selected.reduce((sum, item) => sum + item.effort.points, 0),
      projected_incremental_clicks: nullableSum(clickValues),
      projected_incremental_leads: nullableSum(leadValues),
      projected_incremental_revenue_inr: nullableSum(inrValues),
      projected_incremental_revenue_usd: nullableSum(usdValues),
      projection_coverage: {
        clicks: clickValues.filter((value) => value !== null).length,
        leads: leadValues.filter((value) => value !== null).length,
        revenue: selected.filter((item) => item.incremental_revenue_inr !== null || item.incremental_revenue_usd !== null).length,
      },
    },
  };
}
