import type { DashboardSnapshot } from '@/lib/dashboard-data';

export type SystemIntelligenceTone =
  | 'critical'
  | 'warning'
  | 'opportunity'
  | 'info'
  | 'healthy';

export type SystemIntelligenceCategory =
  | 'conversation'
  | 'follow_up'
  | 'pipeline'
  | 'revenue'
  | 'demand'
  | 'acquisition'
  | 'data_quality';

export type SystemIntelligenceRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'admissions'
  | 'viewer'
  | 'unknown';

export type SystemIntelligenceSignal = {
  id: string;
  category: SystemIntelligenceCategory;
  tone: SystemIntelligenceTone;
  score: number;
  title: string;
  reason: string;
  recommendedAction: string;
  metricLabel: string;
  metricValue: string;
  href: string;
  evidence: string[];
};

export type SystemIntelligenceBrief = {
  generatedAt: string;
  role: SystemIntelligenceRole;
  state: 'urgent' | 'attention' | 'opportunity' | 'healthy';
  headline: string;
  summary: string;
  attentionScore: number;
  signals: SystemIntelligenceSignal[];
  counters: {
    urgent: number;
    opportunities: number;
    dataQuality: number;
  };
};

export type BuildSystemIntelligenceOptions = {
  role?: string | null;
  maxSignals?: number;
};

function normalizeRole(role?: string | null): SystemIntelligenceRole {
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'manager') return 'manager';
  if (role === 'admissions') return 'admissions';
  if (role === 'viewer') return 'viewer';
  return 'unknown';
}

function roleBias(
  role: SystemIntelligenceRole,
  category: SystemIntelligenceCategory,
) {
  if (role === 'admissions') {
    if (category === 'conversation') return 8;
    if (category === 'follow_up') return 7;
    if (category === 'pipeline') return 5;
    if (category === 'revenue') return 2;
    if (category === 'data_quality') return -4;
    if (category === 'acquisition') return -6;
    if (category === 'demand') return -2;
  }

  if (role === 'manager') {
    if (category === 'conversation') return 4;
    if (category === 'follow_up') return 4;
    if (category === 'pipeline') return 5;
    if (category === 'revenue') return 5;
    if (category === 'demand') return 4;
    if (category === 'acquisition') return 3;
    if (category === 'data_quality') return 3;
  }

  if (role === 'owner' || role === 'admin') {
    if (category === 'revenue') return 6;
    if (category === 'demand') return 5;
    if (category === 'acquisition') return 5;
    if (category === 'data_quality') return 2;
    if (category === 'conversation') return 3;
    if (category === 'pipeline') return 3;
  }

  return 0;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-IN', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function currencyValue(currency: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      notation: value >= 100000 ? 'compact' : 'standard',
      maximumFractionDigits: value >= 100000 ? 1 : 0,
    }).format(value);
  } catch {
    return `${currency || ''} ${compactNumber(value)}`.trim();
  }
}

function applySignal(
  role: SystemIntelligenceRole,
  input: SystemIntelligenceSignal,
) {
  return {
    ...input,
    score: clampScore(input.score + roleBias(role, input.category)),
  };
}

