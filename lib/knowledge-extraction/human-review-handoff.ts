import { createHash } from 'node:crypto';
import type { SourceChangeImpactReport } from './source-change-impact';
import type {
  KnowledgeReviewAcceptancePacket, KnowledgeReviewAcceptanceRow,
} from './knowledge-review-acceptance';

/**
 * KB-04D: deterministic, OFFLINE HUMAN-REVIEW HANDOFF SPECIFICATION.
 *
 * All "decisions" are simulated annotations on a read-only packet; they are
 * not approvals. There is no authenticated transaction, writer, storage,
 * actual reviewer identity proof or invocation of the existing knowledge
 * actions. A future executor must independently revalidate in a transaction.
 */
export type HumanReviewAnnotationKind =
  | 'hold_for_source_verification'
  | 'request_manual_correction'
  | 'dismiss_unverified_proposal';

export type HumanReviewAnnotation = {
  proposalId: string;
  changeId: string;
  annotation: HumanReviewAnnotationKind;
  reviewerNote: string;
};

export type HumanReviewHandoffInput = {
  organizationId: string;
  activeOrganizationId: string;
  reviewerId: string | null;
  reviewerRole: 'owner' | 'admin' | 'member' | 'unknown';
  recordedAt: string;
  acceptance: KnowledgeReviewAcceptancePacket;
  impact: SourceChangeImpactReport;
  annotations: HumanReviewAnnotation[];
};

export type HumanReviewHandoffRow = {
  proposalId: string;
  relatedChangeId: string | null;
  /** A prior quote is not current evidence, even after a reviewer note. */
  sourceChangeRelation: 'current_changed_quote' | 'superseded_or_removed_quote' | 'not_in_change_report';
  sourceUrl: string;
  sourceAnswer: string;
  sourceSnapshotSha256: string;
  sourceBlockId: string;
  annotation: HumanReviewAnnotationKind | 'awaiting_annotation';
  reviewerNote: string | null;
  disposition: 'hold_for_resolution' | 'manual_review_required';
  reviewState: 'unverified_advisory_only';
  needsRealHumanApproval: true;
  approved: false;
  canWrite: false;
};

export type HumanReviewHandoffPacket = {
  schemaVersion: 'kb04d-v1';
  state: 'synthetic_non_authorizing_handoff';
  organizationScope: string;
  reviewerIdentifierClaim: string | null;
  reviewerRoleClaim: 'owner' | 'admin' | 'member' | 'unknown';
  recordedAt: string;
  sourceAcceptancePacketId: string;
  packetId: string;
  rows: HumanReviewHandoffRow[];
  unresolvedChangeIds: string[];
  requirements: {
    sourceAuthenticityAndRenderedVisibilityVerified: false;
    tenantAndReviewerAuthenticatedInWriteTransaction: false;
    verifiedConsentRetentionAndDeletion: false;
    semanticAndTemporalConflictsResolved: false;
    sourceEvidenceAuditAndRlsValidated: false;
    publishedDocumentVersionRevalidated: false;
    explicitExistingWorkflowHumanApproval: false;
  };
  intendedExistingWorkflow: {
    create: 'createKnowledgeDocumentAction';
    approve: 'approveKnowledgeDocumentAction';
    connected: false;
    invoked: false;
  };
  annotationsStored: false;
  existingKnowledgeModified: false;
  canStore: false;
  canCreate: false;
  canApprove: false;
  canPublish: false;
};

export type HumanReviewHandoffResult =
  | { ok:true;packet:HumanReviewHandoffPacket }
  | { ok:false;error:string };

