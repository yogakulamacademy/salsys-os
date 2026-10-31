import type { LeadStage } from '@/types/crm';

export const ACTIVE_OPPORTUNITY_STAGES = [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'high_intent',
  'payment_pending',
] as const satisfies readonly LeadStage[];

export const TERMINAL_OPPORTUNITY_STAGES = [
  'enrolled',
  'lost',
  'unqualified',
  'duplicate',
] as const satisfies readonly LeadStage[];

export type ActiveOpportunityStage = (typeof ACTIVE_OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_STAGE_LABELS: Record<ActiveOpportunityStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  engaged: 'Engaged',
  qualified: 'Qualified',
  high_intent: 'High intent',
  payment_pending: 'Payment pending',
};

const activeStageSet = new Set<string>(ACTIVE_OPPORTUNITY_STAGES);
const terminalStageSet = new Set<string>(TERMINAL_OPPORTUNITY_STAGES);

export function isActiveOpportunityStage(stage: string | null | undefined) {
  return Boolean(stage && activeStageSet.has(stage));
}

export function isTerminalOpportunityStage(stage: string | null | undefined) {
  return Boolean(stage && terminalStageSet.has(stage));
}

export function isQualifiedOrLaterStage(stage: string | null | undefined) {
  return stage === 'qualified' ||
    stage === 'high_intent' ||
    stage === 'payment_pending' ||
    stage === 'enrolled';
}

export function opportunityStageLabel(stage: string | null | undefined) {
  if (!stage) return 'Unknown';
  if (stage in OPPORTUNITY_STAGE_LABELS) {
    return OPPORTUNITY_STAGE_LABELS[stage as ActiveOpportunityStage];
  }

  return stage
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
