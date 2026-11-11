import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareWebsiteEvidence } from '../../lib/knowledge-extraction/website-evidence.ts';
import { compareWebsiteEvidenceSnapshots } from '../../lib/knowledge-extraction/website-snapshot-delta.ts';
import { assessSourceChangeImpact } from '../../lib/knowledge-extraction/source-change-impact.ts';
import { prepareSyntheticHumanReviewHandoff } from '../../lib/knowledge-extraction/human-review-handoff.ts';

const hash=v=>createHash('sha256').update(v,'utf8').digest('hex');
const ORG='00000000-0000-4000-8000-000000000001';
const OTHER='00000000-0000-4000-8000-000000000005';
const REVIEWER='00000000-0000-4000-8000-000000000002';
const URL='https://sample.example.com/program';
const NOW='2026-11-06T12:00:00Z';
const gateNames=[
  'realSourceAndBrowserVisibilityVerified',
  'tenantConsentAndRetentionApproved',
  'independentConflictCoverageVerified',
  'semanticAccuracyVerified',
  'reviewerIdentityAndAuditVerified',
  'stagingWriteAndRlsValidated',
  'explicitMergeAndDeployApproval',
];
function snapshot(text,time){
  const res=prepareWebsiteEvidence({
    verifiedSeedUrl:'https://sample.example.com/',sourceUrl:URL,
    fetchedAt:time,pageTitle:'Training fee',
    blocks:[{kind:'h2',text:'Fee'},{kind:'paragraph',text}],
  });
  assert.equal(res.ok,true);
  return res.evidence;
}
function fixture(){
  const d=compareWebsiteEvidenceSnapshots(
    snapshot('Course is $175','2026-10-01T00:00:00Z'),
    snapshot('Course is $150','2026-11-05T00:00:00Z'),'sample.example.com');
  assert.equal(d.ok,true);
  const impact=assessSourceChangeImpact([d.report],[],[],{
    organizationId:ORG,verifiedHostname:'sample.example.com',
    asOf:NOW,reviewAgeDays:30,
  });
  assert.equal(impact.ok,true);
  const current=d.report.changes[0].current;
  const row={
    proposalId:hash('proposal'),sourceDraftId:hash('sourceDraft'),
    kind:'faq',suggestedQuestion:'What is the course fee?',
    exactSourceAnswer:current.exactQuote,
    sourceUrl:current.sourceUrl,
    sourceFetchedAt:current.fetchedAt,
    snapshotSha256:current.snapshotSha256,
    answerBlockId:current.blockId,
    answerBlockIndex:current.sourceBlockIndex,
    answerQuoteSha256:current.quoteSha256,
    originalQuestion:null,originalQuestionQuoteSha256:null,
    reviewOutcome:'hold_for_resolution',warningReasons:[],
    reviewerDecision:'not_recorded',reviewStatus:'unreviewed',
    sourceTruthVerified:false,semanticsVerified:false,
    canApprove:false,canPublish:false,
  };
  const acceptance={
    schemaVersion:'kb03e-v1',
    state:'synthetic_read_only_review',
    requestId:hash('request'),packetId:hash('packet'),
    verifiedHostnameScope:'sample.example.com',
    reviewAsOf:NOW,rows:[row],
    counts:{proposals:1,held:1,needsHumanReview:1},
    requiredGates:Object.fromEntries(gateNames.map(k=>[k,false])),
    handoff:{
      existingCreateWorkflow:'createKnowledgeDocumentAction',
      existingApprovalWorkflow:'approveKnowledgeDocumentAction',
      integrationStatus:'not_connected',allowedToInvoke:false,
    },
    aiProviderWasCalled:false,dataWasStored:false,
    canStore:false,canApprove:false,canPublish:false,
  };
  return {organizationId:ORG,activeOrganizationId:ORG,
    reviewerId:REVIEWER,reviewerRole:'admin',
    recordedAt:NOW,acceptance,impact:impact.report,annotations:[]};
}
const annotation=f=>({
  proposalId:f.acceptance.rows[0].proposalId,
  changeId:f.impact.changes[0].changeId,
  annotation:'request_manual_correction',
  reviewerNote:'Please verify the fee against the actual current source.',
});
test('synthetic handoff stays non-authorizing, even with an admin annotation',()=>{
  const f=fixture();f.annotations=[annotation(f)];
  const r=prepareSyntheticHumanReviewHandoff(f);
  assert.equal(r.ok,true);
  assert.equal(r.packet.rows.length,1);
  assert.equal(r.packet.rows[0].annotation,'request_manual_correction');
  assert.equal(r.packet.rows[0].relatedChangeId,f.impact.changes[0].changeId);
  assert.deepEqual(r.packet.unresolvedChangeIds,[]);
  assert.equal(r.packet.intendedExistingWorkflow.create,'createKnowledgeDocumentAction');
  assert.equal(r.packet.intendedExistingWorkflow.approve,'approveKnowledgeDocumentAction');
  assert.equal(r.packet.intendedExistingWorkflow.connected,false);
  assert.equal(r.packet.intendedExistingWorkflow.invoked,false);
  assert.ok(Object.values(r.packet.requirements).every(x=>x===false));
  for(const key of ['annotationsStored','existingKnowledgeModified',
    'canStore','canCreate','canApprove','canPublish']){
    assert.equal(r.packet[key],false,key);
  }
  assert.equal(r.packet.rows[0].approved,false);
  assert.equal(r.packet.rows[0].canWrite,false);
});
test('superseded prior quotation stays on hold even when an admin annotates it',()=>{
  const f=fixture();
  const prior=f.impact.changes[0].prior;
  assert.ok(prior,'fixture must contain a real prior source snapshot');
  const row=f.acceptance.rows[0];
  Object.assign(row,{
    exactSourceAnswer:prior.exactQuote,
    sourceUrl:prior.sourceUrl,
    sourceFetchedAt:prior.fetchedAt,
    snapshotSha256:prior.snapshotSha256,
    answerBlockId:prior.blockId,
    answerBlockIndex:prior.sourceBlockIndex,
    answerQuoteSha256:prior.quoteSha256,
    // Expose the risk: the earlier handoff used this lighter status unchanged.
    reviewOutcome:'manual_review_required',
  });
  f.acceptance.counts.held=0;
  f.annotations=[annotation(f)];
  const result=prepareSyntheticHumanReviewHandoff(f);
  assert.equal(result.ok,true);
  assert.equal(result.packet.rows[0].sourceChangeRelation,'superseded_or_removed_quote');
  assert.equal(result.packet.rows[0].disposition,'hold_for_resolution');
  assert.equal(result.packet.rows[0].annotation,'request_manual_correction');
  assert.deepEqual(result.packet.unresolvedChangeIds,[f.impact.changes[0].changeId],
    'A note cannot turn a superseded source into current evidence');
  assert.equal(result.packet.rows[0].approved,false);
  assert.equal(result.packet.canApprove,false);
  assert.equal(result.packet.canPublish,false);
  assert.equal(result.packet.intendedExistingWorkflow.invoked,false);
});

