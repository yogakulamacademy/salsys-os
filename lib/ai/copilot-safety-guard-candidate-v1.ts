import 'server-only';

import { containsDirectContactDetail } from './lead-insight-output-guard';

/**
 * AI-11B — UNWIRED, review-only Co-Pilot route and draft safety candidate.
 *
 * Not imported by the existing Co-Pilot or Knowledge action. A real deployment
 * requires independent security/product review, server-owned Auth, current
 * tenant/lead permissions, verified evidence and witnessed staging acceptance.
 * Never call this a semantic claim checker or authority to send replies.
 */
export const COPILOT_SAFETY_GUARD_RUNTIME_WIRED = false as const;

type Risk = 'low' | 'review' | 'human_only';
type Complexity = 'simple' | 'complex';
type NextAction = 'reply' | 'handoff';

type ProposedRouter = Readonly<{
  complexity: Complexity;
  risk: Risk;
  intent: string;
  nextAction: NextAction;
  reason: string;
}>;

export type CandidateRouteResult =
  | Readonly<{ ok: false; reason: 'invalid_route_or_message'; maySend: false; mayExecute: false }>
  | Readonly<{
      ok: true;
      risk: Risk;
      complexity: Complexity;
      nextAction: NextAction;
      reasonCode: 'sensitive_latest_message' | 'commercial_exception' |
        'model_requested_review' | 'model_requested_handoff' | 'model_low_risk';
      manualReviewRequired: true;
      maySend: false;
      mayExecute: false;
    }>;

export type CandidateDraftResult =
  | Readonly<{
      ok: false;
      reason: 'invalid_draft' | 'sensitive_echo' | 'unsupported_commitment' | 'direct_contact_detail';
      manualReviewRequired: true;
      maySend: false;
      mayExecute: false;
    }>
  | Readonly<{
      ok: true;
      previewText: string;
      classification: 'unverified_human_review_draft_only';
      manualReviewRequired: true;
      maySend: false;
      mayExecute: false;
    }>;

const HIGH_RISK = [
  /\b(?:chargeback|refund dispute|dispute (?:a |my |the )?refund|legal action|lawsuit|sue you|my lawyer|attorney|medical emergency|physical harm|harassment|threatening)\b/i,
  /\b(?:refund\s+(?:me|my)\b|(?:want|need|request|demand)\s+(?:a |my |the )?refund\b)/i,
  /\b(?:serious complaint|file a complaint|unsafe conditions|emergency help)\b/i,
] as const;
const REVIEW_RISK = [
  /\b(?:discount|fee waiver|special exception|policy exception|refund policy|payment dispute|accommodation exception|private room exception)\b/i,
] as const;

const INSTRUCTION_ECHO = /\b(?:ignore|override|disregard)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions\b|\b(?:reveal|print|display|output)\s+(?:the\s+)?(?:api|secret|system)\s+(?:key|prompt|token)\b/i;

