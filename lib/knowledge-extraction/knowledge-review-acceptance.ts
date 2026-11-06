import { createHash } from 'node:crypto';
import {
  validateAIDraftingResponse,
  type AIDraftingRequest,
  type ValidatedAIProposal,
} from './ai-draft-contract';
import {
  evaluateGroundedAIProposals,
  type GroundingEvaluationOptions,
  type GroundingReviewReason,
} from './ai-grounding-evaluation';
import type { ReviewSignalReport } from './source-review-signals';

/**
 * KB-03E: an end-to-end acceptance packet for OFFLINE/SYNTHETIC review only.
 *
 * The packet is not an authorization token or a database object.
 * It does not call the existing knowledge create/approve actions.
 * It does not call AI, fetch, store, export, approve or publish.
 *
 * A future approved handoff must independently verify authenticated tenant
 * ownership, explicit consent, retention, evidence authenticity, reviewer
 * identity and audited database authorization inside the write transaction.
 */
export type KnowledgeReviewAcceptanceRow = {
  proposalId: string;
  sourceDraftId: string;
  kind: 'faq' | 'fact';
  suggestedQuestion: string | null;
  exactSourceAnswer: string;
  sourceUrl: string;
  sourceFetchedAt: string;
  snapshotSha256: string;
  answerBlockId: string;
  answerBlockIndex: number;
  answerQuoteSha256: string;
  originalQuestion: string | null;
  originalQuestionQuoteSha256: string | null;
  reviewOutcome: 'hold_for_resolution' | 'manual_review_required';
  warningReasons: GroundingReviewReason[];
  reviewerDecision: 'not_recorded';
  reviewStatus: 'unreviewed';
  sourceTruthVerified: false;
  semanticsVerified: false;
  canApprove: false;
  canPublish: false;
};

export type KnowledgeReviewAcceptancePacket = {
  schemaVersion: 'kb03e-v1';
  state: 'synthetic_read_only_review';
  requestId: string;
  packetId: string;
  verifiedHostnameScope: string;
  reviewAsOf: string;
  rows: KnowledgeReviewAcceptanceRow[];
  counts: { proposals: number; held: number; needsHumanReview: number };
  requiredGates: {
    realSourceAndBrowserVisibilityVerified: false;
    tenantConsentAndRetentionApproved: false;
    independentConflictCoverageVerified: false;
    semanticAccuracyVerified: false;
    reviewerIdentityAndAuditVerified: false;
    stagingWriteAndRlsValidated: false;
    explicitMergeAndDeployApproval: false;
  };
  handoff: {
    existingCreateWorkflow: 'createKnowledgeDocumentAction';
    existingApprovalWorkflow: 'approveKnowledgeDocumentAction';
    integrationStatus: 'not_connected';
    allowedToInvoke: false;
  };
  aiProviderWasCalled: false;
  dataWasStored: false;
  canStore: false;
  canApprove: false;
  canPublish: false;
};

export type KnowledgeReviewAcceptanceResult =
  | { ok: true; packet: KnowledgeReviewAcceptancePacket }
  | { ok: false; error: string };

const hash=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');

function rowFrom(
  proposal: ValidatedAIProposal,
  outcome:'hold_for_resolution' | 'manual_review_required',
  reasons:GroundingReviewReason[],
):KnowledgeReviewAcceptanceRow {
  const c=proposal.answerCitation;
  return {
    proposalId:proposal.id,
    sourceDraftId:proposal.sourceDraftId,
    kind:proposal.kind,
    suggestedQuestion:proposal.question,
    exactSourceAnswer:proposal.answerOrStatement,
    sourceUrl:c.sourceUrl,
    sourceFetchedAt:c.fetchedAt,
    snapshotSha256:c.snapshotSha256,
    answerBlockId:c.blockId,
    answerBlockIndex:c.sourceBlockIndex,
    answerQuoteSha256:c.quoteSha256,
    originalQuestion:proposal.questionCitation?.exactQuote??null,
    originalQuestionQuoteSha256:proposal.questionCitation?.quoteSha256??null,
    reviewOutcome:outcome,
    warningReasons:[...reasons],
    reviewerDecision:'not_recorded',
    reviewStatus:'unreviewed',
    sourceTruthVerified:false,
    semanticsVerified:false,
    canApprove:false,
    canPublish:false,
  };
}

