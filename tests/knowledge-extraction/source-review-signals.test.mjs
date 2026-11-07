import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebsiteEvidence } from '../../lib/knowledge-extraction/website-evidence.ts';
import { prepareSourceGroundedDrafts } from '../../lib/knowledge-extraction/source-grounded-drafts.ts';
import { analyzeSourceReviewSignals } from '../../lib/knowledge-extraction/source-review-signals.ts';

const HOST='sample.example.com';
const NOW='2026-11-06T12:00:00Z';
function bundle(path,sourceLines,date='2026-11-06T10:00:00Z'){
  const html={
    verifiedSeedUrl:'https://'+HOST,
    sourceUrl:'https://'+HOST+'/'+path,
    pageTitle:'Synthetic training details',
    fetchedAt:date,
    blocks:sourceLines.flatMap(row=>[
      {kind:'h2',text:row.heading},
      {kind:'paragraph',text:row.quote},
    ]),
  };
  const evidence=prepareWebsiteEvidence(html);
  assert.equal(evidence.ok,true);
  const drafts=prepareSourceGroundedDrafts(evidence.evidence,HOST);
  assert.equal(drafts.ok,true);
  return drafts.bundle;
}
function bound(bundle,kind,scopeKey='course:200h/mysore/batch:2026-12/room:private',fieldKey='fee'){
  return {draftId:bundle.drafts[0].id,scopeKey,fieldKey,kind};
}
function run(bundles,bindings,options={}){
  return analyzeSourceReviewSignals(bundles,bindings,{
    verifiedHostname:HOST,asOf:NOW,...options,
  });
}

test('flags different prices for an explicitly matched course, room, batch and same currency',()=>{
  const a=bundle('rates-v1',[{heading:'Private room',quote:'Private room: $1,750.'}]);
  const b=bundle('rates-v2',[{heading:'Private room',quote:'Private room: USD 1900.'}]);
  const result=run([a,b],[bound(a,'price'),bound(b,'price')]);
  assert.equal(result.ok,true);
  assert.equal(result.report.signals.length,1);
  const signal=result.report.signals[0];
  assert.equal(signal.kind,'price_difference_review');
  assert.equal(signal.comparisonCurrency,'USD');
  assert.equal(signal.scopeKey,'course:200h/mysore/batch:2026-12/room:private');
  assert.equal(signal.sources.length,2);
  assert.deepEqual(signal.sources.map(s=>s.exactQuote).sort(),
    ['Private room: $1,750.','Private room: USD 1900.'].sort());
  assert.ok(signal.sources.every(s=>s.blockId&&s.quoteSha256&&s.sourceUrl));
  assert.equal(signal.manualReviewRequired,true);
  assert.equal(signal.canPublish,false);
  assert.deepEqual([result.report.canPublish,result.report.canStore,result.report.sourceTruthDetermined],
    [false,false,false]);
});

test('does not falsely flag the same amount with different punctuation or currency spelling',()=>{
  const a=bundle('rates-a',[{heading:'Fee',quote:'Fee is $1,750.'}]);
  const b=bundle('rates-b',[{heading:'Fee',quote:'Fee is USD 1750.00.'}]);
  const result=run([a,b],[bound(a,'price'),bound(b,'price')]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.report.signals,[]);
  assert.deepEqual(result.report.issues,[]);
});

test('different currencies and differently scoped room types are not declared contradictory',()=>{
  const usd=bundle('private-usd',[{heading:'Private',quote:'Private room: USD 1900'}]);
  const eur=bundle('private-eur',[{heading:'Private',quote:'Private room: EUR 1700'}]);
  const twin=bundle('twin-usd',[{heading:'Twin',quote:'Twin room: USD 1400'}]);
  const base='course:200h/mysore/batch:2026-12/room:private';
  const other='course:200h/mysore/batch:2026-12/room:twin';
  const result=run([usd,eur,twin],[
    bound(usd,'price',base),bound(eur,'price',base),
    bound(twin,'price',other),
  ]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.report.signals,[]);
  assert.deepEqual(result.report.issues.map(x=>x.code),['different_currencies_not_compared']);
});

test('ISO date changes generate review signals, without interpreting ambiguous date ranges',()=>{
  const a=bundle('batch-a',[{heading:'Dates',quote:'Start date: 2026-12-07.'}]);
  const b=bundle('batch-b',[{heading:'Dates',quote:'Start date: 2026-12-11.'}]);
  const both=bundle('range',[{heading:'Dates',quote:'From 2026-12-07 to 2026-12-30.'}]);
  const key='course:200h/mysore/batch:2026-12';
  const binding=(x)=>bound(x,'date',key,'start');
  const result=run([a,b,both],[binding(a),binding(b),binding(both)]);
  assert.equal(result.ok,true);
  assert.equal(result.report.signals.length,1);
  assert.equal(result.report.signals[0].kind,'date_difference_review');
  assert.deepEqual(result.report.issues.map(x=>x.code),['unsupported_or_ambiguous_value']);
  assert.equal(result.report.signals[0].sources.length,2);
});

test('policy text variation is a potential review only, never an asserted contradiction',()=>{
  const a=bundle('policy-a',[{heading:'Cancellation',quote:'Refunds require written notice.'}]);
  const b=bundle('policy-b',[{heading:'Cancellation',quote:'Refunds require written notice 7 days before start.'}]);
  const binding=x=>bound(x,'policy','course:200h/mysore','cancellation');
  const result=run([a,b],[binding(a),binding(b)]);
  assert.equal(result.ok,true);
  assert.equal(result.report.signals.length,1);
  assert.equal(result.report.signals[0].kind,'policy_text_variation_review');
  assert.match(result.report.signals[0].message,/Human review/);
  assert.equal(result.report.sourceTruthDetermined,false);
});

