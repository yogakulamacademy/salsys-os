const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { getRefundOptions } = load('lib/refund-options.ts');
const { parsePaymentAmount } = load('lib/payment-input.ts');
const original = {id:'10000000-0000-4000-8000-000000000001',paymentKind:'deposit',status:'paid',amount:30000,currency:'INR',externalPaymentId:'deposit-1',createdAt:'2026-01-01'};
const requestId = '20000000-0000-4000-8000-000000000001';
const refund = extra => ({id:'refund',paymentKind:'refund',status:'refunded',amount:10000,currency:'INR',originalPaymentId:original.id,...extra});

test('refund options subtract linked cash returns without mixing currencies', () => {
  const options=getRefundOptions([original,refund(),{...original,id:'usd',currency:'USD',amount:90}]);
  assert.equal(options[0].remaining,20000); assert.equal(options[1].remaining,90);
  assert.equal(getRefundOptions([original,refund({amount:30000})]).length,0);
});
test('unlinked settled refunds block that currency until reconciliation', () => {
  assert.deepEqual(getRefundOptions([original,refund({originalPaymentId:undefined})]),[]);
  assert.equal(getRefundOptions([original,refund({status:'failed',originalPaymentId:undefined})]).length,1);
});
test('pending, failed, refunded originals and refund rows are never eligible originals', () => {
  for(const status of ['pending','failed','refunded','partially_refunded']) assert.deepEqual(getRefundOptions([{...original,status}]),[]);
  assert.deepEqual(getRefundOptions([refund()]),[]);
});
test('fractional refund availability preserves cents', () => {
  assert.equal(getRefundOptions([{...original,amount:.30},refund({amount:.01})])[0].remaining,.29);
});

function setup(response={data:{ok:true,payment_id:'refund-1'},error:null}) {
  const calls=[], refreshed=[];
  const actions=load('app/actions/payments.ts',{
    'next/cache':{revalidatePath(path){refreshed.push(path)}},
    'next/navigation':{redirect(url){throw Error(url)}},
    '@/lib/config':{useMockData:false}, '@/lib/payment-input':{parsePaymentAmount},
    '@/lib/supabase/server':{async createClient(){return{rpc:async(name,args)=>{calls.push({name,args});return response},from(){throw Error('Refund must not use separate table writes')}}}},
  });
  const form=new FormData();
  for(const [key,value] of Object.entries({original_payment_id:original.id,refund_request_id:requestId,refund_amount:'10000.25',refund_currency:'INR',refund_provider:'bank_transfer',refund_reference:'return-1',refund_notes:'Bank return verified'})) form.set(key,value);
  return {action:actions.recordRefundAction,form,calls,refreshed};
}
test('refund action uses one canonical command and stable request ID, never separate writes', async () => {
  const s=setup(); s.form.set('organization_id','attacker-supplied-org');
  await assert.rejects(s.action('lead-a',s.form),/notice=refund-recorded/);
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'record_refund_v1');
  assert.equal(s.calls[0].args.p_request_id,requestId);assert.equal(s.calls[0].args.p_original_payment_id,original.id);
  assert.equal(s.calls[0].args.p_amount,10000.25);assert.equal(s.calls[0].args.p_paid_at,null);
  assert.equal('p_organization_id' in s.calls[0].args,false); assert.ok(s.refreshed.includes('/revenue'));
});
test('refund errors do not refresh surfaces or report success', async () => {
  const s=setup({data:null,error:{message:'Refund exceeds remaining balance'}});
  await assert.rejects(s.action('lead-a',s.form),/error=Refund%20exceeds/);
  assert.deepEqual(s.refreshed,[]);
});
test('an incomplete refund response cannot be presented as confirmed financial success', async () => {
  for(const data of [null,{}, {ok:false},{ok:true}]){
    const s=setup({data,error:null});await assert.rejects(s.action('lead-a',s.form),/error=Refund%20confirmation/);assert.deepEqual(s.refreshed,[]);
  }
});
test('invalid refund input stops before the database command', async () => {
  for(const [key,value] of [['original_payment_id','wrong'],['refund_request_id',''],['refund_amount','1.001'],['refund_currency','EUR'],['refund_notes',''],['paid_at','bad-date']]) {
    const s=setup(); s.form.set(key,value);await assert.rejects(s.action('lead-a',s.form),/error=/);assert.equal(s.calls.length,0,key);
  }
});
