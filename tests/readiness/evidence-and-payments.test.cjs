const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { parsePaymentAmount } = load('lib/payment-input.ts');
const { inspectKnowledgeMatches, knowledgeFingerprint } = load('lib/knowledge-evidence.ts');
const row = extra => ({ chunk_id: '40000000-0000-4000-8000-000000000001', document_id: '50000000-0000-4000-8000-000000000001', title: 'Synthetic policy', category: 'faq', content: 'Synthetic approved content for tests.', rank: .5, valid_until: null, metadata: { document_version: 3, private_debug: 'must-not-leave-boundary' }, ...extra });

test('INR/USD inputs preserve two-decimal values and distinguish an omitted claim', () => {
  for (const [text, value] of [['30000',30000],['0.29',.29],['001.5',1.5],[' 90000.00 ',90000]]) assert.deepEqual(parsePaymentAmount(text), { state:'valid',value });
  for (const text of [null,undefined,'','   ']) assert.deepEqual(parsePaymentAmount(text), { state:'missing' });
});
test('ambiguous, excessive-precision and lossy amounts are rejected before financial commands', () => {
  for (const text of ['0','-1','1.001','1e3','0x10','NaN','Infinity','1,000','1.','90071992547409.91','999999999999999999999999999999999999',{}]) assert.deepEqual(parsePaymentAmount(text), { state:'invalid' },String(text));
});
test('knowledge evidence is minimized and counted by document, not arbitrary metadata', () => {
  const checked = inspectKnowledgeMatches([row(),row({ chunk_id:'40000000-0000-4000-8000-000000000002' })]);
  assert.equal(checked.ok,true); assert.equal(checked.matches.length,2); assert.equal(checked.evidence.length,1);
  assert.equal(checked.evidence[0].version,3); assert.doesNotMatch(JSON.stringify(checked),/private_debug|must-not-leave/);
});
test('empty matches differ from unavailable/malformed or expired evidence', () => {
  assert.equal(inspectKnowledgeMatches([]).ok,true);
  for (const value of [null,{},[null],[row({valid_until:'invalid'})],[row({valid_until:'2020-01-01T00:00:00Z'})],[row({document_id:'not-a-document'})]]) assert.equal(inspectKnowledgeMatches(value).ok,false);
});
test('duplicate retries are stable; conflicting chunks or document versions fail closed', () => {
  assert.equal(inspectKnowledgeMatches([row(),row()]).matches.length,1);
  assert.equal(inspectKnowledgeMatches([row(),row({ content:'Contradictory content' })]).ok,false);
  assert.equal(inspectKnowledgeMatches([row(),row({ chunk_id:'40000000-0000-4000-8000-000000000002', metadata:{document_version:4} })]).ok,false);
});
test('knowledge fingerprints ignore rank ordering but detect changed factual context', () => {
  const a=inspectKnowledgeMatches([row()]).matches;
  const b=inspectKnowledgeMatches([row({rank:.1})]).matches;
  assert.equal(knowledgeFingerprint(a),knowledgeFingerprint(b));
  assert.notEqual(knowledgeFingerprint(a),knowledgeFingerprint(inspectKnowledgeMatches([row({content:'Changed facts'})]).matches));
});
test('invalid nonempty claim is not silently changed into an amountless claim', async () => {
  let connections=0;
  const actions=load('app/actions/payments.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{redirect(url){throw Error(url)}},'@/lib/config':{useMockData:false},'@/lib/payment-input':{parsePaymentAmount},'@/lib/supabase/server':{async createClient(){connections++;throw Error('must not connect')}}});
  for (const amount of ['oops','1.001','0x10']) { const form=new FormData();form.set('claimed_amount',amount);await assert.rejects(actions.reportPaymentClaimAction('synthetic-lead',form),/error=/); }
  assert.equal(connections,0);
});
test('an omitted claim stays non-financial; verification still requires independent evidence', async () => {
  const calls=[];
  const actions=load('app/actions/payments.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{redirect(url){throw Error(url)}},'@/lib/config':{useMockData:false},'@/lib/payment-input':{parsePaymentAmount},'@/lib/supabase/server':{async createClient(){return{rpc:async(name,args)=>{calls.push({name,args});return{data:{},error:null}}}}}});
  await assert.rejects(actions.reportPaymentClaimAction('synthetic-lead',new FormData()),/notice=payment-claim-reported/);
  assert.equal(calls.length,1); assert.equal(calls[0].name,'report_payment_claim_v1'); assert.equal(calls[0].args.p_claimed_amount,null);assert.equal(calls[0].args.p_currency,null);
  const form=new FormData();form.set('payment_amount','30000');form.set('payment_currency','INR');form.set('payment_kind','deposit');
  await assert.rejects(actions.verifyPaymentAction('synthetic-lead',form),/error=/);
  assert.equal(calls.length,1);
});
