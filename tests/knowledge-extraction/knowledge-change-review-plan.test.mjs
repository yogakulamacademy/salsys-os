import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebsiteEvidence } from '../../lib/knowledge-extraction/website-evidence.ts';
import { compareWebsiteEvidenceSnapshots } from '../../lib/knowledge-extraction/website-snapshot-delta.ts';
import { prepareKnowledgeChangeReviewPlan } from '../../lib/knowledge-extraction/knowledge-change-review-plan.ts';

const ORG='00000000-0000-4000-8000-000000000001';
const WRONG_ORG='00000000-0000-4000-8000-000000000003';
const DOC='00000000-0000-4000-8000-000000000002';
const URL='https://sample.example.com/services';
const HOST='sample.example.com';
const OPT={organizationId:ORG,verifiedHostname:HOST,
  asOf:'2026-11-06T12:00:00Z',reviewAgeDays:30};
function snapshot(text,at,url=URL){
  const blocks=[{kind:'h2',text:'Pricing'}];
  if(text!==null)blocks.push({kind:'paragraph',text});
  const r=prepareWebsiteEvidence({
    verifiedSeedUrl:'https://'+HOST+'/',sourceUrl:url,
    pageTitle:'Example page',fetchedAt:at,blocks,
  });
  assert.equal(r.ok,true);
  return r.evidence;
}
function evidence(oldText='Private workshop: $175',
  newText='Private workshop: $150',url=URL){
  const r=compareWebsiteEvidenceSnapshots(
    snapshot(oldText,'2026-10-01T00:00:00Z',url),
    snapshot(newText,'2026-11-05T00:00:00Z',url),HOST);
  assert.equal(r.ok,true);
  assert.equal(r.report.changes.length,1);
  return r.report;
}
function mapped(d){
  return ['prior','current'].filter(side=>d.changes[0][side]).map(side=>({
    organizationId:ORG,changeId:d.changes[0].id,side,
    scopeKey:'offer:workshop/session:sample',fieldKey:'price',kind:'price',
    effectiveFrom:'2026-10-01',effectiveUntil:'2026-12-01',
  }));
}
function historical(d){
  return [{
    organizationId:ORG,documentId:DOC,version:1,state:'published',
    sourceUrl:d.sourceUrl,snapshotSha256:d.priorSnapshotSha256,
    blockId:d.changes[0].prior.blockId,
    quoteSha256:d.changes[0].prior.quoteSha256,
  }];
}
function plan(d,choices=[],bs=mapped(d),history=historical(d),opt=OPT){
  return prepareKnowledgeChangeReviewPlan([d],bs,history,opt,choices);
}
test('synthetic change review preserves citations, potential impact and blocked handoff',()=>{
  const d=evidence();
  const r=plan(d);
  assert.equal(r.ok,true);
  assert.equal(r.plan.rows.length,1);
  assert.equal(r.plan.rows[0].prior.exactQuote,'Private workshop: $175');
  assert.equal(r.plan.rows[0].current.exactQuote,'Private workshop: $150');
  assert.equal(r.plan.rows[0].prior.quoteSha256,d.changes[0].prior.quoteSha256);
  assert.equal(r.plan.rows[0].potentialPublishedCitationImpact,true);
  assert.equal(r.plan.counts.potentiallyAffectedPublishedDocuments,1);
  assert.deepEqual([r.plan.counts.totalChanges,r.plan.counts.localChoices,
    r.plan.counts.stillUntriaged],[1,0,1]);
  assert.equal(r.plan.missingReleaseGates.length,7);
  assert.ok(r.plan.missingReleaseGates.every(x=>x.state==='blocked'));
  assert.equal(r.plan.existingLifecycle.integration,'not_connected');
  assert.equal(r.plan.existingLifecycle.createAction,'createKnowledgeDocumentAction');
  assert.equal(r.plan.existingLifecycle.approvalAction,'approveKnowledgeDocumentAction');
  assert.equal(r.plan.existingLifecycle.archiveAction,'archiveKnowledgeDocumentAction');
  assert.equal(r.plan.existingLifecycle.directApprovalForbidden,true);
  for(const key of ['reviewIdentityAuthenticated','realSourceVerificationCompleted',
    'choicesPersisted','auditTrailWritten','knowledgeDocumentsChanged',
    'canStoreEvidence','canCreateDraft','canApprove','canArchive','canPublish']){
    assert.equal(r.plan[key],false,key);
  }
});
test('local triage intents never become audited reviewer decisions or knowledge updates',()=>{
  const d=evidence(),id=d.changes[0].id;
  for(const intent of ['inspect_updated_source','retain_existing_pending_verification',
    'defer_for_human_review']){
    const r=plan(d,[{changeId:id,intent,note:'  Need owner check  '}]);
    assert.equal(r.ok,true);
    assert.equal(r.plan.rows[0].proposedIntent,intent);
    assert.equal(r.plan.rows[0].proposedNote,'Need owner check');
    assert.equal(r.plan.rows[0].reviewerIdentityVerified,false);
    assert.equal(r.plan.rows[0].auditedDecisionRecorded,false);
    assert.equal(r.plan.rows[0].approvedKnowledgeChanged,false);
    assert.equal(r.plan.rows[0].canSubmitForApproval,false);
    assert.deepEqual([r.plan.counts.localChoices,r.plan.counts.stillUntriaged],[1,0]);
    assert.equal(r.plan.canPublish,false);
  }
});
test('reject duplicates, unknown change IDs, forged intents and non-string or oversize notes',()=>{
  const d=evidence(),id=d.changes[0].id;
  const ok={changeId:id,intent:'defer_for_human_review',note:''};
  for(const choices of [
    [ok,ok],[{...ok,changeId:'f'.repeat(64)}],
    [{...ok,intent:'approve'}],[{...ok,note:12}],
    [{...ok,note:'x'.repeat(501)}],[{...ok,note:'\u0000'}],
    [{...ok,changeId:'invalid'}],{},[null],
  ]){
    assert.deepEqual(plan(d,choices),{ok:false,error:'invalid_local_review_intents'});
  }
});
test('cannot inspect an absent later quote or retain an absent old quote',()=>{
  const removed=evidence('Policy active',null);
  const added=evidence(null,'Policy available');
  assert.equal(removed.changes[0].kind,'removed');
  assert.equal(added.changes[0].kind,'added');
  const inspect=[{changeId:removed.changes[0].id,
    intent:'inspect_updated_source',note:''}];
  const retain=[{changeId:added.changes[0].id,
    intent:'retain_existing_pending_verification',note:''}];
  assert.deepEqual(plan(removed,inspect,mapped(removed),[]),
    {ok:false,error:'invalid_local_review_intents'});
  assert.deepEqual(plan(added,retain,mapped(added),[]),
    {ok:false,error:'invalid_local_review_intents'});
  assert.equal(plan(removed,[{...inspect[0],intent:'defer_for_human_review'}],
    mapped(removed),[]).ok,true);
});
test('source provenance, tenant history and comparison mapping are independently revalidated',()=>{
  const d=evidence();
  const b=mapped(d),h=historical(d);
  assert.deepEqual(plan(d,[],[{...b[0],organizationId:WRONG_ORG}],h),
    {ok:false,error:'change_impact_rejected'});
  assert.deepEqual(plan(d,[],b,[{...h[0],organizationId:WRONG_ORG}]),
    {ok:false,error:'change_impact_rejected'});
  assert.deepEqual(plan(d,[],b,h,{...OPT,verifiedHostname:'other.example.com'}),
    {ok:false,error:'change_impact_rejected'});
  const changed=structuredClone(d);changed.changes[0].prior.exactQuote='Injected text';
  assert.deepEqual(plan(changed,[],b,h),
    {ok:false,error:'change_impact_rejected'});
});
test('reordering local choices leaves a stable plan identity',()=>{
  const d=evidence();
  const other=evidence('A different workshop: $175','A different workshop: $150',
    'https://sample.example.com/other');
  const second=prepareKnowledgeChangeReviewPlan([d,other],[],[],OPT,[
    {changeId:other.changes[0].id,intent:'defer_for_human_review',note:'check later'},
    {changeId:d.changes[0].id,intent:'inspect_updated_source',note:'check fees'},
  ]);
  const reordered=prepareKnowledgeChangeReviewPlan([d,other],[],[],OPT,[
    {changeId:d.changes[0].id,intent:'inspect_updated_source',note:'check fees'},
    {changeId:other.changes[0].id,intent:'defer_for_human_review',note:'check later'},
  ]);
  assert.equal(second.ok,true);
  assert.equal(reordered.ok,true);
  assert.equal(second.plan.counts.localChoices,2);
  assert.deepEqual(reordered,second);
});
test('same inputs are deterministic and no evidence, binding or choices are mutated',()=>{
  const d=evidence(), b=mapped(d),h=historical(d);
  const choices=[{changeId:d.changes[0].id,
    intent:'defer_for_human_review',note:'Provisional'}];
  const before=structuredClone({d,b,h,choices});
  const one=plan(d,choices,b,h),two=plan(d,choices,b,h);
  assert.deepEqual(one,two);
  assert.deepEqual({d,b,h,choices},before);
  assert.equal(one.plan.canCreateDraft,false);
});