const UNSUPPORTED_COMMITMENTS = [
  /\b(?:payment|deposit|balance|refund|tuition|fees?)\b.{0,65}\b(?:confirmed|verified|settled|received|completed|processed|refunded|paid|approved)\b/i,
  /\b(?:confirmed|verified|settled|received|completed|processed|refunded|paid|approved)\b.{0,65}\b(?:payment|deposit|balance|refund|tuition|fees?)\b/i,
  /\b(?:booking|enrollment|enrolment|registration|admission)\b.{0,65}\b(?:confirmed|approved|guaranteed|completed|accepted|successful)\b/i,
  /\b(?:you(?:'re| are)|student is|you have been)\s+(?:(?:now|fully|already)\s+)?(?:enrolled|registered|admitted|accepted)\b/i,
  /\b(?:private\s+)?(?:room|accommodation|seat|spot|place)\b.{0,65}\b(?:reserved|secured|confirmed|guaranteed|available)\b/i,
  /\b(?:reserved|secured|confirmed|guaranteed)\b.{0,65}\b(?:room|accommodation|seat|spot|place)\b/i,
  /\b(?:certificate|certification)\b.{0,65}\b(?:guaranteed|issued|approved)\b/i,
] as const;

/**
 * Only entire *neutral verification* sentences receive a lexical exception.
 * A sentence like "I cannot confirm, but payment was received" is denied.
 * These patterns never claim a payment/booking/certificate actually happened.
 */
// The neutral exception is a WHOLE-CLAUSE allowlist, not a safe-looking
// prefix. Otherwise "I cannot confirm ...; your booking was confirmed"
// could slip through when both assertions appear in one sentence.
const NEUTRAL_VERIFICATION = [
  /^(?:i|we|our team|the team|admissions|the admissions team)\s+(?:cannot|can't|are unable to|is unable to)\s+(?:currently\s+)?confirm\s+(?:whether|if)\s+(?:(?:your|the|a)\s+)?(?:payment|deposit|refund|booking|room|seat)\s+(?:was|has been|is|will be)\s+(?:received|confirmed|processed|reserved|secured|available)$/i,
  /^(?:i|we|our team|the team|admissions|the admissions team)\s+(?:cannot|can't|are unable to|is unable to)\s+(?:currently\s+)?confirm\s+(?:the|your)\s+(?:refund|payment|deposit)\s+status\s+(?:without\s+checking|until\s+we\s+verify)$/i,
  /^(?:please|kindly)\s+(?:ask|check|verify|confirm)\s+(?:whether|if)\s+(?:(?:your|the|a)\s+)?(?:payment|deposit|refund|booking|room|seat)\s+(?:was|has been|is|will be)\s+(?:received|confirmed|processed|reserved|secured|available)$/i,
  /^(?:the admissions team|our team|the team|staff)\s+(?:can|will)\s+(?:check|verify|confirm)\s+(?:whether|if)\s+(?:(?:your|the|a)\s+)?(?:payment|deposit|refund|booking|room|seat)\s+(?:was|has been|is|will be)\s+(?:received|confirmed|processed|reserved|secured|available)$/i,
  /^(?:could|can|would)\s+you\s+(?:please\s+)?(?:confirm|verify|check)\s+(?:whether|if)\s+(?:(?:your|the|a)\s+)?(?:payment|deposit|refund|booking|room|seat)\s+(?:was|has been|is|will be)\s+(?:received|confirmed|processed|reserved|secured|available)$/i,
  /^(?:your|the)\s+(?:payment|deposit|refund)\s+(?:needs|requires)\s+(?:verification|review)$/i,
] as const;

function plain(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string' || !Object.hasOwn(descriptors[k], 'value'))) return null;
  return value as Record<string, unknown>;
}

function denyRoute(): CandidateRouteResult {
  return Object.freeze({ ok: false, reason: 'invalid_route_or_message', maySend: false, mayExecute: false });
}
function denyDraft(reason: Extract<CandidateDraftResult, {ok:false}>['reason']): CandidateDraftResult {
  return Object.freeze({ ok: false, reason, manualReviewRequired: true, maySend: false, mayExecute: false });
}

/**
 * Evaluate ONLY the latest inbound message. Never accept old messages,
 * retrieved knowledge, or a model-authored reason as local risk evidence.
 *
 * A high-risk latest request wins even if a successful model returns "low".
 * The output intentionally contains no user text or model-written reason.
 */
export function previewPostRouterSafety(
  latestInbound: unknown,
  modelRoute: unknown,
): CandidateRouteResult {
  try {
    if (typeof latestInbound !== 'string' || latestInbound.length < 1 ||
      latestInbound.length > 4000 || !latestInbound.trim() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(latestInbound)) return denyRoute();
    const route = plain(modelRoute);
    if (!route ||
      Reflect.ownKeys(route).length !== 5 ||
      !['complexity','risk','intent','nextAction','reason'].every(k=>Object.hasOwn(route,k)) ||
      !['low','review','human_only'].includes(route.risk as string) ||
      !['simple','complex'].includes(route.complexity as string) ||
      !['reply','handoff'].includes(route.nextAction as string) ||
      typeof route.intent !== 'string' || route.intent.length > 80 ||
      typeof route.reason !== 'string' || route.reason.length > 240) return denyRoute();

    const latest = latestInbound.trim();
    const high = HIGH_RISK.some(pattern=>pattern.test(latest));
    const review = REVIEW_RISK.some(pattern=>pattern.test(latest));

    const risk: Risk = high || route.risk === 'human_only' || route.nextAction === 'handoff'
      ? 'human_only'
      : review || route.risk === 'review' ? 'review' : 'low';
    const nextAction: NextAction = risk === 'human_only' ? 'handoff' : 'reply';
    const complexity: Complexity = risk !== 'low' ? 'complex' : route.complexity as Complexity;
    const reasonCode = high ? 'sensitive_latest_message'
      : risk === 'human_only' ? 'model_requested_handoff'
      : review ? 'commercial_exception'
      : risk === 'review' ? 'model_requested_review'
      : 'model_low_risk';
    return Object.freeze({
      ok: true as const, risk, complexity, nextAction, reasonCode,
      manualReviewRequired: true as const,
      maySend: false as const, mayExecute: false as const,
    });
  } catch {
    return denyRoute();
  }
}

/**
 * Lexical risk guard on model-authored text. A pass does NOT validate factual
 * accuracy or consent: staff review and trusted CRM evidence remain required.
 * A denial contains no customer/model text.
 */
export function previewCopilotDraftSafety(draft: unknown): CandidateDraftResult {
  if (typeof draft !== 'string' || !draft.trim() || draft.length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(draft)) return denyDraft('invalid_draft');

  const value = draft.trim();
  if (containsDirectContactDetail(value)) return denyDraft('direct_contact_detail');
  if (INSTRUCTION_ECHO.test(value)) return denyDraft('sensitive_echo');

  // Check individual sentences so an uncertainty disclaimer in one
  // sentence cannot whitelist an unsupported claim in the next.
  for (const fragment of value.split(/[.!?\n]+/)) {
    const sentence = fragment.trim();
    if (!sentence) continue;
    if (!UNSUPPORTED_COMMITMENTS.some(p=>p.test(sentence))) continue;
    const neutral = NEUTRAL_VERIFICATION.some(p=>p.test(sentence)) &&
      !/\b(?:but|however|although|nevertheless|yet)\b/i.test(sentence);
    if (!neutral) return denyDraft('unsupported_commitment');
  }
  return Object.freeze({
    ok: true as const,
    previewText: value,
    classification: 'unverified_human_review_draft_only' as const,
    manualReviewRequired: true as const,
    maySend: false as const,
    mayExecute: false as const,
  });
}