export function buildSystemIntelligence(
  snapshot: DashboardSnapshot,
  now = new Date(),
  options: BuildSystemIntelligenceOptions = {},
): SystemIntelligenceBrief {
  const role = normalizeRole(options.role);
  const maxSignals = Math.max(1, Math.min(12, options.maxSignals ?? 6));
  const { metrics, counts, sources, revenueSummary, upcomingBatches, unvaluedOpenLeads } = snapshot;
  const signals: SystemIntelligenceSignal[] = [];
  const push = (input: SystemIntelligenceSignal) => signals.push(applySignal(role, input));

  const needsReply = integer(metrics.needsReply);
  const waitingOverHour = integer(metrics.waitingOverHour);

  // Correlate overlapping response-pressure evidence into one signal. Waiting >1h is
  // a subset of the reply queue, so surfacing both independently exaggerates urgency.
  if (needsReply > 0 || waitingOverHour > 0) {
    const severe = waitingOverHour > 0;
    const responseCount = Math.max(needsReply, waitingOverHour);
    push({
      id: 'conversation-response-pressure',
      category: 'conversation',
      tone: severe || needsReply >= 5 ? 'critical' : 'warning',
      score: severe
        ? 94 + Math.min(waitingOverHour, 6)
        : 88 + Math.min(needsReply, 8),
      title: severe
        ? `${waitingOverHour} ${waitingOverHour === 1 ? 'lead has' : 'leads have'} waited over an hour`
        : `${needsReply} ${needsReply === 1 ? 'conversation needs' : 'conversations need'} a reply`,
      reason: severe
        ? 'The reply queue contains conversations beyond the response-time threshold, making recovery the strongest immediate conversion-risk signal.'
        : 'Inbound demand is waiting on the team. Response delay can reduce conversion probability while intent is still active.',
      recommendedAction: severe
        ? 'Open the reply queue, handle the oldest high-intent conversations first, then clear the remaining reply backlog.'
        : 'Open the reply queue and work the highest-intent unanswered conversations first.',
      metricLabel: severe ? 'Waiting >1h' : 'Needs reply',
      metricValue: compactNumber(severe ? waitingOverHour : responseCount),
      href: '/conversations',
      evidence: [
        `${needsReply} conversation${needsReply === 1 ? '' : 's'} currently require a reply`,
        ...(waitingOverHour > 0
          ? [`${waitingOverHour} are beyond the one-hour threshold`]
          : []),
      ],
    });
  }

  const firstTouch = integer(metrics.needsFirstTouch);
  if (firstTouch > 0) {
    push({
      id: 'pipeline-first-touch',
      category: 'pipeline',
      tone: firstTouch >= 5 ? 'warning' : 'info',
      score: 80 + Math.min(firstTouch * 2, 12),
      title: `${firstTouch} new ${firstTouch === 1 ? 'lead has' : 'leads have'} not received a first touch`,
      reason: 'New demand is in the CRM but has not yet entered an active sales conversation.',
      recommendedAction: 'Work the newest uncontacted leads while intent is still fresh.',
      metricLabel: 'First touch due',
      metricValue: compactNumber(firstTouch),
      href: '/leads',
      evidence: [`${firstTouch} lead${firstTouch === 1 ? '' : 's'} are in New with no recorded contact`],
    });
  }

  const followupsDue = integer(metrics.followupsDue);
  if (followupsDue > 0) {
    push({
      id: 'follow-up-due',
      category: 'follow_up',
      tone: followupsDue >= 8 ? 'warning' : 'info',
      score: 76 + Math.min(followupsDue * 2, 14),
      title: `${followupsDue} follow-${followupsDue === 1 ? 'up is' : 'ups are'} due`,
      reason: 'Scheduled sales commitments are due and should stay ahead of lower-value administrative work.',
      recommendedAction: 'Clear overdue follow-ups first, then work today’s remaining queue.',
      metricLabel: 'Follow-ups due',
      metricValue: compactNumber(followupsDue),
      href: '/follow-ups',
      evidence: [`${followupsDue} due follow-up${followupsDue === 1 ? '' : 's'} in the current workspace`],
    });
  }

  const paymentPending = integer(counts.payment_pending);
  if (paymentPending > 0) {
    push({
      id: 'pipeline-payment-pending',
      category: 'revenue',
      tone: 'opportunity',
      score: 86 + Math.min(paymentPending, 8),
      title: `${paymentPending} ${paymentPending === 1 ? 'opportunity is' : 'opportunities are'} at payment pending`,
      reason: 'These leads are closest to enrollment and carry the highest immediate revenue intent in the current pipeline.',
      recommendedAction: 'Check payment blockers, unanswered questions and pending confirmations before prospecting colder leads.',
      metricLabel: 'Payment pending',
      metricValue: compactNumber(paymentPending),
      href: '/leads',
      evidence: [`${paymentPending} lead${paymentPending === 1 ? '' : 's'} are in payment_pending`],
    });
  }

  const highIntent = integer(counts.high_intent);
  if (highIntent > 0) {
    push({
      id: 'pipeline-high-intent',
      category: 'pipeline',
      tone: 'opportunity',
      score: 78 + Math.min(highIntent, 10),
      title: `${highIntent} high-intent ${highIntent === 1 ? 'lead is' : 'leads are'} ready for focused follow-up`,
      reason: 'The pipeline already contains strong intent signals that should be converted before widening acquisition effort.',
      recommendedAction: 'Review high-intent leads for unresolved objections, batch fit and payment readiness.',
      metricLabel: 'High intent',
      metricValue: compactNumber(highIntent),
      href: '/leads',
      evidence: [`${highIntent} lead${highIntent === 1 ? '' : 's'} currently sit in high_intent`],
    });
  }

  const openUnvalued = integer(unvaluedOpenLeads);
  if (openUnvalued > 0) {
    const active = Math.max(1, integer(metrics.activePipeline));
    const share = openUnvalued / active;
    push({
      id: 'data-unvalued-open-leads',
      category: 'data_quality',
      tone: share >= 0.35 ? 'warning' : 'info',
      score: 58 + Math.min(Math.round(share * 45), 22),
      title: `${openUnvalued} open ${openUnvalued === 1 ? 'lead is' : 'leads are'} missing value data`,
      reason: 'Missing opportunity values reduce the quality of revenue prioritization and forecasting.',
      recommendedAction: 'Add expected value to qualified and high-intent opportunities where the commercial amount is known.',
      metricLabel: 'Unvalued open',
      metricValue: compactNumber(openUnvalued),
      href: '/leads',
      evidence: [`${Math.round(share * 100)}% of the active pipeline is currently unvalued`],
    });
  }

  // Currency rows remain independent. We intentionally do not compare raw INR/USD/etc.
  // amounts without an explicit FX-normalization source.
  const revenue = revenueSummary
    .map((row) => ({
      currency: String(row.currency || '').trim() || 'INR',
      pipeline: Number(row.pipeline || 0),
      weighted: Number(row.weighted || 0),
      collected: Number(row.collected || 0),
      outstanding: Number(row.outstanding || 0),
      opportunities: integer(row.opportunities),
    }))
    .filter((row) => row.outstanding > 0);

  for (const row of revenue) {
    push({
      id: `revenue-outstanding-${row.currency.toLowerCase()}`,
      category: 'revenue',
      tone: 'opportunity',
      score: 72 + Math.min(row.opportunities, 12),
      title: `${currencyValue(row.currency, row.outstanding)} remains outstanding`,
      reason: `Outstanding value is elevated inside the ${row.currency} revenue view. SalsysOS keeps currencies separate rather than making an unsupported cross-currency comparison.`,
      recommendedAction: 'Review payment-pending and enrolled records with an outstanding balance before adding new discounts or offers.',
      metricLabel: `${row.currency} outstanding`,
      metricValue: currencyValue(row.currency, row.outstanding),
      href: '/revenue',
      evidence: [
        `${row.opportunities} valued opportunit${row.opportunities === 1 ? 'y' : 'ies'}`,
        `${currencyValue(row.currency, row.collected)} collected in ${row.currency}`,
      ],
    });
  }

  const pressuredBatch = upcomingBatches
    .filter((batch) => batch.capacity !== null && batch.seatsRemaining !== null && Number(batch.capacity) > 0)
    .map((batch) => ({
      ...batch,
      occupancyPressure: 1 - Math.max(0, Number(batch.seatsRemaining)) / Math.max(1, Number(batch.capacity)),
    }))
    .sort((a, b) => {
      const aPressure = a.occupancyPressure + Math.min(a.hotDemand / Math.max(1, a.capacity || 1), 1);
      const bPressure = b.occupancyPressure + Math.min(b.hotDemand / Math.max(1, b.capacity || 1), 1);
      return bPressure - aPressure;
    })[0];

  if (pressuredBatch && (pressuredBatch.hotDemand > 0 || pressuredBatch.occupancyPressure >= 0.65)) {
    push({
      id: `demand-batch-${pressuredBatch.id}`,
      category: 'demand',
      tone: pressuredBatch.seatsRemaining !== null && pressuredBatch.seatsRemaining <= 3 ? 'warning' : 'opportunity',
      score: 68 + Math.round(pressuredBatch.occupancyPressure * 18) + Math.min(pressuredBatch.hotDemand, 8),
      title: `${pressuredBatch.courseName} is showing concentrated demand`,
      reason: `${pressuredBatch.hotDemand} hot-demand lead${pressuredBatch.hotDemand === 1 ? '' : 's'} are associated with this batch${pressuredBatch.seatsRemaining !== null ? ` and ${pressuredBatch.seatsRemaining} seat${pressuredBatch.seatsRemaining === 1 ? '' : 's'} remain` : ''}.`,
      recommendedAction: 'Prioritize matching high-intent leads to this batch and verify capacity before increasing promotion.',
      metricLabel: 'Hot demand',
      metricValue: compactNumber(pressuredBatch.hotDemand),
      href: '/course-management',
      evidence: [
        `${pressuredBatch.activeDemand} active-demand lead${pressuredBatch.activeDemand === 1 ? '' : 's'}`,
        pressuredBatch.seatsRemaining !== null ? `${pressuredBatch.seatsRemaining} seats remaining` : 'Capacity not set',
      ],
    });
  }

  const qualifiedSources = sources
    .filter((row) => integer(row.leads) >= 3)
    .map((row) => ({
      ...row,
      qualificationRate: integer(row.leads) > 0 ? integer(row.qualified) / integer(row.leads) : 0,
    }))
    .sort((a, b) => b.qualificationRate - a.qualificationRate || b.leads - a.leads);

  const bestSource = qualifiedSources[0];
  if (bestSource && bestSource.qualified > 0) {
    push({
      id: `acquisition-source-${bestSource.source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      category: 'acquisition',
      tone: 'opportunity',
      score: 58 + Math.min(Math.round(bestSource.qualificationRate * 25), 25),
      title: `${bestSource.source} is currently the strongest qualified source`,
      reason: `${Math.round(bestSource.qualificationRate * 100)}% of loaded leads from this source have reached Qualified+ in the current dashboard evidence.`,
      recommendedAction: 'Inspect the source’s recent campaigns and lead quality before reallocating budget or effort; treat this as directional until volume is sufficient.',
      metricLabel: 'Qualified rate',
      metricValue: `${Math.round(bestSource.qualificationRate * 100)}%`,
      href: '/campaigns',
      evidence: [`${bestSource.leads} leads`, `${bestSource.qualified} Qualified+`, `${bestSource.share}% lead share`],
    });
  }

  if (signals.length === 0) {
    push({
      id: 'healthy-no-urgent-signals',
      category: 'pipeline',
      tone: 'healthy',
      score: 20,
      title: 'No urgent operating signal is currently elevated',
      reason: 'The current dashboard snapshot does not show overdue reply, follow-up or high-intent pressure.',
      recommendedAction: 'Use the available capacity for proactive pipeline development and data-quality improvement.',
      metricLabel: 'Urgent signals',
      metricValue: '0',
      href: '/leads',
      evidence: ['No urgent threshold crossed in the current dashboard snapshot'],
    });
  }

  signals.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const top = signals[0];
  const urgent = signals.filter((item) => item.tone === 'critical' || item.score >= 90).length;
  const opportunities = signals.filter((item) => item.tone === 'opportunity').length;
  const dataQuality = signals.filter((item) => item.category === 'data_quality').length;

  const attentionScore = top ? top.score : 0;
  const state: SystemIntelligenceBrief['state'] = urgent > 0
    ? 'urgent'
    : attentionScore >= 75
      ? 'attention'
      : opportunities > 0
        ? 'opportunity'
        : 'healthy';

  const headline = top?.title || 'Operations are stable';
  const roleSummary = role === 'admissions'
    ? 'The ranking is tuned toward response, follow-up and pipeline work for admissions.'
    : role === 'manager'
      ? 'The ranking balances frontline pressure with pipeline, revenue and operating quality.'
      : role === 'owner' || role === 'admin'
        ? 'The ranking includes executive-weighted revenue, demand and acquisition context while preserving urgent frontline work.'
        : 'The ranking uses the shared operating priority model.';

  const summary = state === 'urgent'
    ? `Immediate response risk is elevated. Work the highest-ranked item before lower-priority activity. ${roleSummary}`
    : state === 'attention'
      ? `The system found active work that can materially improve pipeline movement if handled now. ${roleSummary}`
      : state === 'opportunity'
        ? `No critical queue is elevated. Focus can shift toward the strongest conversion and demand opportunities. ${roleSummary}`
        : `No critical operating threshold is elevated in the current evidence. ${roleSummary}`;

  return {
    generatedAt: now.toISOString(),
    role,
    state,
    headline,
    summary,
    attentionScore,
    signals: signals.slice(0, maxSignals),
    counters: { urgent, opportunities, dataQuality },
  };
}
