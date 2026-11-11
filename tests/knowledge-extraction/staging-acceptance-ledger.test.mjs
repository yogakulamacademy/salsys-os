import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGING_SCENARIOS, assessStagingAcceptanceLedger,
} from '../../lib/knowledge-extraction/staging-acceptance-ledger.ts';

const ORG='00000000-0000-4000-8000-000000000001';
const OTHER='00000000-0000-4000-8000-000000000004';
const USER='00000000-0000-4000-8000-000000000002';
const NOW='2026-11-06T12:00:00Z';
const base=()=>({
  organizationId:ORG,asOf:NOW,claims:[],
  evidenceReadiness:null,refreshPreflight:null,humanReview:null,
});
const claim=(g,overrides={})=>({
  scenarioId:g.id,organizationId:ORG,
  runId:'stage-test-20261106',executedAt:'2026-11-05T12:00:00Z',
  evidenceSha256:'a'.repeat(64),observedOutcome:g.expected,
  reportedBy:USER,evidenceOrigin:'self_reported_isolated_staging',
  ...overrides,
});

test('empty ledger identifies every missing acceptance scenario and blocks release',()=>{
  const r=assessStagingAcceptanceLedger(base());
  assert.equal(r.ok,true);
  assert.equal(r.report.rows.length,STAGING_SCENARIOS.length);
  assert.deepEqual(r.report.totals,{
    required:STAGING_SCENARIOS.length,missing:STAGING_SCENARIOS.length,
    claimedButUnverified:0,contradictory:0,
  });
  assert.equal(r.report.upstreamContractStatus.evidenceDiagnosticOnly,'missing');
  assert.equal(r.report.upstreamContractStatus.refreshDiagnosticOnly,'missing');
  assert.equal(r.report.upstreamContractStatus.reviewerHandoffDiagnosticOnly,'missing');
  assert.equal(r.report.status,'blocked_pending_independent_staging_acceptance');
  assert.ok(r.report.rows.every(x=>x.status==='missing'&&x.evidenceSha256===null));
});

test('even ALL complete self-reported claims NEVER constitute release authorization',()=>{
  const f=base();f.claims=STAGING_SCENARIOS.map(g=>claim(g));
  const r=assessStagingAcceptanceLedger(f);
  assert.equal(r.ok,true);
  assert.equal(r.report.totals.required,16);
  assert.equal(r.report.totals.missing,0);
  assert.equal(r.report.totals.claimedButUnverified,16);
  assert.ok(r.report.rows.every(x=>
    x.status==='claimed_needs_independent_verification'));
  for(const flag of [
    'parentProvenanceIndependentlyVerified',
    'externalStagingResultsIndependentlyVerified',
    'tenantIsolationIndependentlyVerified',
    'consentWithdrawalIndependentlyVerified',
    'retentionAndDeletionIndependentlyVerified',
    'releaseApprovalIndependentlyVerified',
    'canCrawl','canStoreEvidence','canCallAIProvider',
    'canCreateKnowledge','canApproveKnowledge','canPublish',
    'canMerge','canDeploy',
  ]){
    assert.equal(r.report[flag],false,flag);
  }
});

test('contradictions in claimed isolated staging outcomes remain explicit',()=>{
  const f=base();
  const gate=STAGING_SCENARIOS.find(x=>x.expected==='deny');
  f.claims=[claim(gate,{observedOutcome:'audit'})];
  const r=assessStagingAcceptanceLedger(f);
  assert.equal(r.ok,true);
  assert.equal(r.report.totals.contradictory,1);
  assert.equal(r.report.rows.find(x=>x.id===gate.id).status,'contradictory_claim');
  assert.equal(r.report.canDeploy,false);
});

test('cross-organization, duplicated, forged-origin, and malformed claims are rejected',()=>{
  const g=STAGING_SCENARIOS[0];
  const changes=[
    [claim(g,{organizationId:OTHER}),'invalid_or_duplicate_claim'],
    [claim(g,{reportTo:'nobody',evidenceOrigin:'independently_verified'}),'invalid_or_duplicate_claim'],
    [claim(g,{runId:'a/bad/run'}),'invalid_or_duplicate_claim'],
    [claim(g,{evidenceSha256:'bad'}),'invalid_or_duplicate_claim'],
    [claim(g,{reportedBy:OTHER.slice(2)}),'invalid_or_duplicate_claim'],
    [claim(g,{observedOutcome:'approved'}),'invalid_or_duplicate_claim'],
    [claim(g,{executedAt:'2026-02-30T12:00:00Z'}),'invalid_or_stale_claim_time'],
    [claim(g,{executedAt:'2026-11-07T12:00:00Z'}),'invalid_or_stale_claim_time'],
    [claim(g,{executedAt:'2026-01-01T12:00:00Z'}),'invalid_or_stale_claim_time'],
    [claim(g,{executedAt:'2026-11-05T12:00:00+00:00'}),'invalid_or_stale_claim_time'],
  ];
  for(const [bad,error] of changes){
    const f=base();f.claims=[bad];
    assert.deepEqual(assessStagingAcceptanceLedger(f),{ok:false,error});
  }
  const dupe=base();dupe.claims=[claim(g),claim(g)];
  assert.deepEqual(assessStagingAcceptanceLedger(dupe),
    {ok:false,error:'invalid_or_duplicate_claim'});
  const wrong=base();wrong.organizationId=OTHER;wrong.claims=[claim(g)];
  assert.deepEqual(assessStagingAcceptanceLedger(wrong),
    {ok:false,error:'invalid_or_duplicate_claim'});
  const unknown=base();unknown.claims=[claim(g,{scenarioId:'unlisted_promotion'})];
  assert.deepEqual(assessStagingAcceptanceLedger(unknown),
    {ok:false,error:'invalid_or_duplicate_claim'});
});

