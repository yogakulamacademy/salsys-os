import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inspectSyntheticApprovalVersionBoundary } from '../../lib/knowledge-extraction/approval-version-preflight.ts';

const sha = text => createHash('sha256').update(text,'utf8').digest('hex');
const ORG='10000000-0000-4000-8000-000000000001';
const OTHER='10000000-0000-4000-8000-000000000002';
const DOCUMENT='20000000-0000-4000-8000-000000000001';
const PROPOSAL=sha('synthetic-proposal');
const CHANGE=sha('synthetic-change');
const QUOTE='An introduction workshop costs $150.';
const URL='https://sample.example.com/workshops';
const T0='2026-11-06T12:00:00Z';
const T1='2026-11-06T12:01:00Z';
const allUnverified={
  sourceAuthenticityAndRenderedVisibilityVerified:false,
  tenantAndReviewerAuthenticatedInWriteTransaction:false,
  verifiedConsentRetentionAndDeletion:false,
  semanticAndTemporalConflictsResolved:false,
  sourceEvidenceAuditAndRlsValidated:false,
  publishedDocumentVersionRevalidated:false,
  explicitExistingWorkflowHumanApproval:false,
};
function fixture(){
  return {
    organizationId:ORG,proposalId:PROPOSAL,expectedDocumentVersion:3,
    handoff:{
      schemaVersion:'kb04d-v1',state:'synthetic_non_authorizing_handoff',
      organizationScope:ORG,reviewerIdentifierClaim:null,
      reviewerRoleClaim:'admin',recordedAt:T0,
      sourceAcceptancePacketId:sha('acceptance'),packetId:sha('handoff'),
      rows:[{
        proposalId:PROPOSAL,relatedChangeId:CHANGE,
        sourceChangeRelation:'current_changed_quote',
        sourceUrl:URL,sourceAnswer:QUOTE,
        sourceSnapshotSha256:sha('snapshot-v2'),sourceBlockId:sha('block-v2'),
        annotation:'request_manual_correction',
        reviewerNote:'Check latest source version',
        disposition:'manual_review_required',
        reviewState:'unverified_advisory_only',needsRealHumanApproval:true,
        approved:false,canWrite:false,
      }],
      unresolvedChangeIds:[],requirements:structuredClone(allUnverified),
      intendedExistingWorkflow:{
        create:'createKnowledgeDocumentAction',
        approve:'approveKnowledgeDocumentAction',connected:false,invoked:false,
      },
      annotationsStored:false,existingKnowledgeModified:false,
      canStore:false,canCreate:false,canApprove:false,canPublish:false,
    },
    documentClaim:{
      organizationId:ORG,documentId:DOCUMENT,version:3,
      status:'draft',observedAt:T1,
    },
    latestSourceClaim:{
      sourceUrl:URL,snapshotSha256:sha('snapshot-v2'),
      blockId:sha('block-v2'),quoteSha256:sha(QUOTE),observedAt:T1,
    },
  };
}
function evaluate(mutate=()=>{}){
  const input=fixture();
  mutate(input);
  return inspectSyntheticApprovalVersionBoundary(input);
}
function cannotApprove(report){
  assert.equal(report.canInvokeExistingApproval,false);
  assert.equal(report.canApprove,false);
  assert.equal(report.canPublish,false);
  assert.equal(report.canStore,false);
  assert.equal(report.approvalGranted,false);
  assert.equal(report.existingApprovalWorkflow.invoked,false);
  assert.equal(report.existingApprovalWorkflow.connected,false);
  assert.equal(report.existingApprovalWorkflow.rpcHasExpectedVersionArgument,false);
  assert.equal(report.existingApprovalWorkflow.rpcHasSourceEvidenceFingerprintArgument,false);
  assert.ok(Object.values(report.requiredRealGates).every(x=>x===false));
}
test('exactly matching synthetic claims are still NOT permission to use the existing approval RPC',()=>{
  const result=evaluate();
  assert.equal(result.ok,true);
  assert.equal(result.report.state,'synthetic_claims_consistent_only');
  assert.deepEqual(result.report.missingChecks,[]);
  assert.ok(result.report.checks.every(c=>c.state==='matched_claim_only'));
  cannotApprove(result.report);
  assert.match(result.report.packetId,/^[a-f0-9]{64}$/);
  assert.deepEqual(evaluate(),result,'Stable advisory fingerprint, no I/O');
});
test('new source hash, block or quote cannot silently satisfy the source/version link',()=>{
  for(const [label,modify] of [
    ['new snapshot',v=>v.latestSourceClaim.snapshotSha256=sha('snapshot-v3')],
    ['different block',v=>v.latestSourceClaim.blockId=sha('block-v3')],
    ['different quote',v=>v.latestSourceClaim.quoteSha256=sha('quote-v3')],
    ['different page',v=>v.latestSourceClaim.sourceUrl='https://sample.example.com/other'],
  ]){
    const result=evaluate(modify);
    assert.equal(result.ok,true,label);
    assert.equal(result.report.state,'blocked_for_source_or_version_review',label);
    assert.ok(result.report.missingChecks.includes('latest_citation_claim_matches'),label);
    cannotApprove(result.report);
  }
});
test('document version drift, wrong tenant or wrong status prevent even synthetic match',()=>{
  for(const [label,modify,expected] of [
    ['stale version',v=>v.documentClaim.version=4,'document_version_claim_matches'],
    ['wrong tenant',v=>v.documentClaim.organizationId=OTHER,'tenant_scope_claim_matches'],
    ['approved already',v=>v.documentClaim.status='approved','document_draft_claim'],
    ['superseded',v=>v.documentClaim.status='superseded','document_draft_claim'],
  ]){
    const result=evaluate(modify);
    assert.equal(result.ok,true,label);
    assert.ok(result.report.missingChecks.includes(expected),label);
    cannotApprove(result.report);
  }
});
test('prior-only, removed or unresolved source changes remain blocked, even with notes',()=>{
  for(const [label,modify,expected] of [
    ['prior quote',v=>{
      v.handoff.rows[0].sourceChangeRelation='superseded_or_removed_quote';
    },'current_changed_source'],
    ['unresolved',v=>v.handoff.unresolvedChangeIds=[CHANGE],'no_unresolved_changes'],
    ['held',v=>v.handoff.rows[0].disposition='hold_for_resolution','current_changed_source'],
    ['dismiss',v=>v.handoff.rows[0].annotation='dismiss_unverified_proposal','current_changed_source'],
  ]){
    const result=evaluate(modify);
    assert.equal(result.ok,true,label);
    assert.ok(result.report.missingChecks.includes(expected),label);
    cannotApprove(result.report);
  }
});
test('claimed readbacks must follow review and cannot be replaced by a missing observation',()=>{
  for(const [label,modify,expected] of [
    ['old document observation',v=>v.documentClaim.observedAt='2026-11-05T09:00:00Z','observations_after_review'],
    ['old website observation',v=>v.latestSourceClaim.observedAt='2026-11-05T09:00:00Z','observations_after_review'],
    ['no document observation',v=>v.documentClaim=null,'document_version_claim_matches'],
    ['no website observation',v=>v.latestSourceClaim=null,'latest_citation_claim_matches'],
  ]){
    const result=evaluate(modify);
    assert.equal(result.ok,true,label);
    assert.ok(result.report.missingChecks.includes(expected),label);
    cannotApprove(result.report);
  }
});
test('forged approval annotations and untrusted handoff flags fail closed',()=>{
  for(const [label,modify] of [
    ['approval',v=>v.handoff.rows[0].approved=true],
    ['write',v=>v.handoff.rows[0].canWrite=true],
    ['auth claim',v=>v.handoff.requirements.tenantAndReviewerAuthenticatedInWriteTransaction=true],
    ['connected',v=>v.handoff.intendedExistingWorkflow.connected=true],
    ['invoked',v=>v.handoff.intendedExistingWorkflow.invoked=true],
  ]){
    const result=evaluate(modify);
    assert.equal(result.ok,true,label);
    assert.ok(result.report.missingChecks.includes('handoff_is_synthetic_and_unapproved'),label);
    cannotApprove(result.report);
  }
});
test('malformed, impossible or precision-truncated timestamps are rejected',()=>{
  for(const invalid of [
    '2026-02-30T12:01:00Z',
    '2026-11-06T12:01:00',
    '2026-11-06T12:01:00+05:30',
    '2026-11-06T12:01:00.1234Z',
  ]){
    const result=evaluate(v=>v.documentClaim.observedAt=invalid);
    assert.deepEqual(result,{ok:false,error:'invalid_synthetic_preflight_input'},invalid);
  }
});
test('the offline preflight cannot call or replace existing knowledge actions',()=>{
  const source=readFileSync('lib/knowledge-extraction/approval-version-preflight.ts','utf8');
  assert.ok(!source.includes("from '@/app/settings/knowledge/actions'"));
  assert.ok(!source.includes("from '@/lib/supabase"));
  assert.ok(!source.includes('.rpc('));
  assert.ok(source.includes('rpcHasExpectedVersionArgument:false'));
  assert.ok(source.includes('rpcHasSourceEvidenceFingerprintArgument:false'));
});