test('current changed quotation remains classified current but still unapproved',()=>{
  const f=fixture();
  f.annotations=[annotation(f)];
  const result=prepareSyntheticHumanReviewHandoff(f);
  assert.equal(result.ok,true);
  assert.equal(result.packet.rows[0].sourceChangeRelation,'current_changed_quote');
  assert.deepEqual(result.packet.unresolvedChangeIds,[]);
  assert.equal(result.packet.rows[0].disposition,'hold_for_resolution');
  assert.equal(result.packet.rows[0].approved,false);
  assert.equal(result.packet.canApprove,false);
});

test('missing annotations remain unresolved and cannot be mistaken for approvals',()=>{
  const r=prepareSyntheticHumanReviewHandoff(fixture());
  assert.equal(r.ok,true);
  assert.equal(r.packet.rows[0].annotation,'awaiting_annotation');
  assert.deepEqual(r.packet.unresolvedChangeIds,[r.packet.rows[0].relatedChangeId]);
  assert.equal(r.packet.canApprove,false);
});
test('role and identity claims do not become verified authentication',()=>{
  for(const role of ['owner','admin','member','unknown']){
    const f=fixture();f.reviewerRole=role;f.reviewerId=null;
    const r=prepareSyntheticHumanReviewHandoff(f);
    assert.equal(r.ok,true);
    assert.equal(r.packet.requirements.tenantAndReviewerAuthenticatedInWriteTransaction,false);
    assert.equal(r.packet.canCreate,false);
  }
});
test('cross-tenant scope and forged source hostname fail closed',()=>{
  const f=fixture();f.activeOrganizationId=OTHER;
  assert.deepEqual(prepareSyntheticHumanReviewHandoff(f),
    {ok:false,error:'invalid_handoff_scope'});
  const g=fixture();g.impact.organizationScope=OTHER;
  assert.deepEqual(prepareSyntheticHumanReviewHandoff(g),
    {ok:false,error:'invalid_review_inputs'});
  const h=fixture();h.acceptance.verifiedHostnameScope='other.example.com';
  assert.deepEqual(prepareSyntheticHumanReviewHandoff(h),
    {ok:false,error:'invalid_review_inputs'});
});
test('forged approval flags and source quote hashes fail closed',()=>{
  const transformations=[
    f=>{f.acceptance.canApprove=true;},
    f=>{f.acceptance.handoff.allowedToInvoke=true;},
    f=>{f.acceptance.rows[0].reviewerDecision='approved';},
    f=>{f.acceptance.rows[0].exactSourceAnswer='A different price';},
    f=>{f.acceptance.requiredGates.semanticAccuracyVerified=true;},
    f=>{f.impact.canPublish=true;},
    f=>{f.impact.publishedKnowledgeModified=true;},
    f=>{f.impact.changes[0].current.exactQuote='Forged';},
    f=>{f.impact.changes[0].actualKnowledgeSuppressed=true;},
  ];
  for(const transform of transformations){
    const f=fixture();transform(f);
    assert.deepEqual(prepareSyntheticHumanReviewHandoff(f),
      {ok:false,error:'invalid_review_inputs'});
  }
});
test('unrelated annotation and duplicates are rejected',()=>{
  const f=fixture();
  const unrelated={...annotation(f),changeId:'f'.repeat(64)};
  f.annotations=[unrelated];
  assert.deepEqual(prepareSyntheticHumanReviewHandoff(f),
    {ok:false,error:'invalid_or_ambiguous_annotation'});
  const duplicate=fixture();duplicate.annotations=[annotation(duplicate),annotation(duplicate)];
  assert.deepEqual(prepareSyntheticHumanReviewHandoff(duplicate),
    {ok:false,error:'invalid_or_ambiguous_annotation'});
  const blank=fixture();blank.annotations=[{...annotation(blank),reviewerNote:' '}];
  assert.deepEqual(prepareSyntheticHumanReviewHandoff(blank),
    {ok:false,error:'invalid_or_ambiguous_annotation'});
  const invalid=fixture();invalid.annotations=[{...annotation(invalid),annotation:'approve'}];
  assert.deepEqual(prepareSyntheticHumanReviewHandoff(invalid),
    {ok:false,error:'invalid_or_ambiguous_annotation'});
});
test('invalid UTC timestamps and impossible dates fail closed',()=>{
  for(const when of ['2026-02-30T12:00:00Z','2026-11-06T12:00:00+00:00','nope']){
    const f=fixture();f.recordedAt=when;
    assert.deepEqual(prepareSyntheticHumanReviewHandoff(f),
      {ok:false,error:'invalid_review_time'});
  }
});
test('source truth and existing knowledge remain unchanged for all annotation types',()=>{
  for(const kind of ['hold_for_source_verification','request_manual_correction',
    'dismiss_unverified_proposal']){
    const f=fixture();f.annotations=[{...annotation(f),annotation:kind}];
    const initial=structuredClone(f);
    const a=prepareSyntheticHumanReviewHandoff(f);
    const b=prepareSyntheticHumanReviewHandoff(f);
    assert.deepEqual(a,b);assert.deepEqual(f,initial);
    assert.equal(a.packet.rows[0].approved,false);
    assert.equal(a.packet.existingKnowledgeModified,false);
  }
});
