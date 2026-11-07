import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWebsiteEvidence} from '../../lib/knowledge-extraction/website-evidence.ts';
import {compareWebsiteEvidenceSnapshots} from '../../lib/knowledge-extraction/website-snapshot-delta.ts';

const HOST='sample.example.com';
const BEFORE='2026-10-01T11:00:00Z';
const AFTER='2026-11-06T11:00:00Z';
const url='https://sample.example.com/services';

function snapshot(blocks,at=AFTER,{sourceUrl=url,title='Sample services'}={}){
  const result=prepareWebsiteEvidence({
    verifiedSeedUrl:'https://'+HOST+'/',
    sourceUrl,pageTitle:title,fetchedAt:at,blocks,
  });
  assert.equal(result.ok,true);
  return result.evidence;
}
const paragraph=text=>({kind:'paragraph',text});
const section=text=>({kind:'h2',text});

test('compares only the same verified page and flags a single modified quotation with two citations',()=>{
  const old=snapshot([section('Fees'),paragraph('Private room fee: $150.')],BEFORE);
  const next=snapshot([section('Fees'),paragraph('Private room fee: $175.')]);
  const result=compareWebsiteEvidenceSnapshots(old,next,HOST);
  assert.equal(result.ok,true);
  const {report}=result;
  assert.deepEqual(report.counts,{added:0,removed:0,modified:1,unchanged:0});
  assert.equal(report.changes[0].kind,'modified');
  assert.equal(report.changes[0].prior.exactQuote,'Private room fee: $150.');
  assert.equal(report.changes[0].current.exactQuote,'Private room fee: $175.');
  assert.deepEqual(report.changes[0].prior.headingPath,['Fees']);
  assert.equal(report.changes[0].prior.sourceUrl,url);
  assert.equal(report.changes[0].current.sourceUrl,url);
  assert.equal(report.changes[0].prior.quoteSha256,old.blocks[0].quoteSha256);
  assert.equal(report.changes[0].current.quoteSha256,next.blocks[0].quoteSha256);
  assert.equal(report.changes[0].reviewStatus,'unreviewed');
  assert.equal(report.changes[0].canApprove,false);
  assert.ok(report.issues.includes('source_authenticity_not_reverified'));
  assert.ok(report.issues.includes('stylesheet_and_runtime_visibility_not_verified'));
  assert.deepEqual([
    report.sourceAuthenticityVerified,report.renderedVisibilityVerified,
    report.liveWebsiteChangeConfirmed,report.canStore,report.canScheduleCrawl,
    report.canApprove,report.canPublish,
  ],Array(7).fill(false));
});

test('recognizes unchanged quotations even when block order moves',()=>{
  const a=snapshot([section('Programs'),paragraph('Online course.'),paragraph('Private course.')],BEFORE);
  const b=snapshot([section('Programs'),paragraph('Private course.'),paragraph('Online course.')]);
  const r=compareWebsiteEvidenceSnapshots(a,b,HOST);
  assert.equal(r.ok,true);
  assert.deepEqual(r.report.counts,{added:0,removed:0,modified:0,unchanged:2});
  assert.deepEqual(r.report.changes,[]);
  assert.equal(r.report.liveWebsiteChangeConfirmed,false);
});

test('detects a new paragraph and removed older policy without fabricating a replacement',()=>{
  const a=snapshot([section('Policies'),paragraph('Refunds require 7 days notice.')],BEFORE);
  const b=snapshot([section('Policies'),paragraph('Documents must be submitted online.'),
    paragraph('Full payment is required at arrival.')]);
  const r=compareWebsiteEvidenceSnapshots(a,b,HOST);
  assert.equal(r.ok,true);
  assert.deepEqual(r.report.counts,{added:2,removed:1,modified:0,unchanged:0});
  assert.ok(r.report.issues.includes('ambiguous_text_alignment'));
  assert.ok(r.report.changes.every(x=>x.reviewStatus==='unreviewed'));
});

test('missing and new FAQ blocks remain exact quoted additions or removals',()=>{
  const a=snapshot([section('FAQ'),
    {kind:'faq_question',text:'Are meals included?'},
    {kind:'faq_answer',text:'Yes, lunch is included.'},
  ],BEFORE);
  const b=snapshot([section('FAQ'),
    {kind:'faq_question',text:'Are meals included?'},
    {kind:'faq_answer',text:'Yes, lunch is included.'},
    {kind:'faq_question',text:'Can I cancel?'},
    {kind:'faq_answer',text:'Contact reception to ask.'},
  ]);
  const r=compareWebsiteEvidenceSnapshots(a,b,HOST);
  assert.equal(r.ok,true);
  assert.deepEqual(r.report.counts,{added:2,removed:0,modified:0,unchanged:2});
  assert.deepEqual(r.report.changes.map(x=>x.current.exactQuote),
    ['Can I cancel?','Contact reception to ask.']);
});

