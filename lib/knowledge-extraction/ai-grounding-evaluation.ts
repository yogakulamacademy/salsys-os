import { createHash } from 'node:crypto';
import {
  validateAIDraftingResponse,
  type AIDraftingRequest,
  type ValidatedAIResponse,
  type ValidatedAIProposal,
} from './ai-draft-contract';
import type { ReviewSignalReport, ReviewSignal } from './source-review-signals';

/**
 * KB-03D: fail-closed quality *triage*, not semantic proof.
 *
 * Rechecks KB-03C output against original request, then marks unverified
 * implications / source conflicts for human review. Static lexical checks
 * cannot establish entailment, source truth, or factual correctness.
 * Does not call an AI provider, fetch, store, approve or publish.
 */
export type GroundingReviewReason =
  | 'unresolved_source_difference'
  | 'outdated_source_recheck'
  | 'freshness_not_evaluated'
  | 'source_difference_review_not_supplied'
  | 'unsupported_question_context'
  | 'high_impact_question_context'
  | 'possible_prompt_injection_in_source'
  | 'price_date_policy_requires_review'
  | 'sensitive_source_requires_specialist_review';

export type GroundingReviewItem = {
  id: string;
  proposalId: string;
  sourceDraftId: string;
  reviewStatus: 'unreviewed';
  disposition: 'hold_for_resolution' | 'manual_review_required';
  reasons: GroundingReviewReason[];
  evidenceQuoteSha256: string;
  evidenceSnapshotSha256: string;
  sourceUrl: string;
  sourceFetchedAt: string;
  canApprove: false;
  canPublish: false;
};

export type GroundingEvaluationReport = {
  state: 'not_semantically_verified';
  asOf: string;
  reviewAgeDays: number | null;
  items: GroundingReviewItem[];
  evaluated: number;
  held: number;
  conflictCoverage: 'review_signal_hints' | 'not_supplied';
  semanticsVerified: false;
  sourceTruthVerified: false;
  canStore: false;
  canApprove: false;
  canPublish: false;
};

export type GroundingEvaluationResult =
  | { ok:true; report:GroundingEvaluationReport }
  | { ok:false; error:string };

export type GroundingEvaluationOptions = {
  asOf: string;
  /** Review-age threshold is not a retention policy or correctness claim. */
  reviewAgeDays?:number;
};

const SHA=/^[0-9a-f]{64}$/;
const MAX_PROPOSALS=12;
const MAX_SIGNAL_ENTRIES=150;
const MAX_SIGNAL_SOURCES=16;
const hash=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');

function validDate(value:unknown):value is string {
  return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)&&
    Number.isFinite(Date.parse(value));
}

function validSourceOnHost(url:unknown,host:string):boolean {
  if(typeof url!=='string'||url.length>2048||typeof host!=='string'||host.length>253)return false;
  try {
    const parsed=new URL(url);
    return parsed.protocol==='https:'&&parsed.hostname===host.toLowerCase()&&
      !parsed.username&&!parsed.password&&!parsed.port;
  }catch{return false;}
}

function signalShapeValid(s:ReviewSignal,host:string):boolean {
  return !!s&&SHA.test(s.id)&&
    ['price_difference_review','date_difference_review',
      'policy_text_variation_review','source_age_review'].includes(s.kind)&&
    s.reviewStatus==='unreviewed'&&s.manualReviewRequired===true&&
    s.canPublish===false&&Array.isArray(s.sources)&&
    s.sources.length>0&&s.sources.length<=MAX_SIGNAL_SOURCES&&
    s.sources.every(c=>!!c&&validSourceOnHost(c.sourceUrl,host)&&
      validDate(c.fetchedAt)&&SHA.test(c.snapshotSha256)&&
      (c.draftId===null||SHA.test(c.draftId))&&
      (c.blockId===null||SHA.test(c.blockId))&&
      (c.quoteSha256===null||SHA.test(c.quoteSha256))&&
      (c.exactQuote===null||(typeof c.exactQuote==='string'&&
        c.exactQuote.length>0&&c.exactQuote.length<=1400&&
        c.quoteSha256===hash(c.exactQuote))));
}

