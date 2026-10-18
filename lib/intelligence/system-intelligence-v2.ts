import type { DashboardSnapshot } from '@/lib/dashboard-data';
import {
  buildSystemIntelligence,
  type SystemIntelligenceBrief,
  type SystemIntelligenceSignal,
} from '@/lib/intelligence/system-intelligence';
import type {
  IntelligenceRole,
  SystemIntelligenceContext,
} from '@/lib/intelligence/system-intelligence-context';

const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending']);

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roleWeight(role: IntelligenceRole, signal: SystemIntelligenceSignal) {
  if (role === 'admissions') {
    if (signal.category === 'conversation') return 12;
    if (signal.category === 'follow_up') return 10;
    if (signal.category === 'pipeline') return 8;
    if (signal.category === 'revenue') return 4;
    if (signal.category === 'acquisition') return -12;
    if (signal.category === 'data_quality') return -8;
  }

  if (role === 'manager') {
    if (signal.category === 'pipeline') return 8;
    if (signal.category === 'conversation') return 7;
    if (signal.category === 'follow_up') return 7;
    if (signal.category === 'revenue') return 6;
    if (signal.category === 'data_quality') return 2;
  }

  if (role === 'owner' || role === 'admin') {
    if (signal.category === 'revenue') return 8;
    if (signal.category === 'acquisition') return 6;
    if (signal.category === 'data_quality') return 4;
    if (signal.category === 'pipeline') return 4;
    if (signal.category === 'conversation') return 3;
  }

  return 0;
}

function roleLabel(role: IntelligenceRole) {
  if (role === 'admissions') return 'admissions';
  if (role === 'manager') return 'manager';
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  return 'workspace';
}

function learnedCalibration(context: SystemIntelligenceContext, signal: SystemIntelligenceSignal) {
  const role = roleLabel(context.role);
  const profile = context.learningProfiles.find(
    (row) => row.signal_id === signal.id && row.role_scope === role,
  );
  if (!profile) return { adjustment: 0, evidence: '' };

  const samples = number(profile.outcome_samples);
  const confidence = number(profile.confidence);
  const rawAdjustment = Math.max(-8, Math.min(8, Math.round(number(profile.score_adjustment))));
  if (samples < 5 || confidence <= 0 || rawAdjustment === 0) {
    return { adjustment: 0, evidence: '' };
  }

  return {
    adjustment: rawAdjustment,
    evidence: `Learned calibration ${rawAdjustment > 0 ? '+' : ''}${rawAdjustment} from ${samples} observed outcomes`,
  };
}