const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=(v:string)=>createHash('sha256').update(v,'utf8').digest('hex');
const kinds=new Set<HumanReviewAnnotationKind>([
  'hold_for_source_verification','request_manual_correction',
  'dismiss_unverified_proposal',
]);
function strictUtcTime(value:unknown):number|null{
  if(typeof value!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;
  const n=Date.parse(value);
  if(!Number.isFinite(n))return null;
  const [prefix,ms='']=value.slice(0,-1).split('.');
  return new Date(n).toISOString()===prefix+'.'+ms.padEnd(3,'0')+'Z'?n:null;
}
function validAcceptance(p:KnowledgeReviewAcceptancePacket,now:number):boolean{
  if(!p||p.schemaVersion!=='kb03e-v1'||p.state!=='synthetic_read_only_review'||
    !HASH.test(p.requestId)||!HASH.test(p.packetId)||
    !Array.isArray(p.rows)||p.rows.length>120||
    p.handoff?.existingCreateWorkflow!=='createKnowledgeDocumentAction'||
    p.handoff?.existingApprovalWorkflow!=='approveKnowledgeDocumentAction'||
    p.handoff?.integrationStatus!=='not_connected'||
    p.handoff?.allowedToInvoke!==false||
    p.aiProviderWasCalled!==false||p.dataWasStored!==false||
    p.canStore!==false||p.canApprove!==false||p.canPublish!==false||
    !p.requiredGates||
    Object.values(p.requiredGates).some(v=>v!==false)||
    !p.counts||p.counts.proposals!==p.rows.length||
    p.counts.needsHumanReview!==p.rows.length||
    typeof p.verifiedHostnameScope!=='string')return false;
  const reviewAt=strictUtcTime(p.reviewAsOf);
  if(reviewAt===null||reviewAt>now)return false;
  const seen=new Set<string>();
  let held=0;
  for(const row of p.rows){
    if(!row||!HASH.test(row.proposalId)||seen.has(row.proposalId)||
      !HASH.test(row.sourceDraftId)||!HASH.test(row.snapshotSha256)||
      !HASH.test(row.answerBlockId)||!HASH.test(row.answerQuoteSha256)||
      typeof row.exactSourceAnswer!=='string'||!row.exactSourceAnswer.trim()||
      row.exactSourceAnswer.length>6000||
      hash(row.exactSourceAnswer)!==row.answerQuoteSha256||
      !Number.isSafeInteger(row.answerBlockIndex)||row.answerBlockIndex<0||
      !['faq','fact'].includes(row.kind)||
      row.reviewerDecision!=='not_recorded'||row.reviewStatus!=='unreviewed'||
      row.sourceTruthVerified!==false||row.semanticsVerified!==false||
      row.canApprove!==false||row.canPublish!==false||
      !['hold_for_resolution','manual_review_required'].includes(row.reviewOutcome)||
      !Array.isArray(row.warningReasons)||
      strictUtcTime(row.sourceFetchedAt)===null||
      Date.parse(row.sourceFetchedAt)>reviewAt)return false;
    seen.add(row.proposalId);
    if(row.reviewOutcome==='hold_for_resolution')held++;
  }
  return held===p.counts.held;
}
function validImpact(p:SourceChangeImpactReport,now:number):boolean{
  if(!p||p.schemaVersion!=='kb04c-v1'||
    p.state!=='synthetic_change_impact_review'||
    !UUID.test(p.organizationScope??'')||
    p.sourceTruthDetermined!==false||
    p.semanticMappingVerifiedBySystem!==false||
    p.websiteOwnershipVerifiedBySystem!==false||
    p.evidenceStored!==false||p.publishedKnowledgeModified!==false||
    p.canFetch!==false||p.canStore!==false||
    p.canSuppressPublishedKnowledge!==false||
    p.canApprove!==false||p.canPublish!==false||
    !Array.isArray(p.changes)||p.changes.length>360||
    !Array.isArray(p.fieldReviews)||p.fieldReviews.length>360||
    !p.counts||p.counts.changes!==p.changes.length||
    p.counts.fieldsNeedingReview!==p.fieldReviews.length)return false;
  const t=strictUtcTime(p.asOf);
  if(t===null||t>now)return false;
  const seen=new Set<string>();
  for(const c of p.changes){
    if(!c||!HASH.test(c.changeId)||seen.has(c.changeId)||
      !['added','removed','modified'].includes(c.changeKind)||
      c.reviewStatus!=='unreviewed'||
      c.needsHumanReview!==true||
      c.actualKnowledgeSuppressed!==false||
      c.canUpdateKnowledge!==false||
      !Array.isArray(c.reasons)||
      !c.reasons.includes('source_authenticity_unverified')||
      (c.changeKind==='added'&&(!c.current||c.prior!==null))||
      (c.changeKind==='removed'&&(!c.prior||c.current!==null))||
      (c.changeKind==='modified'&&(!c.prior||!c.current)))return false;
    seen.add(c.changeId);
    for(const s of [c.prior,c.current]){
      if(!s)continue;
      if(s.sourceUrl!==p.verifiedHostnameScope &&
        !validScopedUrl(s.sourceUrl,p.verifiedHostnameScope))return false;
      if(!HASH.test(s.snapshotSha256)||!HASH.test(s.blockId)||
        !HASH.test(s.quoteSha256)||hash(s.exactQuote)!==s.quoteSha256||
        strictUtcTime(s.fetchedAt)===null)return false;
    }
  }
  return true;
}
function validScopedUrl(url:string,hostname:string):boolean{
  if(typeof url!=='string'||url.length>2048||
    typeof hostname!=='string'||hostname.length>253||
    !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(hostname)||
    hostname.includes('..'))return false;
  try{
    const u=new URL(url);
    return u.protocol==='https:'&&u.hostname===hostname&&!u.port&&
      !u.username&&!u.password&&!u.search&&!u.hash&&u.href===url;
  }catch{return false;}
}
function matchingQuote(
  row:KnowledgeReviewAcceptanceRow,
  source:NonNullable<SourceChangeImpactReport['changes'][number]['current']>,
):boolean{
  return row.sourceUrl===source.sourceUrl&&
    row.snapshotSha256===source.snapshotSha256&&
    row.answerBlockId===source.blockId&&
    row.answerQuoteSha256===source.quoteSha256&&
    row.exactSourceAnswer===source.exactQuote&&
    row.sourceFetchedAt===source.fetchedAt&&
    row.answerBlockIndex===source.sourceBlockIndex;
}

/**
 * This packet deliberately cannot grant permission even if every synthetic
 * annotation is "resolved". All sensitive claims remain unverified.
 */
export function prepareSyntheticHumanReviewHandoff(
  input:HumanReviewHandoffInput,
):HumanReviewHandoffResult{
  if(!input||!UUID.test(input.organizationId??'')||
    input.organizationId!==input.activeOrganizationId||
    (input.reviewerId!==null&&!UUID.test(input.reviewerId))||
    !['owner','admin','member','unknown'].includes(input.reviewerRole)||
    !Array.isArray(input.annotations)||input.annotations.length>120){
    return {ok:false,error:'invalid_handoff_scope'};
  }
  const now=strictUtcTime(input.recordedAt);
  if(now===null)return {ok:false,error:'invalid_review_time'};
  if(!validAcceptance(input.acceptance,now)||
    !validImpact(input.impact,now)||
    input.impact.organizationScope!==input.organizationId||
    input.acceptance.verifiedHostnameScope!==input.impact.verifiedHostnameScope){
    return {ok:false,error:'invalid_review_inputs'};
  }
  const byChange=new Map(input.impact.changes.map(c=>[c.changeId,c]));
  const byRow=new Map(input.acceptance.rows.map(r=>[r.proposalId,r]));
  const related=new Map<string,string[]>();
  const sourceRelation=new Map<string,HumanReviewHandoffRow['sourceChangeRelation']>();
  for(const row of input.acceptance.rows){
    const matches=input.impact.changes.filter(change=>
      (change.current&&matchingQuote(row,change.current))||
      (change.prior&&matchingQuote(row,change.prior)));
    related.set(row.proposalId,matches.map(c=>c.changeId));
    // Keep a prior snapshot distinct from the current one. Annotation
    // alone must not imply that a replaced or removed quote is resolved.
    sourceRelation.set(row.proposalId,matches.length!==1
      ? 'not_in_change_report'
      : matches[0].current&&matchingQuote(row,matches[0].current)
        ? 'current_changed_quote':'superseded_or_removed_quote');
  }
  const annotated=new Map<string,HumanReviewAnnotation>();
  for(const a of input.annotations){
    if(!a||!HASH.test(a.proposalId)||!HASH.test(a.changeId)||
      !kinds.has(a.annotation)||
      typeof a.reviewerNote!=='string'||a.reviewerNote.length>500||
      !a.reviewerNote.trim()||
      !byRow.has(a.proposalId)||!byChange.has(a.changeId)||
      !related.get(a.proposalId)?.includes(a.changeId)||
      annotated.has(a.proposalId))return {
      ok:false,error:'invalid_or_ambiguous_annotation',
    };
    annotated.set(a.proposalId,a);
  }
  const rows:HumanReviewHandoffRow[]=[];
  for(const row of input.acceptance.rows){
    const matches=related.get(row.proposalId)!;
    const annotation=annotated.get(row.proposalId);
    // Multiple matching changed quotes cannot be arbitrarily reduced to one.
    if(matches.length>1)return {ok:false,error:'ambiguous_changed_quote_mapping'};
    const relation=sourceRelation.get(row.proposalId)!;
    rows.push({
      proposalId:row.proposalId,relatedChangeId:matches[0]??null,
      sourceChangeRelation:relation,
      sourceUrl:row.sourceUrl,sourceAnswer:row.exactSourceAnswer,
      sourceSnapshotSha256:row.snapshotSha256,
      sourceBlockId:row.answerBlockId,
      annotation:annotation?.annotation??'awaiting_annotation',
      reviewerNote:annotation?.reviewerNote??null,
      disposition:relation==='superseded_or_removed_quote'
        ? 'hold_for_resolution':row.reviewOutcome,
      reviewState:'unverified_advisory_only',
      needsRealHumanApproval:true,approved:false,canWrite:false,
    });
  }
  const referenced=new Set(rows.map(r=>r.relatedChangeId).filter(
    (x):x is string=>x!==null));
  const unresolvedChangeIds=[...byChange.keys()].filter(id=>
    !referenced.has(id)||
    !rows.some(r=>r.relatedChangeId===id&&
      r.sourceChangeRelation==='current_changed_quote'&&
      r.annotation!=='awaiting_annotation')).sort();
  const packetId=hash(JSON.stringify([
    'kb04d-v1',input.organizationId,input.acceptance.packetId,
    input.recordedAt,input.impact.asOf,
    rows.map(r=>[r.proposalId,r.relatedChangeId,r.annotation,
      r.reviewerNote,r.sourceSnapshotSha256,r.sourceBlockId,
      r.sourceChangeRelation,r.disposition]),
    unresolvedChangeIds,
  ]));
  return {ok:true,packet:{
    schemaVersion:'kb04d-v1',state:'synthetic_non_authorizing_handoff',
    organizationScope:input.organizationId,
    reviewerIdentifierClaim:input.reviewerId,
    reviewerRoleClaim:input.reviewerRole,
    recordedAt:input.recordedAt,
    sourceAcceptancePacketId:input.acceptance.packetId,
    packetId,rows,unresolvedChangeIds,
    requirements:{
      sourceAuthenticityAndRenderedVisibilityVerified:false,
      tenantAndReviewerAuthenticatedInWriteTransaction:false,
      verifiedConsentRetentionAndDeletion:false,
      semanticAndTemporalConflictsResolved:false,
      sourceEvidenceAuditAndRlsValidated:false,
      publishedDocumentVersionRevalidated:false,
      explicitExistingWorkflowHumanApproval:false,
    },
    intendedExistingWorkflow:{
      create:'createKnowledgeDocumentAction',
      approve:'approveKnowledgeDocumentAction',
      connected:false,invoked:false,
    },
    annotationsStored:false,existingKnowledgeModified:false,
    canStore:false,canCreate:false,canApprove:false,canPublish:false,
  }};
}
