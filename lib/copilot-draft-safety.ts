/**
 * Co-Pilot customer-draft guardrails.
 *
 * Only the latest inbound customer text is a routing signal. Older messages
 * and retrieved knowledge are untrusted context, never safety instructions.
 * This is a deliberately bounded deterministic defense-in-depth layer:
 * human review and tenant authorization remain mandatory.
 */
export type CopilotSafetyRouting = {
  complexity: 'simple' | 'complex';
  risk: 'low' | 'review' | 'human_only';
  intent: string;
  nextAction: 'reply' | 'handoff';
  reason: string;
};

const HUMAN_ONLY_PATTERNS = [
  /\b(?:charge[ -]?back|fraud(?:ulent)?|scam(?:med)?|lawyer|lawsuit|sue(?:d)?|legal action|police report|harass(?:ment|ed)?|medical emergency|unsafe|threaten(?:ed|ing)?|discriminat(?:ion|ed))\b/i,
  /\b(?:i|we)\s+(?:want|need|demand|requested|ask(?:ed)? for)\s+(?:a|my|our|the)?\s*(?:full|partial)?\s*(?:refund|money back|reimbursement)\b/i,
  /\b(?:refund|money back|reimbursement)\b.{0,65}\b(?:disput(?:e|ed|ing)|refus(?:e|ed|al)|overdue|still waiting|not received|never received|complaint|charged|urgent|immediately)\b/i,
  /\b(?:disput(?:e|ed|ing)|refus(?:e|ed|al)|overdue|still waiting|not received|never received|complaint)\b.{0,65}\b(?:refund|money back|reimbursement)\b/i,
  /\b(?:double[ -]?charged|charged twice|debited twice|payment dispute|unauthori[sz]ed charge|money was taken|paid but (?:not|never)|payment (?:was|is) missing)\b/i,
  /\b(?:i|we)\s+(?:have|want to|need to|would like to)\s+(?:file|make|raise|report)\s+(?:a|an|formal)?\s*complaint\b/i,
  /\b(?:serious|formal|urgent)\s+complaint\b/i,
];

const REVIEW_PATTERNS = [
  /\b(?:refund|cancellation|cancel(?:ling|ation)?|reimbursement|money back)\b/i,
  /\b(?:discount|price reduction|negotiate|waiv(?:e|er)|fee exception|policy exception|special exception)\b/i,
  /\b(?:payment proof|payment screenshot|payment confirmation|paid already|transfer receipt|bank transfer|payment failed|charge|deposit issue)\b/i,
  /\b(?:guarantee(?:d)? (?:a|my|the)?\s*(?:room|seat|place)|accommodation exception|room exception)\b/i,
  /\b(?:accommodation|room)\b.{0,45}\b(?:exception|special request|override|guarantee)\b/i,
  /\b(?:complaint|dissatisfied|unhappy with|medical advice|safety issue)\b/i,
];