test('invalid organization, impossible date and malformed contexts fail closed',()=>{
  for(const value of ['bad','',null]){
    const f=base();f.organizationId=value;
    assert.deepEqual(assessStagingAcceptanceLedger(f),
      {ok:false,error:'invalid_acceptance_context'});
  }
  for(const date of ['2026-02-30T12:00:00Z','2026-11-06T12:00:00+00:00']){
    const f=base();f.asOf=date;
    assert.deepEqual(assessStagingAcceptanceLedger(f),
      {ok:false,error:'invalid_acceptance_time'});
  }
  assert.deepEqual(assessStagingAcceptanceLedger(null),
    {ok:false,error:'invalid_acceptance_context'});
});

test('forged upstream permissions are rejected rather than trusted',()=>{
  const f=base();
  f.evidenceReadiness={
    state:'blocked',satisfied:0,total:0,gates:[],
    canStoreEvidence:true,canStoreRawHtml:false,canPublishKnowledge:false,
  };
  assert.deepEqual(assessStagingAcceptanceLedger(f),
    {ok:false,error:'invalid_acceptance_context'});
  const h=base();
  h.refreshPreflight={
    schemaVersion:'kb04b-v1',status:'blocked',evaluatedAt:NOW,
    sourceUrl:null,gates:[],satisfied:0,total:0,
    evidenceVerifiedAtExecution:false,
    canEnqueue:false,canCrawl:true,canStore:false,
    canSyncKnowledge:false,canApprove:false,canPublish:false,
  };
  assert.deepEqual(assessStagingAcceptanceLedger(h),
    {ok:false,error:'invalid_acceptance_context'});
  const p=base();
  p.humanReview={
    schemaVersion:'kb04d-v1',state:'synthetic_non_authorizing_handoff',
    organizationScope:ORG,packetId:'a'.repeat(64),
    sourceAcceptancePacketId:'b'.repeat(64),
    intendedExistingWorkflow:{
      create:'createKnowledgeDocumentAction',
      approve:'approveKnowledgeDocumentAction',
      connected:true,invoked:false,
    },annotationsStored:false,existingKnowledgeModified:false,
    canStore:false,canCreate:false,canApprove:false,canPublish:false,
    requirements:{a:false},rows:[],
  };
  assert.deepEqual(assessStagingAcceptanceLedger(p),
    {ok:false,error:'invalid_acceptance_context'});
});

test('valid upstream review-only diagnostics are explicitly non-authorizing',()=>{
  const f=base();
  f.evidenceReadiness={
    state:'blocked',satisfied:0,total:1,
    gates:[{id:'admin_access',label:'Admin access',status:'blocked',description:'Required'}],
    canStoreEvidence:false,canStoreRawHtml:false,canPublishKnowledge:false,
  };
  f.refreshPreflight={
    schemaVersion:'kb04b-v1',status:'blocked',evaluatedAt:NOW,
    sourceUrl:null,gates:[],satisfied:0,total:0,
    evidenceVerifiedAtExecution:false,
    canEnqueue:false,canCrawl:false,canStore:false,
    canSyncKnowledge:false,canApprove:false,canPublish:false,
  };
  f.humanReview={
    schemaVersion:'kb04d-v1',state:'synthetic_non_authorizing_handoff',
    organizationScope:ORG,packetId:'a'.repeat(64),
    sourceAcceptancePacketId:'b'.repeat(64),
    intendedExistingWorkflow:{
      create:'createKnowledgeDocumentAction',
      approve:'approveKnowledgeDocumentAction',
      connected:false,invoked:false,
    },annotationsStored:false,existingKnowledgeModified:false,
    canStore:false,canCreate:false,canApprove:false,canPublish:false,
    requirements:{
      sourceAuthenticityAndRenderedVisibilityVerified:false,
      tenantAndReviewerAuthenticatedInWriteTransaction:false,
      verifiedConsentRetentionAndDeletion:false,
      semanticAndTemporalConflictsResolved:false,
      sourceEvidenceAuditAndRlsValidated:false,
      publishedDocumentVersionRevalidated:false,
      explicitExistingWorkflowHumanApproval:false,
    },rows:[],
  };
  const r=assessStagingAcceptanceLedger(f);
  assert.equal(r.ok,true);
  assert.deepEqual(r.report.upstreamContractStatus,{
    evidenceDiagnosticOnly:'non_authorizing',
    refreshDiagnosticOnly:'non_authorizing',
    reviewerHandoffDiagnosticOnly:'non_authorizing',
  });
  assert.equal(r.report.canApproveKnowledge,false);
});

test('ledger is deterministic and never mutates caller evidence',()=>{
  const f=base();f.claims=STAGING_SCENARIOS.slice(0,3).map(g=>claim(g));
  const original=structuredClone(f);
  const one=assessStagingAcceptanceLedger(f);
  const two=assessStagingAcceptanceLedger(f);
  assert.deepEqual(one,two);
  assert.deepEqual(f,original);
});
