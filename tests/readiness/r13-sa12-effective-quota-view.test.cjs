const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const {readFileSync}=require('node:fs');
const {parseEffectiveQuotaPreview:parse}=load('lib/platform-effective-quota-view.ts');
const row={state:'manual_active',plan_code:'growth',named_users:5,named_user_limit:5,lead_records:10001,lead_record_limit:10000,named_users_over_limit:false,lead_records_over_limit:true};
test('effective quota display separates full and over-limit counters without negative remaining slots',()=>{
  const result=parse({...row,private_metadata:'not exposed'});
  assert.deepEqual(result,{state:'manual_active',planCode:'growth',users:{used:5,limit:5,remaining:0,overLimit:false,atLimit:true},leads:{used:10001,limit:10000,remaining:0,overLimit:true,atLimit:false}});
  assert.equal(parse({...row,state:'pro_trial',plan_code:'pro'}).state,'pro_trial');
  assert.equal(parse({...row,state:'free_pending_reconciliation',plan_code:'free'}).state,'free_pending_reconciliation');
});
test('unknown, invalid and mismatched quota observations fail closed',()=>{
  for(const input of [null,[],{}, {...row,state:'free'}, {...row,named_users:'5'}, {...row,lead_record_limit:0}, {...row,named_users:-1}, {...row,lead_records:Number.MAX_SAFE_INTEGER+1}, {...row,lead_records_over_limit:false}]){
    assert.deepEqual(parse(input),{state:'unavailable'});
  }
  for(const state of ['unavailable','managed_separately','organization_inactive'])assert.deepEqual(parse({...row,state}),{state});
});
test('quota panel has no API access or fabricated data; existing profile remains disconnected',()=>{
  const panel=readFileSync('components/platform-effective-quota-panel.tsx','utf8');
  assert.doesNotMatch(panel,/createAdminClient|\.rpc\(|fetch\(|<form|<button/);
  assert.match(panel,/aria-valuetext/);
  const page=readFileSync('app/platform-admin/organization/page.tsx','utf8');
  assert.doesNotMatch(page,/EffectiveQuotaPanel|parseEffectiveQuotaPreview/);
});
