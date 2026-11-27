const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const api = load('lib/knowledge-import-processing-preview.ts');
const org='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002', jobId='20000000-0000-4000-8000-000000000001', token='30000000-0000-4000-8000-000000000001', token2='30000000-0000-4000-8000-000000000002', doc='40000000-0000-4000-8000-000000000001';
const scope={organizationId:org,jobId};
const init=(n=3)=>api.createImportLedgerPreview(scope,'a'.repeat(64),n,Array.from({length:n},(_,index)=>({index,status:'pending'})),0,10_000_000);
const claim=(j,now=0,t=token,limit=1)=>api.claimImportPreview(j,scope,now,t,limit);
const created={kind:'created',documentId:doc,organizationId:org,documentStatus:'draft'};
test('ledger requires complete distinct indexes and refuses excess count',()=>{
  assert.equal(api.KNOWLEDGE_IMPORT_PROCESSING_WIRED,false);
  assert.equal(api.createImportLedgerPreview(scope,'a'.repeat(64),2,[{index:0,status:'pending'},{index:0,status:'pending'}],0,10),null);
  assert.equal(api.createImportLedgerPreview(scope,'a'.repeat(64),10001,[],0,10),null);
  assert.equal(api.createImportLedgerPreview(scope,'x',1,[{index:0,status:'pending'}],0,10),null);
});
test('bounded claims do not re-claim unexpired leases or cross tenant',()=>{
  const j=init(100), a=claim(j,0,token,50), b=claim(a.job,0,token2,50);
  assert.equal(a.claims.length,50);assert.equal(b.claims.length,50);assert.equal(new Set([...a.claims,...b.claims].map(c=>c.index)).size,100);
  assert.equal(claim(b.job,1,token).claims.length,0);
  assert.equal(api.claimImportPreview(j,{...scope,organizationId:other},0,token),null);
  assert.equal(claim(j,0,token,51),null);
  assert.equal(j.entries[0].status,'pending');
});
test('expired lease may be reclaimed; old token and attempt cannot complete',()=>{
  const a=claim(init(1)), b=claim(a.job,api.LEASE_MS,token2);
  assert.equal(b.claims[0].attempt,2);
  assert.equal(api.settleImportPreview(b.job,a.claims[0],api.LEASE_MS,created),null);
  assert.equal(api.settleImportPreview(a.job,a.claims[0],api.LEASE_MS,created),null);
  assert.equal(api.settleImportPreview(b.job,b.claims[0],api.LEASE_MS+1,created).status,'completed');
});
test('retry has backoff and stops at five attempts',()=>{
  let j=init(1), now=0;
  for(let i=1;i<=5;i++){
    const a=claim(j,now);assert.equal(a.claims[0].attempt,i);
    j=api.settleImportPreview(a.job,a.claims[0],now,{kind:'retry'});
    if(i<5){assert.equal(claim(j,now).claims.length,0);now=j.entries[0].availableAt;}
  }
  assert.equal(j.entries[0].status,'failed');assert.equal(j.status,'completed');assert.equal(api.importProgressPreview(j).counts.failed,1);
});
test('expired fifth lease is failed and not claimed again',()=>{
  let j=init(1),now=0;
  for(let i=1;i<=5;i++){const a=claim(j,now);j=a.job;now+=api.LEASE_MS;}
  const a=claim(j,now);assert.equal(a.claims.length,0);assert.equal(a.job.entries[0].status,'failed');
});
test('success rejects wrong organization, approval, reuse and duplicate completion',()=>{
  const a=claim(init(2),0,token,2);
  assert.equal(api.settleImportPreview(a.job,a.claims[0],1,{...created,organizationId:other}),null);
  assert.equal(api.settleImportPreview(a.job,a.claims[0],1,{...created,documentStatus:'approved'}),null);
  const j=api.settleImportPreview(a.job,a.claims[0],1,created);
  assert.equal(api.settleImportPreview(j,a.claims[0],2,created),null);
  assert.equal(api.settleImportPreview(j,a.claims[1],2,created),null);
});
test('cancellation invalidates outstanding claims while preserving created drafts',()=>{
  const a=claim(init(3),0,token,2), j=api.settleImportPreview(a.job,a.claims[0],1,created), stopped=api.stopImportPreview(j,scope,2,'cancelled');
  assert.equal(stopped.status,'cancelled');assert.equal(stopped.entries[0].documentId,doc);
  assert.equal(api.settleImportPreview(stopped,a.claims[1],3,created),null);
  assert.equal(claim(stopped,3),null);
  const p=api.importProgressPreview(stopped);assert.equal(p.processed,3);assert.equal(p.remaining,0);assert.equal(p.counts.created,1);assert.equal(p.counts.cancelled,2);
});
test('progress includes invalid and duplicate rows; expiry stops processing',()=>{
  const j=api.createImportLedgerPreview(scope,'a'.repeat(64),3,[{index:0,status:'pending'},{index:1,status:'invalid'},{index:2,status:'duplicate'}],0,100);
  assert.equal(api.importProgressPreview(j).processed,2);
  const a=claim(j,99);assert.equal(a.job.entries[0].leaseUntil,100);
  assert.equal(api.settleImportPreview(a.job,a.claims[0],100,created),null);
  const expired=api.stopImportPreview(a.job,scope,100,'expired');assert.equal(expired.status,'expired');assert.equal(api.importProgressPreview(expired).remaining,0);
});
