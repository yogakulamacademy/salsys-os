import { createHash } from 'node:crypto';
import type { HumanReviewHandoffPacket } from './human-review-handoff';

/**
 * KB-08D — OFFLINE-only preflight between source-review packets and the
 * existing Knowledge workspace approval actions. NEVER creates an RPC call.
 *
 * IMPORTANT: all input observations are caller-supplied synthetic claims, NOT
 * authoritative database readbacks or proof of current website contents.
 * Existing approve_knowledge_document_v1(org, document_id) has no expected
 * version or evidence-hash arguments, so matching claims cannot authorize it.
 */
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = (value:string) => createHash('sha256').update(value,'utf8').digest('hex');

export type SyntheticDocumentClaim = {
  organizationId:string;
  documentId:string;
  version:number;
  status:'draft'|'review'|'approved'|'superseded'|'archived'|'expired';
  observedAt:string;
};
export type SyntheticSourceClaim = {
  sourceUrl:string;
  snapshotSha256:string;
  blockId:string;
  quoteSha256:string;
  observedAt:string;
};
export type ApprovalVersionPreflightInput = {
  organizationId:string;
  proposalId:string;
  expectedDocumentVersion:number;
  handoff:HumanReviewHandoffPacket;
  documentClaim:SyntheticDocumentClaim|null;
  latestSourceClaim:SyntheticSourceClaim|null;
};
export type ApprovalVersionPreflightCheck = {
  id:'handoff_is_synthetic_and_unapproved'|'tenant_scope_claim_matches'|
    'unique_proposal'|'current_changed_source'|'no_unresolved_changes'|
    'document_draft_claim'|'document_version_claim_matches'|
    'latest_citation_claim_matches'|'observations_after_review';
  state:'matched_claim_only'|'blocked';
};
export type ApprovalVersionPreflight = {
  schemaVersion:'kb08d-v1';
  state:'synthetic_claims_consistent_only'|'blocked_for_source_or_version_review';
  packetId:string;
  handoffPacketId:string;
  proposalId:string;
  documentId:string|null;
  checks:ApprovalVersionPreflightCheck[];
  missingChecks:string[];
  existingApprovalWorkflow:{
    action:'approveKnowledgeDocumentAction';
    rpc:'approve_knowledge_document_v1';
    rpcHasExpectedVersionArgument:false;
    rpcHasSourceEvidenceFingerprintArgument:false;
    connected:false;
    invoked:false;
  };
  requiredRealGates:{
    independentCurrentSourceRetrieved:false;
    authenticatedTenantAndReviewerVerified:false;
    atomicDocumentVersionRechecked:false;
    atomicSourceSnapshotAndQuoteRechecked:false;
    consentRetentionAndDeletionApproved:false;
    explicitHumanApprovalInExistingWorkflow:false;
  };
  observationsAreIndependentEvidence:false;
  sourceTruthVerified:false;
  approvalGranted:false;
  canStore:false;
  canInvokeExistingApproval:false;
  canApprove:false;
  canPublish:false;
};
export type ApprovalVersionPreflightResult =
  | {ok:true;report:ApprovalVersionPreflight}
  | {ok:false;error:'invalid_synthetic_preflight_input'};

function utcMillis(value:unknown):number|null {
  if(typeof value!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;
  const time=Date.parse(value);
  if(!Number.isFinite(time))return null;
  const [base,part='']=value.slice(0,-1).split('.');
  return new Date(time).toISOString()===base+'.'+part.padEnd(3,'0')+'Z'
    ? time:null;
}
function validSourceUrl(value:unknown):boolean {
  if(typeof value!=='string'||value.length>2048)return false;
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
      !url.search&&!url.hash&&url.href===value;
  }catch{return false;}
}
function validDocumentClaim(c:SyntheticDocumentClaim|null):boolean {
  return c===null||(
    UUID.test(c.organizationId)&&UUID.test(c.documentId)&&
    Number.isSafeInteger(c.version)&&c.version>=1&&
    ['draft','review','approved','superseded','archived','expired'].includes(c.status)&&
    utcMillis(c.observedAt)!==null
  );
}
function validSourceClaim(c:SyntheticSourceClaim|null):boolean {
  return c===null||(
    validSourceUrl(c.sourceUrl)&&HASH.test(c.snapshotSha256)&&
    HASH.test(c.blockId)&&HASH.test(c.quoteSha256)&&utcMillis(c.observedAt)!==null
  );
}

/**
 * Comparison of untrusted claims only. A match is a review aid, never a
 * permission to call createKnowledgeDocumentAction or approveKnowledgeDocumentAction.
 */