function direction(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function compact(value: number) {
  return new Intl.NumberFormat('en-IN', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function compositeReplySignal(context: SystemIntelligenceContext, now: Date): SystemIntelligenceSignal | null {
  const replyRows = context.ownerSignals.filter((row) => row.needs_reply === true && ACTIVE_STAGES.has(String(row.current_stage || '')));
  if (replyRows.length === 0) return null;

  const oneHourAgo = now.getTime() - 60 * 60 * 1000;
  const waiting = replyRows.filter((row) => {
    const at = row.last_inbound_at ? Date.parse(row.last_inbound_at) : NaN;
    return Number.isFinite(at) && at <= oneHourAgo;
  });
  const highIntentWaiting = replyRows.filter((row) => row.current_stage === 'high_intent');
  const maxPriority = Math.max(0, ...replyRows.map((row) => number(row.priority_score)));
  const score = clamp(88 + Math.min(waiting.length, 8) + Math.min(highIntentWaiting.length * 2, 6) + Math.min(maxPriority / 25, 4));

  const title = waiting.length === replyRows.length && waiting.length > 0
    ? `${replyRows.length} conversations are stalled beyond the response threshold`
    : `${replyRows.length} conversations need attention${waiting.length > 0 ? `; ${waiting.length} are over one hour old` : ''}`;

  return {
    id: 'conversation-reply-pressure-correlated',
    category: 'conversation',
    tone: waiting.length > 0 ? 'critical' : 'warning',
    score,
    title,
    reason: highIntentWaiting.length > 0
      ? `Reply pressure overlaps with ${highIntentWaiting.length} high-intent lead${highIntentWaiting.length === 1 ? '' : 's'}, so the queue carries both response-time and conversion risk.`
      : 'The reply backlog is correlated into one operating situation so the team is not shown duplicate alerts for the same underlying problem.',
    recommendedAction: highIntentWaiting.length > 0
      ? 'Reply to high-intent conversations first, then work the oldest remaining inbound messages.'
      : 'Work the oldest inbound conversations first and clear the response backlog before lower-priority tasks.',
    metricLabel: 'Reply pressure',
    metricValue: compact(replyRows.length),
    href: '/conversations',
    evidence: [
      `${replyRows.length} active conversations need a reply`,
      `${waiting.length} have waited more than one hour`,
      `${highIntentWaiting.length} are high-intent`,
    ],
  };
}

function behaviouralSignal(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const rows = context.journey
    .filter((row) => row.is_reengaged === true && ACTIVE_STAGES.has(String(row.current_stage || '')))
    .sort((left, right) => number(right.engagement_score) - number(left.engagement_score));

  if (rows.length === 0) return null;
  const hottest = rows[0];
  const highIntentEvents = rows.reduce((sum, row) => sum + number(row.high_intent_events_7d), 0);
  const sessions24h = rows.reduce((sum, row) => sum + number(row.sessions_24h), 0);

  return {
    id: 'behavior-reengaged-leads',
    category: 'pipeline',
    tone: highIntentEvents > 0 ? 'opportunity' : 'info',
    score: clamp(73 + Math.min(rows.length * 3, 12) + Math.min(highIntentEvents * 2, 10)),
    title: `${rows.length} ${rows.length === 1 ? 'lead has' : 'leads have'} re-engaged after earlier activity`,
    reason: highIntentEvents > 0
      ? `Recent return behaviour includes ${highIntentEvents} high-intent event${highIntentEvents === 1 ? '' : 's'}, which can indicate renewed buying intent.`
      : 'Previously known leads have returned to the website or journey, creating a warmer follow-up window than a cold reactivation list.',
    recommendedAction: 'Review the re-engaged leads before broad nurture outreach and contact the strongest behavioural signal first.',
    metricLabel: 'Re-engaged',
    metricValue: compact(rows.length),
    href: '/re-engaged',
    evidence: [
      `${sessions24h} sessions in the last 24h across this group`,
      `${highIntentEvents} high-intent events in the last 7d`,
      hottest?.lead_name ? `Strongest current signal: ${hottest.lead_name}` : 'Ranked by current engagement evidence',
    ],
  };
}

function velocitySignals(context: SystemIntelligenceContext): SystemIntelligenceSignal[] {
  const output: SystemIntelligenceSignal[] = [];
  const inboundCurrent = context.velocity.inbound24h;
  const inboundPrevious = context.velocity.inboundPrevious24h;
  const inboundChange = direction(inboundCurrent, inboundPrevious);

  if (inboundCurrent + inboundPrevious >= 4 && inboundCurrent >= inboundPrevious + 2 && inboundChange >= 35) {
    output.push({
      id: 'velocity-inbound-24h',
      category: 'conversation',
      tone: 'opportunity',
      score: clamp(70 + Math.min(Math.abs(inboundChange) / 5, 15)),
      title: `Inbound conversation volume accelerated ${inboundChange}% in the last 24 hours`,
      reason: 'Current inbound volume is materially above the preceding 24-hour window, so staffing and reply capacity may need to adjust before a backlog forms.',
      recommendedAction: 'Protect reply capacity and check whether the increase is concentrated in a campaign, course or channel before changing spend.',
      metricLabel: 'Inbound 24h',
      metricValue: compact(inboundCurrent),
      href: '/conversations',
      evidence: [`${inboundCurrent} inbound messages in the last 24h`, `${inboundPrevious} in the preceding 24h`],
    });
  }

  const leadsCurrent = context.velocity.newLeads24h;
  const leadsPrevious = context.velocity.newLeadsPrevious24h;
  const leadChange = direction(leadsCurrent, leadsPrevious);
  if (leadsCurrent + leadsPrevious >= 3 && leadsCurrent >= leadsPrevious + 2 && leadChange >= 35) {
    output.push({
      id: 'velocity-new-leads-24h',
      category: 'acquisition',
      tone: 'opportunity',
      score: clamp(67 + Math.min(Math.abs(leadChange) / 6, 14)),
      title: `New-lead volume accelerated ${leadChange}% in the last 24 hours`,
      reason: 'Lead creation is rising compared with the previous 24-hour window. The increase is useful only if response quality and downstream qualification hold.',
      recommendedAction: 'Inspect source quality and first-touch coverage before scaling the source responsible for the increase.',
      metricLabel: 'New leads 24h',
      metricValue: compact(leadsCurrent),
      href: '/leads',
      evidence: [`${leadsCurrent} new leads in the last 24h`, `${leadsPrevious} in the preceding 24h`],
    });
  }

  return output;
}

function systemHealthSignal(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const failing = context.systemActivity.filter((row) => number(row.failure_count) > 0);
  const pending = context.systemActivity.filter((row) => number(row.pending_count) >= 10);
  if (failing.length === 0 && pending.length === 0 && context.degradedSources.length === 0) return null;

  const failures = failing.reduce((sum, row) => sum + number(row.failure_count), 0);
  const pendingCount = pending.reduce((sum, row) => sum + number(row.pending_count), 0);
  const affected = [...new Set([...failing, ...pending].map((row) => row.system_name || row.system_key))].slice(0, 4);
  const score = clamp(76 + Math.min(failures * 3, 15) + Math.min(pendingCount / 10, 7) + context.degradedSources.length * 3);

  return {
    id: 'system-health-operational-pressure',
    category: 'data_quality',
    tone: failures > 0 ? 'warning' : 'info',
    score,
    title: failures > 0 ? `${failures} system failure${failures === 1 ? '' : 's'} need review` : 'Operational data freshness is degraded',
    reason: 'SalsysOS should lower confidence when source systems or internal processing are unhealthy rather than presenting stale evidence as fully current.',
    recommendedAction: 'Open System Health, resolve failed or accumulating processors, then refresh the affected intelligence before acting on lower-confidence signals.',
    metricLabel: 'System issues',
    metricValue: compact(failures + context.degradedSources.length),
    href: '/system-health',
    evidence: [
      affected.length > 0 ? `Affected: ${affected.join(', ')}` : 'No named processor failure returned',
      `${pendingCount} pending items across elevated systems`,
      context.degradedSources.length > 0 ? `Degraded intelligence sources: ${context.degradedSources.join(', ')}` : 'Core intelligence queries loaded',
    ],
  };
}

export function buildSystemIntelligenceV2(
  snapshot: DashboardSnapshot,
  context: SystemIntelligenceContext,
  now = new Date(),
): SystemIntelligenceBrief {
  const base = buildSystemIntelligence(snapshot, now);
  const correlatedReply = compositeReplySignal(context, now);
  const behaviour = behaviouralSignal(context);
  const health = systemHealthSignal(context);

  let signals = base.signals.filter((item) => !['conversation-needs-reply', 'conversation-waiting-over-hour'].includes(item.id));
  if (correlatedReply) signals.push(correlatedReply);
  if (behaviour) signals.push(behaviour);
  if (health) signals.push(health);
  signals.push(...velocitySignals(context));

  signals = signals
    .map((item) => {
      const calibration = learnedCalibration(context, item);
      return {
        ...item,
        score: clamp(item.score + roleWeight(context.role, item) + calibration.adjustment),
        evidence: calibration.evidence ? [...item.evidence, calibration.evidence] : item.evidence,
      };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 8);

  const urgent = signals.filter((item) => item.tone === 'critical' || item.score >= 90).length;
  const opportunities = signals.filter((item) => item.tone === 'opportunity').length;
  const dataQuality = signals.filter((item) => item.category === 'data_quality').length;
  const top = signals[0];
  const attentionScore = top?.score ?? 0;
  const state: SystemIntelligenceBrief['state'] = urgent > 0
    ? 'urgent'
    : attentionScore >= 75
      ? 'attention'
      : opportunities > 0
        ? 'opportunity'
        : 'healthy';

  const calibratedCount = context.learningProfiles.filter(
    (row) => number(row.outcome_samples) >= 5 && number(row.score_adjustment) !== 0,
  ).length;

  return {
    generatedAt: now.toISOString(),
    state,
    attentionScore,
    headline: top?.title || base.headline,
    summary: `${state === 'urgent'
      ? 'Immediate operating risk is elevated.'
      : state === 'attention'
        ? 'The system found active work that can materially improve current performance.'
        : state === 'opportunity'
          ? 'No critical queue dominates; the strongest current opportunities are ranked below.'
          : 'No critical operating threshold is elevated.'} Priorities are correlated and weighted for the ${roleLabel(context.role)} role using current tenant evidence${calibratedCount > 0 ? `, with bounded learning active on ${calibratedCount} signal profile${calibratedCount === 1 ? '' : 's'}` : ''}.`,
    signals,
    counters: { urgent, opportunities, dataQuality },
  };
}