test('age signal requires explicit review threshold and does not imply retention or deletion',()=>{
  const old=bundle('historical',[
    {heading:'Fee',quote:'Tuition is $500.'},
    {heading:'Terms',quote:'Booking required.'},
  ],'2026-10-01T00:00:00Z');
  const without=run([old],[]);
  assert.equal(without.ok,true);
  assert.deepEqual(without.report.signals,[]);
  const result=run([old],[],{reviewAgeDays:30});
  assert.equal(result.ok,true);
  assert.equal(result.report.signals.length,1,'one age reminder for an old snapshot, not per block');
  assert.equal(result.report.signals[0].kind,'source_age_review');
  assert.match(result.report.signals[0].message,/not a deletion decision/i);
  assert.equal(result.report.canStore,false);
  const shorter=run([old],[],{reviewAgeDays:365});
  assert.equal(shorter.ok,true);
  assert.deepEqual(shorter.report.signals,[]);
});

test('ambiguous multiple monetary amounts are not compared as a single private-room fee',()=>{
  const a=bundle('offer',[{heading:'Room fee',quote:'Offer $150; regular price $200.'}]);
  const b=bundle('standard',[{heading:'Room fee',quote:'Private fee $180.'}]);
  const result=run([a,b],[bound(a,'price'),bound(b,'price')]);
  assert.equal(result.ok,true);
  assert.equal(result.report.signals.length,0);
  assert.deepEqual(result.report.issues.map(x=>x.code),['unsupported_or_ambiguous_value']);
});

test('source and citation tampering, forged bindings, aliases, and invalid thresholds fail closed',()=>{
  const a=bundle('source',[{heading:'Fee',quote:'Private room: $1,750'}]);
  const boundA=bound(a,'price');
  for(const corrupt of [
    d=>{d.drafts[0].citation.exactQuote='Private room: $999';},
    d=>{d.drafts[0].citation.sourceUrl='https://evil.example.com/prices';},
    d=>{d.drafts[0].citation.snapshotSha256='f'.repeat(64);},
    d=>{d.drafts[0].id='f'.repeat(64);},
    d=>{d.drafts[0].reviewStatus='approved';},
    d=>{d.canPublish=true;},
  ]){
    const changed=structuredClone(a);corrupt(changed);
    const result=run([changed],[boundA]);
    assert.equal(result.ok,false);
  }
  const unavailable=run([a],[{...boundA,draftId:'f'.repeat(64)}]);
  assert.deepEqual(unavailable,{ok:false,error:'binding_missing_provenance'});
  const alias=run([a],[boundA],{verifiedHostname:'www.sample.example.com'});
  assert.equal(alias.ok,false);
  const invalid=run([a],[boundA],{reviewAgeDays:0});
  assert.deepEqual(invalid,{ok:false,error:'invalid_comparison_configuration'});
  const duplicate=run([a],[boundA,boundA]);
  assert.deepEqual(duplicate,{ok:false,error:'duplicate_comparison_binding'});
});

test('mixed timestamps within one snapshot and future source dates fail closed',()=>{
  const original=bundle('multi',[
    {heading:'Fee',quote:'Fee: $500'},
    {heading:'Date',quote:'Start date: 2026-12-07'},
  ]);
  const changed=structuredClone(original);
  changed.drafts[1].citation.fetchedAt='2026-11-05T00:00:00Z';
  assert.deepEqual(run([changed],[]),
    {ok:false,error:'inconsistent_source_timestamp'});
  const future=bundle('future',[{heading:'Fee',quote:'Fee: $500'}],
    '2026-11-07T12:00:00Z');
  assert.deepEqual(run([future],[]),{ok:false,error:'source_timestamp_in_future'});
});

test('source review refuses noncanonical timestamps that could corrupt age signals',()=>{
  const original=bundle('timestamp',[{heading:'Fee',quote:'Private: $500.'}]);
  for(const asOf of [
    '2026-02-30T12:00:00Z',
    '2026-11-06T12:00:00',
    '2026-11-06T12:00:00+00:00',
    '2026-11-06T12:00:00.1234Z',
  ]){
    assert.deepEqual(run([original],[],{asOf,reviewAgeDays:30}),
      {ok:false,error:'invalid_comparison_configuration'},asOf);
  }
  for(const fetchedAt of [
    '2026-02-30T10:00:00Z',
    '2026-11-05T10:00:00',
    '2026-11-05T10:00:00+02:00',
  ]){
    const changed=structuredClone(original);
    changed.drafts[0].citation.fetchedAt=fetchedAt;
    assert.deepEqual(run([changed],[],{reviewAgeDays:30}),
      {ok:false,error:'invalid_source_draft'},fetchedAt);
  }
  const acceptable=run([original],[],{
    asOf:'2026-11-06T12:00:00.100Z',reviewAgeDays:30,
  });
  assert.equal(acceptable.ok,true);
  assert.equal(acceptable.report.canPublish,false);
});

test('large comparison groups fail closed rather than dropping the differing citation',()=>{
  const entries=Array.from({length:17},(_,i)=>bundle('version-'+i,[
    {heading:'Fee',quote:'Private fee: '+String.fromCharCode(36)+(i===16?'1900':'1750')},
  ]));
  const bindings=entries.map(x=>bound(x,'price'));
  assert.deepEqual(run(entries,bindings),{ok:false,error:'comparison_group_over_limit'});
});
test('no model calls, storage, approval or publication for empty sources',()=>{
  const report=run([],[]);
  assert.equal(report.ok,true);
  assert.deepEqual(report.report.signals,[]);
  assert.deepEqual(report.report.issues,[]);
  assert.equal(report.report.state,'needs_human_review');
  assert.equal(report.report.canPublish,false);
  assert.equal(report.report.canStore,false);
});