export function inspectSyntheticApprovalVersionBoundary(
  input:ApprovalVersionPreflightInput,
):ApprovalVersionPreflightResult {
  if(!input||!UUID.test(input.organizationId??'')||
    !HASH.test(input.proposalId??'')||
    !Number.isSafeInteger(input.expectedDocumentVersion)||
    input.expectedDocumentVersion<1||
    !validDocumentClaim(input.documentClaim)||
    !validSourceClaim(input.latestSourceClaim)||
    !input.handoff||input.handoff.schemaVersion!=='kb04d-v1'||
    input.handoff.state!=='synthetic_non_authorizing_handoff'||
    !HASH.test(input.handoff.packetId??'')||
    !HASH.test(input.handoff.sourceAcceptancePacketId??'')||
    !Array.isArray(input.handoff.rows)||input.handoff.rows.length>120||
    !Array.isArray(input.handoff.unresolvedChangeIds)||
    input.handoff.unresolvedChangeIds.some(x=>!HASH.test(x))||
    utcMillis(input.handoff.recordedAt)===null){
    return {ok:false,error:'invalid_synthetic_preflight_input'};
  }
  const p=input.handoff;
  const matches=p.rows.filter(row=>row?.proposalId===input.proposalId);
  const row=matches.length===1?matches[0]:null;
  const doc=input.documentClaim;
  const latest=input.latestSourceClaim;
  const time=utcMillis(p.recordedAt)!;
  const approvalFlagsSafe=p.canStore===false&&p.canCreate===false&&
    p.canApprove===false&&p.canPublish===false&&
    p.annotationsStored===false&&p.existingKnowledgeModified===false&&
    p.intendedExistingWorkflow?.create==='createKnowledgeDocumentAction'&&
    p.intendedExistingWorkflow?.approve==='approveKnowledgeDocumentAction'&&
    p.intendedExistingWorkflow.connected===false&&
    p.intendedExistingWorkflow.invoked===false&&
    !!p.requirements&&Object.values(p.requirements).every(v=>v===false)&&
    p.rows.every(r=>r?.approved===false&&r?.canWrite===false&&
      r?.needsRealHumanApproval===true&&r?.reviewState==='unverified_advisory_only');
  const checks:Array<[ApprovalVersionPreflightCheck['id'],boolean]>=[
    ['handoff_is_synthetic_and_unapproved',approvalFlagsSafe],
    ['tenant_scope_claim_matches',p.organizationScope===input.organizationId&&
      doc?.organizationId===input.organizationId],
    ['unique_proposal',row!==null&&HASH.test(row.proposalId)&&
      HASH.test(row.sourceSnapshotSha256)&&HASH.test(row.sourceBlockId)&&
      validSourceUrl(row.sourceUrl)&&typeof row.sourceAnswer==='string'&&
      row.sourceAnswer.length>0&&row.sourceAnswer.length<=6000],
    ['current_changed_source',row?.sourceChangeRelation==='current_changed_quote'&&
      row?.annotation!=='dismiss_unverified_proposal'&&
      row?.disposition==='manual_review_required'],
    ['no_unresolved_changes',p.unresolvedChangeIds.length===0],
    ['document_draft_claim',doc?.status==='draft'],
    ['document_version_claim_matches',doc?.version===input.expectedDocumentVersion],
    ['latest_citation_claim_matches',!!row&&!!latest&&
      latest.sourceUrl===row.sourceUrl&&
      latest.snapshotSha256===row.sourceSnapshotSha256&&
      latest.blockId===row.sourceBlockId&&
      latest.quoteSha256===sha(row.sourceAnswer)],
    ['observations_after_review',!!doc&&!!latest&&
      utcMillis(doc.observedAt)!>=time&&
      utcMillis(latest.observedAt)!>=time],
  ];
  const evidence=checks.map(([id,matched])=>({
    id,state:matched?'matched_claim_only' as const:'blocked' as const,
  }));
  const missingChecks=evidence.filter(c=>c.state==='blocked').map(c=>c.id);
  const packetId=sha(JSON.stringify([
    'kb08d-v1',p.packetId,input.organizationId,input.proposalId,
    input.expectedDocumentVersion,doc,latest,
    evidence.map(c=>[c.id,c.state]),
  ]));
  return {ok:true,report:{
    schemaVersion:'kb08d-v1',
    state:missingChecks.length?'blocked_for_source_or_version_review':
      'synthetic_claims_consistent_only',
    packetId,handoffPacketId:p.packetId,proposalId:input.proposalId,
    documentId:doc?.documentId??null,checks:evidence,missingChecks,
    existingApprovalWorkflow:{
      action:'approveKnowledgeDocumentAction',rpc:'approve_knowledge_document_v1',
      rpcHasExpectedVersionArgument:false,
      rpcHasSourceEvidenceFingerprintArgument:false,
      connected:false,invoked:false,
    },
    requiredRealGates:{
      independentCurrentSourceRetrieved:false,
      authenticatedTenantAndReviewerVerified:false,
      atomicDocumentVersionRechecked:false,
      atomicSourceSnapshotAndQuoteRechecked:false,
      consentRetentionAndDeletionApproved:false,
      explicitHumanApprovalInExistingWorkflow:false,
    },
    observationsAreIndependentEvidence:false,sourceTruthVerified:false,
    approvalGranted:false,canStore:false,canInvokeExistingApproval:false,
    canApprove:false,canPublish:false,
  }};
}
