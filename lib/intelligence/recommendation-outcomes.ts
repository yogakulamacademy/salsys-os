import type { DashboardSnapshot } from '@/lib/dashboard-data';
import type { SystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';

export type IntelligenceOutcomeMeasurement = {
  metric: string;
  value: number;
  desiredDirection: 'decrease' | 'increase';
};

const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending']);

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function revenueCurrencyFromSignal(signalId: string) {
  const prefix = 'revenue-outstanding-';
  if (!signalId.startsWith(prefix)) return '';
  return signalId.slice(prefix.length).trim().toUpperCase();
}

export function measureRecommendationSignal(
  signalId: string,
  snapshot: DashboardSnapshot,
  context: SystemIntelligenceContext,
): IntelligenceOutcomeMeasurement | null {
  if (signalId === 'conversation-reply-pressure-correlated') {
    const count = context.ownerSignals.filter(
      (row) => row.needs_reply === true && ACTIVE_STAGES.has(String(row.current_stage || '')),
    ).length;
    return { metric: 'active_conversations_needing_reply', value: count, desiredDirection: 'decrease' };
  }

  if (signalId === 'pipeline-first-touch') {
    return {
      metric: 'leads_needing_first_touch',
      value: number(snapshot.metrics.needsFirstTouch),
      desiredDirection: 'decrease',
    };
  }

  if (signalId === 'follow-up-due') {
    return {
      metric: 'followups_due',
      value: number(snapshot.metrics.followupsDue),
      desiredDirection: 'decrease',
    };
  }

  if (signalId === 'pipeline-payment-pending') {
    return {
      metric: 'payment_pending_leads',
      value: number(snapshot.counts.payment_pending),
      desiredDirection: 'decrease',
    };
  }

  if (signalId === 'data-unvalued-open-leads') {
    return {
      metric: 'unvalued_open_leads',
      value: number(snapshot.unvaluedOpenLeads),
      desiredDirection: 'decrease',
    };
  }

  if (signalId === 'system-health-operational-pressure') {
    const failures = context.systemActivity.reduce((sum, row) => sum + number(row.failure_count), 0);
    const elevatedPending = context.systemActivity
      .filter((row) => number(row.pending_count) >= 10)
      .reduce((sum, row) => sum + number(row.pending_count), 0);
    const degraded = context.degradedSources.length;
    return {
      metric: 'system_health_pressure',
      value: failures + elevatedPending + degraded,
      desiredDirection: 'decrease',
    };
  }

  const currency = revenueCurrencyFromSignal(signalId);
  if (currency) {
    const row = snapshot.revenueSummary.find((item) => String(item.currency || '').toUpperCase() === currency);
    if (!row) return null;
    return {
      metric: `outstanding_revenue_${currency.toLowerCase()}`,
      value: number(row.outstanding),
      desiredDirection: 'decrease',
    };
  }

  return null;
}

export type ObservedOutcome = {
  outcomeClass: 'positive' | 'neutral' | 'negative' | 'inconclusive';
  delta: number | null;
  note: string;
};

export function classifyObservedOutcome(input: {
  baselineValue: number | null;
  currentValue: number | null;
  desiredDirection: 'decrease' | 'increase' | null;
}): ObservedOutcome {
  const { baselineValue, currentValue, desiredDirection } = input;
  if (baselineValue === null || currentValue === null || !desiredDirection) {
    return {
      outcomeClass: 'inconclusive',
      delta: null,
      note: 'No safe comparable metric was available for this recommendation.',
    };
  }

  const delta = currentValue - baselineValue;
  const threshold = Math.max(1, Math.abs(baselineValue) * 0.2);
  const signedImprovement = desiredDirection === 'decrease' ? -delta : delta;

  if (signedImprovement >= threshold) {
    return {
      outcomeClass: 'positive',
      delta,
      note: 'The observed metric moved materially in the recommended direction after the action. This is observational evidence, not a causal claim.',
    };
  }

  if (signedImprovement <= -threshold) {
    return {
      outcomeClass: 'negative',
      delta,
      note: 'The observed metric moved materially against the recommended direction after the action. This is observational evidence, not a causal claim.',
    };
  }

  return {
    outcomeClass: 'neutral',
    delta,
    note: 'The observed metric has not moved enough to classify a meaningful change yet. This is observational evidence, not a causal claim.',
  };
}