function shapeValid(signals:ReviewSignalReport|undefined,host:string):boolean {
  if(signals===undefined)return true;
  return !!signals&&signals.state==='needs_human_review'&&
    signals.canStore===false&&signals.canPublish===false&&
    signals.sourceTruthDetermined===false&&Array.isArray(signals.signals)&&
    signals.signals.length<=MAX_SIGNAL_ENTRIES&&
    Array.isArray(signals.issues)&&signals.issues.length<=180&&
    signals.signals.every(x=>signalShapeValid(x,host));
}

const STOP=new Set([
  'a','an','the','is','are','was','were','be','been','being','can',
  'could','will','would','should','may','might','does','do','did','has',
  'have','had','what','when','where','which','how','who','why','i','we',
  'you','your','our','it','its','in','on','for','with','from','to',
  'of','and','or','at','by','about','this','that','these','those',
  'all','any','one','there','here','if','as','per','please',
]);

function words(s:string):Set<string> {
  const matches=s.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu)??[];
  return new Set(matches.map(w=>w.replace(/(?:ing|ed|s)$/,'')).filter(w=>
    w.length>=3&&!STOP.has(w)));
}

const MATERIAL_TERMS=new Set([
  'accredit','certifi','guarante','refund','cancel','scholarship',
  'free','unlimit','licens','insur','pregnan','doctor','medic',
  'safe','legal','approved','eligib','visa','discount',
]);

const INSTRUCTION_LIKE=
  /\b(?:ignore (?:all |any )?(?:previous|prior|system) instructions|override (?:the )?(?:system|developer) instructions|reveal (?:your|the) (?:secret|system prompt)|automatically publish|bypass (?:security|approval|safety))\b/i;

function questionReasons(proposal:ValidatedAIProposal,
  request:AIDraftingRequest):GroundingReviewReason[] {
  if(proposal.kind!=='faq'||!proposal.modelGeneratedQuestion||!proposal.question)return [];
  const source=request.evidence.find(x=>x.sourceDraftId===proposal.sourceDraftId);
  if(!source)return ['unsupported_question_context'];
  const context=[
    source.exactAnswerQuote,source.originalQuestion??'',
    ...source.answerCitation.headingPath,
  ].join(' ');
  const query=words(proposal.question);
  const known=words(context);
  const shared=[...query].filter(word=>known.has(word));
  // High-impact claims such as pregnancy, certification or discounts
  // require explicit source wording. A price quotation does not establish
  // that a discount, refund, accreditation or safety guarantee exists.
  const unsupported=[...query].filter(word=>
    [...MATERIAL_TERMS].some(term=>word.startsWith(term))&&
    ![...known].some(existing=>existing.startsWith(word)||word.startsWith(existing)));
  const reasons:GroundingReviewReason[]=[];
  if(shared.length<2) reasons.push('unsupported_question_context');
  if(unsupported.length) reasons.push('high_impact_question_context');
  return reasons;
}

function quoteLinkedToSignal(proposal:ValidatedAIProposal,s:ReviewSignal):boolean {
  const citation=proposal.answerCitation;
  return s.sources.some(x=>x.blockId===citation.blockId&&
    x.snapshotSha256===citation.snapshotSha256&&
    x.quoteSha256===citation.quoteSha256&&x.sourceUrl===citation.sourceUrl&&
    x.exactQuote===citation.exactQuote);
}

