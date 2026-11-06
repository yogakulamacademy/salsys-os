import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebsiteEvidence } from '../../lib/knowledge-extraction/website-evidence.ts';
import { compareWebsiteEvidenceSnapshots } from '../../lib/knowledge-extraction/website-snapshot-delta.ts';
import { assessSourceChangeImpact } from '../../lib/knowledge-extraction/source-change-impact.ts';

const ORG='00000000-0000-4000-8000-000000000001';
const OTHER_ORG='00000000-0000-4000-8000-000000000003';
const DOC='00000000-0000-4000-8000-000000000002';
const HOST='sample.example.com';
const AT='2026-11-06T12:00:00Z';
const BEFORE='2026-10-01T12:00:00Z';
const AFTER='2026-11-05T12:00:00Z';
const options={organizationId:ORG,verifiedHostname:HOST,asOf:AT,reviewAgeDays:30};
const paragraph=text=>({kind:'paragraph',text});
const heading=text=>({kind:'h2',text});
function snapshot(url,quote,time=AFTER){
  const res=prepareWebsiteEvidence({
    verifiedSeedUrl:'https://'+HOST+'/',
    sourceUrl:url,
    pageTitle:'Illustrative services',
    fetchedAt:time,
    blocks:[heading('Pricing'),paragraph(quote)],
  });
  assert.equal(res.ok,true);
  return res.evidence;
}
function delta(url='https://sample.example.com/services',
  oldQuote='Private room: $150',newQuote='Private room: $175',
  priorTime=BEFORE,currentTime=AFTER){
  const result=compareWebsiteEvidenceSnapshots(
    snapshot(url,oldQuote,priorTime),snapshot(url,newQuote,currentTime),HOST,
  );
  assert.equal(result.ok,true);
  return result.report;
}
function bind(d,side,extra={}){
  return {
    organizationId:ORG,changeId:d.changes[0].id,side,
    scopeKey:'offer:private-room',fieldKey:'price',kind:'price',
    effectiveFrom:'2026-10-01',effectiveUntil:'2026-12-01',...extra,
  };
}
function history(d,extra={}){
  return {
    organizationId:ORG,documentId:DOC,version:1,state:'published',
    sourceUrl:d.sourceUrl,snapshotSha256:d.priorSnapshotSha256,
    blockId:d.changes[0].prior.blockId,
    quoteSha256:d.changes[0].prior.quoteSha256,...extra,
  };
}
function analyze(deltas,bindings=[],historical=[],opt=options){
  return assessSourceChangeImpact(deltas,bindings,historical,opt);
}

test('a modified quote and published older citation are only potentially impacted',()=>{
  const d=delta();
  const r=analyze([d],[bind(d,'prior'),bind(d,'current')],[history(d)]);
  assert.equal(r.ok,true);
  assert.deepEqual(r.report.counts,{
    changes:1,unboundChanges:0,potentiallyAffectedPublishedDocuments:1,
    historicalReferencesNotCovered:0,fieldsNeedingReview:1,
  });
  assert.equal(r.report.fieldReviews[0].reason,'possible_overlapping_periods');
  assert.equal(r.report.fieldReviews[0].citations[0].source.sourceUrl,d.sourceUrl);
  assert.ok(r.report.changes[0].reasons.includes(
    'published_citation_potentially_affected'));
  assert.equal(r.report.changes[0].actualKnowledgeSuppressed,false);
  assert.equal(r.report.changes[0].suggestedAutomaticSuppression,true);
  for(const name of ['sourceTruthDetermined','semanticMappingVerifiedBySystem',
    'websiteOwnershipVerifiedBySystem','evidenceStored',
    'publishedKnowledgeModified','canFetch','canStore',
    'canSuppressPublishedKnowledge','canApprove','canPublish']){
    assert.equal(r.report[name],false,name);
  }
});

test('cross-page source claims require explicit binding to the exact same field scope',()=>{
  const a=delta('https://sample.example.com/a','Offer: $100','Offer: $175');
  const b=delta('https://sample.example.com/b','Offer: $100','Offer: $190');
  const none=analyze([a,b]);
  assert.equal(none.ok,true);
  assert.equal(none.report.counts.unboundChanges,2);
  assert.equal(none.report.fieldReviews.length,0);
  const explicit=analyze([a,b],[
    bind(a,'current',{effectiveFrom:'2026-10-01',effectiveUntil:'2026-11-30'}),
    bind(b,'current',{effectiveFrom:'2026-10-01',effectiveUntil:'2026-11-30'}),
  ]);
  assert.equal(explicit.ok,true);
  assert.equal(explicit.report.fieldReviews[0].reason,'possible_overlapping_periods');
  assert.equal(explicit.report.fieldReviews[0].citations.length,2);
  assert.equal(explicit.report.sourceTruthDetermined,false);
});

