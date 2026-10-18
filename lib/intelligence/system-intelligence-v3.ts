import type { DashboardSnapshot } from '@/lib/dashboard-data';
import type {
  SystemIntelligenceBrief,
  SystemIntelligenceSignal,
} from '@/lib/intelligence/system-intelligence';
import type { SystemIntelligenceContext } from '@/lib/intelligence/system-intelligence-context';
import { buildSystemIntelligenceV2 } from '@/lib/intelligence/system-intelligence-v2';

const ACTIVE_STAGES = new Set(['new', 'contacted', 'engaged', 'qualified', 'high_intent', 'payment_pending']);

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function compact(value: number) {
  return new Intl.NumberFormat('en-IN', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function roleBoost(context: SystemIntelligenceContext, category: SystemIntelligenceSignal['category']) {
  if (context.role === 'admissions') {
    if (category === 'conversation' || category === 'follow_up') return 6;
    if (category === 'pipeline') return 4;
    if (category === 'acquisition') return -5;
  }
  if (context.role === 'manager') {
    if (category === 'conversation' || category === 'pipeline') return 4;
    if (category === 'acquisition' || category === 'data_quality') return 2;
  }
  if (context.role === 'owner' || context.role === 'admin') {
    if (category === 'acquisition') return 5;
    if (category === 'data_quality') return 3;
    if (category === 'pipeline') return 2;
  }
  return 0;
}

function responseCapacitySignal(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const activeTeam = Math.max(0, context.teamMembers.length);
  const pressureRows = context.ownerSignals.filter(
    (row) => ACTIVE_STAGES.has(String(row.current_stage || '')) && (row.needs_reply === true || row.has_overdue_followup === true),
  );
  if (pressureRows.length < 4 || activeTeam === 0) return null;

  const perPerson = pressureRows.length / activeTeam;
  if (perPerson < 3) return null;

  const unassigned = pressureRows.filter((row) => !row.owner_user_id).length;
  const replyCount = pressureRows.filter((row) => row.needs_reply === true).length;
  const overdueCount = pressureRows.filter((row) => row.has_overdue_followup === true).length;

  return {
    id: 'team-response-capacity-pressure',
    category: 'conversation',
    tone: perPerson >= 6 ? 'warning' : 'info',
    score: clamp(76 + Math.min(perPerson * 3, 15) + Math.min(unassigned * 2, 6) + roleBoost(context, 'conversation')),
    title: `${pressureRows.length} active lead tasks are concentrated across ${activeTeam} active team member${activeTeam === 1 ? '' : 's'}`,
    reason: 'Reply and overdue-follow-up work is high relative to currently active admissions capacity. This is a workload signal, not a claim about individual performance.',
    recommendedAction: 'Rebalance the oldest reply and overdue-follow-up work before adding lower-priority outreach to the same team.',
    metricLabel: 'Tasks / active member',
    metricValue: perPerson.toFixed(1),
    href: '/team-performance',
    evidence: [
      `${replyCount} reply-required lead${replyCount === 1 ? '' : 's'}`,
      `${overdueCount} overdue-follow-up lead${overdueCount === 1 ? '' : 's'}`,
      `${unassigned} pressure item${unassigned === 1 ? '' : 's'} currently have no owner`,
    ],
  };
}

function demandVsCapacitySignal(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const current = context.velocity.inbound24h;
  const previous = context.velocity.inboundPrevious24h;
  const change = percentChange(current, previous);
  const activeTeam = context.teamMembers.length;
  const replyPressure = context.ownerSignals.filter(
    (row) => ACTIVE_STAGES.has(String(row.current_stage || '')) && row.needs_reply === true,
  ).length;

  if (current + previous < 4 || current < previous + 2 || change < 35 || activeTeam === 0) return null;
  const repliesPerPerson = replyPressure / activeTeam;
  if (replyPressure < 3 || repliesPerPerson < 2) return null;

  return {
    id: 'cross-domain-demand-response-capacity',
    category: 'conversation',
    tone: repliesPerPerson >= 4 ? 'critical' : 'warning',
    score: clamp(88 + Math.min(change / 10, 7) + Math.min(repliesPerPerson, 5) + roleBoost(context, 'conversation')),
    title: 'Inbound demand is accelerating while the response queue is already under pressure',
    reason: 'Two independent operating signals overlap: inbound volume is above the preceding 24-hour window and active conversations are already waiting for team attention.',
    recommendedAction: 'Protect response capacity first. Clear the oldest high-intent replies, then identify the source of the inbound increase before scaling demand further.',
    metricLabel: 'Inbound change',
    metricValue: `+${change}%`,
    href: '/conversations',
    evidence: [
      `${current} inbound messages in the last 24h vs ${previous} in the preceding 24h`,
      `${replyPressure} active conversations currently need a reply`,
      `${activeTeam} active team member${activeTeam === 1 ? '' : 's'} in the admissions workspace`,
    ],
  };
}

function weeklyLeadTrendSignal(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const current = context.historical.newLeads7d;
  const previous = context.historical.newLeadsPrevious7d;
  const change = percentChange(current, previous);
  if (current + previous < 6 || Math.abs(current - previous) < 3) return null;

  if (change >= 35) {
    return {
      id: 'trend-new-leads-7d-growth',
      category: 'acquisition',
      tone: 'opportunity',
      score: clamp(68 + Math.min(change / 7, 12) + roleBoost(context, 'acquisition')),
      title: `New-lead creation is up ${change}% across the latest 7-day window`,
      reason: 'The latest seven days contain materially more new leads than the preceding seven-day window. Source quality still needs to be checked before treating growth as durable.',
      recommendedAction: 'Compare source, qualification and first-touch coverage before increasing spend or outreach around the apparent growth.',
      metricLabel: 'New leads 7d',
      metricValue: compact(current),
      href: '/leads',
      evidence: [`${current} new leads in the latest 7d`, `${previous} in the preceding 7d`],
    };
  }

  if (change <= -30) {
    return {
      id: 'trend-new-leads-7d-decline',
      category: 'acquisition',
      tone: 'warning',
      score: clamp(70 + Math.min(Math.abs(change) / 6, 13) + roleBoost(context, 'acquisition')),
      title: `New-lead creation is down ${Math.abs(change)}% across the latest 7-day window`,
      reason: 'Lead creation is materially below the preceding seven-day window. The evidence shows a change in volume, not its cause.',
      recommendedAction: 'Check channel traffic, campaign delivery, form health and source attribution before changing acquisition strategy.',
      metricLabel: 'New leads 7d',
      metricValue: compact(current),
      href: '/attribution',
      evidence: [`${current} new leads in the latest 7d`, `${previous} in the preceding 7d`],
    };
  }

  return null;
}

function seoTrendSignal(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const current = context.historical.seoClicks7d;
  const previous = context.historical.seoClicksPrevious7d;
  const impressionsCurrent = context.historical.seoImpressions7d;
  const impressionsPrevious = context.historical.seoImpressionsPrevious7d;
  const clickChange = percentChange(current, previous);
  const impressionChange = percentChange(impressionsCurrent, impressionsPrevious);

  if (current + previous < 80 || Math.abs(clickChange) < 20) return null;

  const declining = clickChange < 0;
  return {
    id: declining ? 'trend-seo-clicks-7d-decline' : 'trend-seo-clicks-7d-growth',
    category: 'acquisition',
    tone: declining ? 'warning' : 'opportunity',
    score: clamp((declining ? 67 : 63) + Math.min(Math.abs(clickChange) / 6, 12) + roleBoost(context, 'acquisition')),
    title: `Organic clicks are ${declining ? 'down' : 'up'} ${Math.abs(clickChange)}% versus the preceding 7-day window`,
    reason: `Search Console evidence shows a material click change. Impressions moved ${impressionChange >= 0 ? 'up' : 'down'} ${Math.abs(impressionChange)}% over the same comparison, but this signal does not infer a ranking cause.`,
    recommendedAction: declining
      ? 'Open SEO intelligence and separate impression loss from CTR/click-capture changes before deciding what to optimize.'
      : 'Inspect the queries and pages contributing to the increase before turning the movement into a repeatable content or internal-linking action.',
    metricLabel: 'Organic clicks 7d',
    metricValue: compact(current),
    href: '/seo/intelligence',
    evidence: [
      `${current} clicks in the latest 7d vs ${previous} in the preceding 7d`,
      `${compact(impressionsCurrent)} impressions vs ${compact(impressionsPrevious)} in the preceding 7d`,
    ],
  };
}

function paidMediaAttributionSignal(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const spendingWithoutCrmLeads = context.paidCampaigns.filter(
    (row) => number(row.spend) > 0 && number(row.crm_leads) === 0,
  );
  if (spendingWithoutCrmLeads.length === 0) return null;

  const providers = [...new Set(spendingWithoutCrmLeads.map((row) => row.provider))];
  const campaignNames = spendingWithoutCrmLeads
    .map((row) => row.campaign_name)
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);

  return {
    id: 'paid-media-spend-without-crm-leads',
    category: 'data_quality',
    tone: 'warning',
    score: clamp(72 + Math.min(spendingWithoutCrmLeads.length * 3, 12) + roleBoost(context, 'data_quality')),
    title: `${spendingWithoutCrmLeads.length} paid campaign${spendingWithoutCrmLeads.length === 1 ? '' : 's'} show spend but no CRM-attributed leads`,
    reason: 'This can represent weak conversion, attribution loss, or both. SalsysOS should not classify the cause without supporting evidence.',
    recommendedAction: 'Verify campaign-to-CRM attribution and landing/form tracking first; only then judge campaign performance.',
    metricLabel: 'Campaigns to verify',
    metricValue: compact(spendingWithoutCrmLeads.length),
    href: '/paid-media-leads',
    evidence: [
      `Providers affected: ${providers.join(', ')}`,
      campaignNames.length > 0 ? `Examples: ${campaignNames.join(', ')}` : 'Campaign names unavailable',
    ],
  };
}

function acquisitionSoftnessCorrelation(context: SystemIntelligenceContext): SystemIntelligenceSignal | null {
  const leadCurrent = context.historical.newLeads7d;
  const leadPrevious = context.historical.newLeadsPrevious7d;
  const seoCurrent = context.historical.seoClicks7d;
  const seoPrevious = context.historical.seoClicksPrevious7d;
  const leadChange = percentChange(leadCurrent, leadPrevious);
  const seoChange = percentChange(seoCurrent, seoPrevious);

  if (leadCurrent + leadPrevious < 6 || seoCurrent + seoPrevious < 80) return null;
  if (leadChange > -25 || seoChange > -20) return null;

  return {
    id: 'cross-domain-acquisition-softness',
    category: 'acquisition',
    tone: 'warning',
    score: clamp(78 + Math.min(Math.abs(leadChange) / 8, 8) + Math.min(Math.abs(seoChange) / 10, 5) + roleBoost(context, 'acquisition')),
    title: 'Lead creation and organic search clicks are both softer than the preceding week',
    reason: 'Two independent acquisition indicators are declining in the same comparison window. The overlap raises priority, but it does not prove that organic search caused the lead decline.',
    recommendedAction: 'Compare paid, organic, direct and referral source contribution before choosing a channel-level intervention.',
    metricLabel: 'Lead change',
    metricValue: `${leadChange}%`,
    href: '/attribution',
    evidence: [
      `New leads: ${leadCurrent} vs ${leadPrevious} (${leadChange}%)`,
      `Organic clicks: ${seoCurrent} vs ${seoPrevious} (${seoChange}%)`,
    ],
  };
}

export function buildSystemIntelligenceV3(
  snapshot: DashboardSnapshot,
  context: SystemIntelligenceContext,
  now = new Date(),
): SystemIntelligenceBrief {
  const base = buildSystemIntelligenceV2(snapshot, context, now);
  const crossDemand = demandVsCapacitySignal(context);
  const capacity = responseCapacitySignal(context);
  const leadTrend = weeklyLeadTrendSignal(context);
  const seoTrend = seoTrendSignal(context);
  const paidMedia = paidMediaAttributionSignal(context);
  const acquisitionCorrelation = acquisitionSoftnessCorrelation(context);

  let signals = [...base.signals];

  if (crossDemand) {
    signals = signals.filter((item) => ![
      'conversation-reply-pressure-correlated',
      'velocity-inbound-24h',
      'team-response-capacity-pressure',
    ].includes(item.id));
    signals.push(crossDemand);
  } else if (capacity) {
    signals.push(capacity);
  }

  if (acquisitionCorrelation) {
    signals = signals.filter((item) => ![
      'trend-new-leads-7d-decline',
      'trend-seo-clicks-7d-decline',
    ].includes(item.id));
    signals.push(acquisitionCorrelation);
  } else {
    if (leadTrend) signals.push(leadTrend);
    if (seoTrend) signals.push(seoTrend);
  }

  if (paidMedia) signals.push(paidMedia);

  signals = signals
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

  const historicalEvidenceAvailable = context.historical.newLeads7d + context.historical.newLeadsPrevious7d > 0
    || context.historical.seoClicks7d + context.historical.seoClicksPrevious7d > 0;
  const crossDomainCount = signals.filter((item) => item.id.startsWith('cross-domain-')).length;

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
          : 'No critical operating threshold is elevated.'} Priorities now combine live operating pressure${historicalEvidenceAvailable ? ', real week-over-week evidence' : ''}${crossDomainCount > 0 ? ` and ${crossDomainCount} cross-domain correlation${crossDomainCount === 1 ? '' : 's'}` : ''}. Evidence remains tenant-scoped and observational; no cause is inferred without supporting data.`,
    signals,
    counters: { urgent, opportunities, dataQuality },
  };
}