test('changed section heading cannot be called a verified modification',()=>{
  const a=snapshot([section('Private Rooms'),paragraph('Fee: $250')],BEFORE);
  const b=snapshot([section('Shared Rooms'),paragraph('Fee: $250')]);
  const r=compareWebsiteEvidenceSnapshots(a,b,HOST);
  assert.equal(r.ok,true);
  assert.deepEqual(r.report.counts,{added:1,removed:1,modified:0,unchanged:0});
  assert.ok(r.report.changes.some(x=>x.kind==='removed'));
  assert.ok(r.report.changes.some(x=>x.kind==='added'));
});

test('page title change is noted separately from unchanged body text',()=>{
  const blocks=[section('Fees'),paragraph('Fee: $250')];
  const a=snapshot(blocks,BEFORE,{title:'Old company name'});
  const b=snapshot(blocks,AFTER,{title:'New company name'});
  const r=compareWebsiteEvidenceSnapshots(a,b,HOST);
  assert.equal(r.ok,true);
  assert.equal(r.report.counts.unchanged,1);
  assert.deepEqual(r.report.changes,[]);
  assert.ok(r.report.issues.includes('page_title_changed'));
});

test('same snapshot at a later time is not treated as new facts',()=>{
  const blocks=[section('Fees'),paragraph('Fee: $250')];
  const a=snapshot(blocks,BEFORE);
  const b=snapshot(blocks,AFTER);
  assert.equal(a.snapshotSha256,b.snapshotSha256);
  const r=compareWebsiteEvidenceSnapshots(a,b,HOST);
  assert.equal(r.ok,true);
  assert.deepEqual(r.report.counts,{added:0,removed:0,modified:0,unchanged:1});
});

test('cross-host aliases and different pages are never compared as same source',()=>{
  const a=snapshot([paragraph('Fee: $150')],BEFORE);
  const different=snapshot([paragraph('Fee: $175')],AFTER,
    {sourceUrl:'https://sample.example.com/other'});
  assert.deepEqual(compareWebsiteEvidenceSnapshots(a,different,HOST),
    {ok:false,error:'different_page_scope'});
  assert.deepEqual(compareWebsiteEvidenceSnapshots(a,a,'www.sample.example.com'),
    {ok:false,error:'invalid_snapshot_provenance'});
  const offsite=structuredClone(a);
  offsite.sourceUrl='https://sample.example.com.evil.net/services';
  assert.deepEqual(compareWebsiteEvidenceSnapshots(offsite,a,HOST),
    {ok:false,error:'invalid_snapshot_provenance'});
  const http=structuredClone(a);
  http.sourceUrl='http://sample.example.com/services';
  assert.deepEqual(compareWebsiteEvidenceSnapshots(http,a,HOST),
    {ok:false,error:'invalid_snapshot_provenance'});
});

test('source chronology is explicit and must be strictly increasing',()=>{
  const a=snapshot([paragraph('Original')],BEFORE);
  const b=snapshot([paragraph('Later')],AFTER);
  assert.deepEqual(compareWebsiteEvidenceSnapshots(b,a,HOST),
    {ok:false,error:'nonmonotonic_snapshot_time'});
  assert.deepEqual(compareWebsiteEvidenceSnapshots(a,a,HOST),
    {ok:false,error:'nonmonotonic_snapshot_time'});
});

test('tampered quotation, ID, review status, index or provenance fail closed',()=>{
  const a=snapshot([section('Fees'),paragraph('Fee is USD 150.')],BEFORE);
  const b=snapshot([section('Fees'),paragraph('Fee is USD 175.')]);
  const edits=[
    x=>{x.blocks[0].quote='Fee is USD 1.';},
    x=>{x.blocks[0].quoteSha256='f'.repeat(64);},
    x=>{x.blocks[0].id='f'.repeat(64);},
    x=>{x.blocks[0].reviewStatus='approved';},
    x=>{x.blocks[0].sourceBlockIndex=-1;},
    x=>{x.blocks[0].headingPath=['Fees',...'x'.repeat(300).split('')];},
    x=>{x.hasContent=false;},
    x=>{x.snapshotSha256='f'.repeat(64);},
  ];
  for(const mutate of edits){
    const changed=structuredClone(a);mutate(changed);
    assert.deepEqual(compareWebsiteEvidenceSnapshots(changed,b,HOST),
      {ok:false,error:'invalid_snapshot_provenance'});
  }
});

test('identical inputs produce deterministic change identities without side effects',()=>{
  const a=snapshot([section('Fees'),paragraph('Fee is USD 150.')],BEFORE);
  const b=snapshot([section('Fees'),paragraph('Fee is USD 175.')]);
  const first=compareWebsiteEvidenceSnapshots(a,b,HOST);
  const second=compareWebsiteEvidenceSnapshots(a,b,HOST);
  assert.deepEqual(first,second);
  assert.equal(first.ok,true);
  assert.equal(first.report.changes[0].prior.exactQuote,'Fee is USD 150.');
  assert.equal(a.blocks[0].quote,'Fee is USD 150.');
});