test('disjoint annotated periods do not become contradictions or automatic replacements',()=>{
  const d=delta();
  const r=analyze([d],[
    bind(d,'prior',{effectiveFrom:'2026-09-01',effectiveUntil:'2026-11-01'}),
    bind(d,'current',{effectiveFrom:'2026-11-01',effectiveUntil:'2026-12-01'}),
  ]);
  assert.equal(r.ok,true);
  assert.equal(r.report.fieldReviews[0].reason,'nonoverlapping_periods_not_a_conflict');
  assert.equal(r.report.canPublish,false);
});
test('unknown periods are not silently filled using website retrieval dates',()=>{
  const d=delta();
  const r=analyze([d],[
    bind(d,'prior',{effectiveFrom:null,effectiveUntil:null}),
    bind(d,'current',{effectiveFrom:'2026-11-01',effectiveUntil:'2026-12-01'}),
  ]);
  assert.equal(r.ok,true);
  assert.equal(r.report.fieldReviews[0].reason,'unverified_effective_period');
});
test('matching text on two sources does not establish truth',()=>{
  const a=delta('https://sample.example.com/a','Old $100','Same $175');
  const b=delta('https://sample.example.com/b','Old $100','Same $175');
  const r=analyze([a,b],[bind(a,'current'),bind(b,'current')]);
  assert.equal(r.ok,true);
  assert.equal(r.report.fieldReviews[0].reason,
    'same_quotation_not_independent_confirmation');
});
test('a removed quote is highlighted even with no semantic scope',()=>{
  const d=delta();
  const change=d.changes[0];
  change.kind='removed';
  change.current=null;
  d.counts.modified=0;d.counts.removed=1;
  change.id=createHash('sha256').update(JSON.stringify([
    'removed',change.prior.snapshotSha256,change.prior.blockId,undefined,undefined,
  ])).digest('hex');
  const r=analyze([d]);
  assert.equal(r.ok,true);
  assert.equal(r.report.changes[0].reasons.includes('source_quote_removed'),true);
  assert.equal(r.report.counts.unboundChanges,1);
});
test('old snapshots trigger review risk, not automatic deletion',()=>{
  const d=delta('https://sample.example.com/services',
    'Fee $150','Fee $175', '2026-09-01T00:00:00Z',
    '2026-09-10T00:00:00Z');
  const r=analyze([d]);
  assert.equal(r.ok,true);
  assert.equal(r.report.changes[0].reasons.includes(
    'current_snapshot_review_age_exceeded'),true);
  assert.equal(r.report.canSuppressPublishedKnowledge,false);
});
test('archive/superseded history is not counted as currently published impact',()=>{
  const d=delta();
  const r=analyze([d],[],[history(d,{state:'archived'})]);
  assert.equal(r.ok,true);
  assert.equal(r.report.counts.potentiallyAffectedPublishedDocuments,0);
  assert.equal(r.report.counts.historicalReferencesNotCovered,0);
});
test('history not represented in comparison is explicitly counted as unexamined',()=>{
  const d=delta();
  const unlinked=history(d,{blockId:'f'.repeat(64)});
  const r=analyze([d],[],[unlinked]);
  assert.equal(r.ok,true);
  assert.equal(r.report.counts.historicalReferencesNotCovered,1);
  assert.equal(r.report.counts.potentiallyAffectedPublishedDocuments,0);
});
test('cross-tenant binding, historical reference and hostname boundaries are rejected',()=>{
  const d=delta();
  assert.deepEqual(analyze([d],[bind(d,'prior',{organizationId:OTHER_ORG})]),
    {ok:false,error:'invalid_semantic_binding'});
  assert.deepEqual(analyze([d],[],[history(d,{organizationId:OTHER_ORG})]),
    {ok:false,error:'invalid_historical_reference'});
  assert.deepEqual(analyze([d],[],[],{...options,verifiedHostname:'other.example.com'}),
    {ok:false,error:'invalid_change_report'});
});
test('tampered quotation, hashes, IDs, timestamps and verdict flags fail closed',()=>{
  const original=delta();
  for(const mutation of [
    d=>{d.changes[0].prior.exactQuote='Tampered fee';},
    d=>{d.changes[0].prior.blockId='f'.repeat(64);},
    d=>{d.changes[0].prior.quoteSha256='f'.repeat(64);},
    d=>{d.changes[0].id='f'.repeat(64);},
    d=>{d.changes[0].canPublish=true;},
    d=>{d.sourceAuthenticityVerified=true;},
    d=>{d.counts.modified=2;},
    d=>{d.currentFetchedAt='2026-11-07T12:00:00Z';},
  ]){
    const d=structuredClone(original);mutation(d);
    assert.deepEqual(analyze([d]),{ok:false,error:'invalid_change_report'});
  }
});
test('duplicate/invalid scopes and conflicting field-kind mappings fail closed',()=>{
  const d=delta();
  const b=bind(d,'current');
  assert.deepEqual(analyze([d],[b,b]),
    {ok:false,error:'duplicate_or_ambiguous_binding'});
  assert.deepEqual(analyze([d],[bind(d,'prior'),bind(d,'current',{kind:'date'})]),
    {ok:false,error:'incompatible_field_types'});
  assert.deepEqual(analyze([d],[bind(d,'current',{effectiveFrom:'2026-02-30'})]),
    {ok:false,error:'invalid_semantic_binding'});
  assert.deepEqual(analyze([d],[bind(d,'current',{scopeKey:'bad space'})]),
    {ok:false,error:'invalid_semantic_binding'});
  assert.deepEqual(analyze([d],[bind(d,'current',{effectiveUntil:'2026-09-01'})]),
    {ok:false,error:'invalid_semantic_binding'});
  assert.deepEqual(analyze([d],[bind(d,'current',{changeId:'f'.repeat(64)})]),
    {ok:false,error:'binding_missing_source_quote'});
});
test('outputs are deterministic, input immutable and historical references are read-only',()=>{
  const d=delta();const bs=[bind(d,'prior'),bind(d,'current')];
  const hs=[history(d)];
  const before=structuredClone({d,bs,hs});
  const a=analyze([d],bs,hs),b=analyze([d],bs,hs);
  assert.deepEqual(a,b);
  assert.deepEqual({d,bs,hs},before);
  assert.equal(a.report.publishedKnowledgeModified,false);
});