/**
 * Run the complete *safe* KB-03C -> KB-03D acceptance chain.
 *
 * The caller supplies untrusted model-like JSON, never privileged commands.
 * Replay/validation is mandatory; no caller may inject approved proposals or
 * bypass the grounding report. Existing approval paths are named for design
 * review only and cannot be invoked from this packet.
 */
export function prepareSyntheticKnowledgeReviewAcceptance(
  request:AIDraftingRequest,
  untrustedProposalJson:unknown,
  options:GroundingEvaluationOptions,
  reviewSignals?:ReviewSignalReport,
):KnowledgeReviewAcceptanceResult {
  const verified=validateAIDraftingResponse(untrustedProposalJson,request);
  if(!verified.ok){
    return {ok:false,error:'untrusted_ai_response_rejected'};
  }
  const evaluated=evaluateGroundedAIProposals(
    request,verified.result,options,reviewSignals,
  );
  if(!evaluated.ok){
    return {ok:false,error:'grounding_evaluation_rejected'};
  }
  const byId=new Map(evaluated.report.items.map(item=>[item.proposalId,item]));
  if(byId.size!==evaluated.report.items.length||
    byId.size!==verified.result.proposals.length){
    return {ok:false,error:'inconsistent_acceptance_rows'};
  }
  const rows:KnowledgeReviewAcceptanceRow[]=[];
  for(const proposal of verified.result.proposals){
    const evaluation=byId.get(proposal.id);
    if(!evaluation||
      evaluation.sourceDraftId!==proposal.sourceDraftId||
      evaluation.evidenceQuoteSha256!==proposal.answerCitation.quoteSha256||
      evaluation.evidenceSnapshotSha256!==proposal.answerCitation.snapshotSha256||
      evaluation.sourceUrl!==proposal.answerCitation.sourceUrl||
      evaluation.reviewStatus!=='unreviewed'||evaluation.canApprove!==false||
      evaluation.canPublish!==false){
      return {ok:false,error:'inconsistent_acceptance_rows'};
    }
    rows.push(rowFrom(proposal,evaluation.disposition,evaluation.reasons));
  }

  return {ok:true,packet:{
    schemaVersion:'kb03e-v1',
    state:'synthetic_read_only_review',
    requestId:request.requestId,
    packetId:hash(JSON.stringify([
      request.requestId,evaluated.report.asOf,
      evaluated.report.reviewAgeDays??null,
      rows.map(row=>[
        row.proposalId,row.answerQuoteSha256,
        row.reviewOutcome,row.warningReasons,
      ]),
    ])),
    verifiedHostnameScope:request.verifiedHostname,
    reviewAsOf:evaluated.report.asOf,
    rows,
    counts:{
      proposals:rows.length,
      held:rows.filter(row=>row.reviewOutcome==='hold_for_resolution').length,
      needsHumanReview:rows.length,
    },
    requiredGates:{
      realSourceAndBrowserVisibilityVerified:false,
      tenantConsentAndRetentionApproved:false,
      independentConflictCoverageVerified:false,
      semanticAccuracyVerified:false,
      reviewerIdentityAndAuditVerified:false,
      stagingWriteAndRlsValidated:false,
      explicitMergeAndDeployApproval:false,
    },
    handoff:{
      existingCreateWorkflow:'createKnowledgeDocumentAction',
      existingApprovalWorkflow:'approveKnowledgeDocumentAction',
      integrationStatus:'not_connected',
      allowedToInvoke:false,
    },
    aiProviderWasCalled:false,
    dataWasStored:false,
    canStore:false,
    canApprove:false,
    canPublish:false,
  }};
}