function latestRisk(text: string): 'low' | 'review' | 'human_only' {
  const message = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!message) return 'review';

  if (HUMAN_ONLY_PATTERNS.some(pattern => pattern.test(message))) {
    return 'human_only';
  }

  // Explicitly denying an issue must not turn an unrelated factual question
  // into a complaint, refund or cancellation escalation.
  const neutralized = message
    .replace(/\b(?:no|not any|without any|don't have any|do not have any)\s+complaints?\b/gi, '')
    .replace(/\b(?:not (?:asking|requesting)(?: for)?|don't (?:want|need)|do not (?:want|need))\s+(?:a|any)?\s*refund\b/gi, '');
  return REVIEW_PATTERNS.some(pattern => pattern.test(neutralized))
    ? 'review'
    : 'low';
}

/**
 * Preserve the higher of model/fallback and local risk; never downgrade an
 * existing human-only or review decision. A human-only route always hands off.
 */
export function enforceLatestInboundSafety(
  modelDecision: CopilotSafetyRouting,
  latestInboundText: string,
): CopilotSafetyRouting {
  const minimum = latestRisk(latestInboundText);
  const rank = { low: 0, review: 1, human_only: 2 } as const;

  if (rank[modelDecision.risk] >= rank[minimum]) {
    return modelDecision.risk === 'human_only' &&
      (modelDecision.nextAction !== 'handoff' || modelDecision.complexity !== 'complex')
      ? { ...modelDecision, complexity: 'complex', nextAction: 'handoff' }
      : modelDecision;
  }

  const humanOnly = minimum === 'human_only';
  return {
    ...modelDecision,
    complexity: 'complex',
    risk: minimum,
    nextAction: humanOnly ? 'handoff' : modelDecision.nextAction,
    intent: humanOnly ? 'sensitive_request' : modelDecision.intent,
    reason: humanOnly
      ? 'Latest customer request requires human escalation; model routing cannot downgrade it.'
      : 'Latest customer request requires staff review; model routing cannot downgrade it.',
  };
}

// The current Co-Pilot supplies no independently verified payment, booking,
// accommodation or exception approval record to the model. Block affirmative
// commercial commitments instead of relying solely on an LLM instruction.
const UNSUPPORTED_COMMITMENTS = [
  /\b(?:your|the|this)\s+(?:payment|deposit|balance|fees?|tuition)\s+(?:(?:has|have)\s+(?:already\s+)?(?:been\s+)?|(?:is|was|were)\s+)(?:fully\s+|successfully\s+|already\s+)?(?:confirmed|received|settled|cleared|paid|processed|verified|completed|collected)\b/i,
  /\b(?:we|i|our team)\s+(?:(?:have|has|already|successfully|can|will)\s+)*(?:received|confirmed|verified|processed|approved)\s+(?:your|the)\s+(?:payment|deposit|refund|fees?|balance)\b/i,
  /\b(?:payment|deposit|refund|reimbursement)\s+(?:(?:has been|was|is)\s+)?(?:successful|confirmed|received|completed|processed|approved|issued|credited|settled)\b/i,
  /\b(?:your|the)\s+(?:refund|reimbursement)\s+(?:(?:has|have)\s+been\s+|(?:is|was)\s+)(?:processed|paid|issued|approved|credited|completed)\b/i,
  /\b(?:your|the)\s+(?:seat|slot|place|booking|reservation|enrolment|enrollment|room|accommodation)\s+(?:(?:has|have)\s+been\s+|(?:is|was)\s+)(?:confirmed|reserved|secured|guaranteed|booked|approved)\b/i,
  /\b(?:we|i|our team)\s+(?:have\s+|has\s+|will\s+|can\s+)*(?:reserved|secured|guaranteed|booked|confirmed)\s+(?:your|the)\s+(?:seat|slot|place|booking|reservation|room|accommodation|enrolment|enrollment)\b/i,
  /\b(?:your|the)\s+(?:discount|waiver|policy exception|cancellation exception)\s+(?:(?:has|have)\s+been\s+|(?:is|was)\s+)(?:approved|applied|confirmed|granted)\b/i,
  /\b(?:we|i|our team)\s+(?:(?:have|will)\s+)*(?:waived|waive|approved|granted)\s+(?:your|the)\s+(?:cancellation fee|refund exception|discount|policy exception|charges?)\b/i,
];

const CONDITIONAL_PREFIX = /^(?:if|once|when|after|provided that|assuming|should)\b/i;

/**
 * Checks generated CUSTOMER-FACING drafts, never incoming user data. It errs
 * toward withholding an unsupported promise; it is not a semantic proof,
 * and it does not authorize sending or any action.
 */
export function inspectCopilotDraftCommitments(
  draft: string,
): { ok: true } | { ok: false; error: string } {
  const clauses = String(draft ?? '')
    .split(/(?:[.!?;\n]+|\s+\b(?:but|however)\b\s+)/i)
    .map(part => part.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    if (CONDITIONAL_PREFIX.test(clause)) continue;
    if (UNSUPPORTED_COMMITMENTS.some(pattern => pattern.test(clause))) {
      return {
        ok: false,
        error: 'The AI draft made an unsupported payment, booking, accommodation or policy commitment. No customer-facing draft was returned; ask staff to verify evidence and regenerate.',
      };
    }
  }

  return { ok: true };
}
