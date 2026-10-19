import type {
  SystemIntelligenceCategory,
  SystemIntelligenceSignal,
  SystemIntelligenceTone,
} from '@/lib/intelligence/system-intelligence';
import type { SystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactSigned(value: number) {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function issueDestination(issueCode: string | null) {
  switch (issueCode) {
    case 'reply_backlog':
      return { category: 'conversation' as SystemIntelligenceCategory, href: '/conversations' };
    case 'overdue_followups':
      return { category: 'follow_up' as SystemIntelligenceCategory, href: '/follow-ups' };
    case 'critical_leads':
    case 'payment_pending':
    case 'reengagement_opportunity':
    case 'high_intent_opportunity':
      return { category: 'pipeline' as SystemIntelligenceCategory, href: '/leads' };
    case 'system_failures':
    case 'processor_backlog':
      return { category: 'data_quality' as SystemIntelligenceCategory, href: '/system-health' };
    default:
      return { category: 'pipeline' as SystemIntelligenceCategory, href: '/' };
  }
}

function recommendedAction(issueCode: string | null, trendStatus: string) {
  if (trendStatus === 'improving') {
    return 'Keep the current recovery actions in place and confirm the improvement across the next observations before lowering priority.';
  }

  switch (issueCode) {
    case 'reply_backlog':
      return 'Protect reply capacity, work the oldest high-intent conversations first, and check whether the backlog falls in the next observation.';
    case 'overdue_followups':
      return 'Clear overdue follow-ups before creating new outreach work and confirm that the overdue queue is shrinking.';
    case 'critical_leads':
      return 'Review the critical-priority leads now and make sure each has a clear owner and next action.';
    case 'payment_pending':
      return 'Review payment-pending leads for friction, outstanding balances, and unanswered payment questions.';
    case 'system_failures':
      return 'Open System Health, resolve the failing processor or integration, then verify that subsequent snapshots return to normal.';
    case 'processor_backlog':
      return 'Inspect the elevated processor queue and clear the operational backlog before relying on stale downstream intelligence.';
    case 'reengagement_opportunity':
    case 'high_intent_opportunity':
      return 'Review the hottest active leads while the signal is current and prioritize the strongest evidence first.';
    default:
      return 'Review the changed operating condition and confirm the direction across the next observation before changing strategy.';
  }
}

export function buildAwarenessTrendSignal(
  context: SystemIntelligenceContext,
): SystemIntelligenceSignal | null {
  const trend = context.awarenessTrend;
  if (!trend || trend.directional_evidence_available !== true) return null;

  const status = String(trend.trend_status || '');
  const urgencyDelta = number(trend.urgency_delta);
  const persistenceHours = number(trend.top_issue_persistence_hours_6h);
  const issueCode = trend.latest_top_issue_code;
  const destination = issueDestination(issueCode);

  let tone: SystemIntelligenceTone;
  let score: number;
  let title: string;

  if (status === 'worsening') {
    tone = Math.abs(urgencyDelta) >= 10 ? 'critical' : 'warning';
    score = Math.min(100, 90 + Math.min(Math.abs(urgencyDelta), 10));
    title = issueCode
      ? `Operating pressure is worsening: ${issueCode.replace(/_/g, ' ')}`
      : 'Operating pressure is worsening';
  } else if (status === 'improving') {
    tone = 'opportunity';
    score = Math.min(86, 68 + Math.min(Math.abs(urgencyDelta), 18));
    title = issueCode
      ? `Operating pressure is improving: ${issueCode.replace(/_/g, ' ')}`
      : 'Operating pressure is improving';
  } else if (status === 'issue_changed') {
    tone = 'warning';
    score = 84;
    title = issueCode
      ? `The dominant operating issue changed to ${issueCode.replace(/_/g, ' ')}`
      : 'The dominant operating issue changed';
  } else if (status === 'stable' && persistenceHours >= 2) {
    tone = 'info';
    score = Math.min(82, 72 + Math.min(Math.round(persistenceHours), 10));
    title = issueCode
      ? `${issueCode.replace(/_/g, ' ')} has persisted for ${Math.max(1, Math.round(persistenceHours))}h`
      : 'The dominant operating condition is persisting';
  } else {
    return null;
  }

  const evidence = [
    `Trend: ${status.replace(/_/g, ' ')}`,
    `Urgency: ${Math.round(number(trend.previous_urgency_score))} → ${Math.round(number(trend.latest_urgency_score))} (${compactSigned(urgencyDelta)})`,
    `${Math.round(number(trend.snapshots_6h))} awareness snapshots in the last 6h`,
  ];

  if (persistenceHours > 0) {
    evidence.push(`Current dominant issue observed across ~${persistenceHours.toFixed(1)}h of recent history`);
  }

  const replyDelta = number(trend.needs_reply_delta);
  if (replyDelta !== 0) evidence.push(`Reply backlog change: ${compactSigned(replyDelta)}`);

  const highIntentDelta = number(trend.high_intent_delta);
  if (highIntentDelta !== 0) evidence.push(`High-intent lead change: ${compactSigned(highIntentDelta)}`);

  const failureDelta = number(trend.system_failures_delta);
  if (failureDelta !== 0) evidence.push(`Backend failure change: ${compactSigned(failureDelta)}`);

  return {
    id: 'system-awareness-directional-trend',
    category: destination.category,
    tone,
    score,
    title,
    reason: trend.trend_summary
      || 'Recent system-awareness snapshots show a directional operating change. This is observational trend evidence, not a causal claim.',
    recommendedAction: recommendedAction(issueCode, status),
    metricLabel: 'Urgency Δ',
    metricValue: compactSigned(urgencyDelta),
    href: destination.href,
    evidence,
  };
}