export function evaluateGroundedAIProposals(
  request:AIDraftingRequest,
  response:ValidatedAIResponse,
  options:GroundingEvaluationOptions,
  signals?:ReviewSignalReport,
):GroundingEvaluationResult {
  if(!options||!validDate(options.asOf)||
    (options.reviewAgeDays!==undefined&&
      (!Number.isSafeInteger(options.reviewAgeDays)||
        options.reviewAgeDays<1||options.reviewAgeDays>3650))){
    return {ok:false,error:'invalid_evaluation_settings'};
  }
  if(!shapeValid(signals,request?.verifiedHostname)){
    return {ok:false,error:'invalid_review_signal_report'};
  }
  if(!response||response.state!=='synthetic_model_response_validated'||
    response.canPublish!==false||response.canStore!==false||
    response.aiOutputApproved!==false||response.meaningVerified!==false||
    response.sourceClaimsVerified!==false||
    !Array.isArray(response.proposals)||response.proposals.length>MAX_PROPOSALS){
    return {ok:false,error:'invalid_validated_response'};
  }
  const reconstructed=response.proposals.map(p=>p.kind==='faq'?{
    kind:'faq',sourceDraftId:p.sourceDraftId,question:p.question,
    answer:p.answerOrStatement,
  }:{
    kind:'fact',sourceDraftId:p.sourceDraftId,statement:p.answerOrStatement,
  });
  const replay=validateAIDraftingResponse({
    schemaVersion:'kb03c-v1',requestId:request?.requestId,proposals:reconstructed,
  },request);
  if(!replay.ok||
    JSON.stringify(replay.result.proposals)!==JSON.stringify(response.proposals)){
    return {ok:false,error:'proposal_provenance_revalidation_failed'};
  }

  const now=Date.parse(options.asOf);
  const items:GroundingReviewItem[]=[];
  for(const proposal of response.proposals){
    const c=proposal.answerCitation;
    const age=now-Date.parse(c.fetchedAt);
    if(age < -5*60_000)return {ok:false,error:'source_timestamp_in_future'};
    const reasons:GroundingReviewReason[]=[];
    if(signals===undefined)reasons.push('source_difference_review_not_supplied');
    if(options.reviewAgeDays===undefined){
      reasons.push('freshness_not_evaluated');
    }else if(age>=options.reviewAgeDays*86400000){
      reasons.push('outdated_source_recheck');
    }
    if(signals?.signals.some(s=>
      s.kind!=='source_age_review'&&quoteLinkedToSignal(proposal,s))){
      reasons.push('unresolved_source_difference');
    }
    const lexical=questionReasons(proposal,request);
    reasons.push(...lexical);
    if(proposal.riskReminders.some(r=>
      r==='pricing_or_amounts'||r==='dates_and_schedule'||
      r==='policy_or_eligibility')){
      reasons.push('price_date_policy_requires_review');
    }
    if(proposal.riskReminders.includes('sensitive_claim_review'))
      reasons.push('sensitive_source_requires_specialist_review');
    if(INSTRUCTION_LIKE.test(c.exactQuote))
      reasons.push('possible_prompt_injection_in_source');
    const unique=[...new Set(reasons)];
    const hold=unique.some(x=>[
      'unresolved_source_difference','outdated_source_recheck',
      'freshness_not_evaluated','source_difference_review_not_supplied',
      'unsupported_question_context',
      'high_impact_question_context','possible_prompt_injection_in_source',
    ].includes(x));
    items.push({
      id:hash(JSON.stringify([proposal.id,options.asOf,
        options.reviewAgeDays??null,unique])),
      proposalId:proposal.id,sourceDraftId:proposal.sourceDraftId,
      reviewStatus:'unreviewed',
      disposition:hold?'hold_for_resolution':'manual_review_required',
      reasons:unique,evidenceQuoteSha256:c.quoteSha256,
      evidenceSnapshotSha256:c.snapshotSha256,
      sourceUrl:c.sourceUrl,sourceFetchedAt:c.fetchedAt,
      canApprove:false,canPublish:false,
    });
  }
  return {ok:true,report:{
    state:'not_semantically_verified',asOf:options.asOf,
    reviewAgeDays:options.reviewAgeDays??null,items,
    evaluated:items.length,
    held:items.filter(x=>x.disposition==='hold_for_resolution').length,
    conflictCoverage:signals?'review_signal_hints':'not_supplied',
    semanticsVerified:false,sourceTruthVerified:false,
    canStore:false,canApprove:false,canPublish:false,
  }};
}
