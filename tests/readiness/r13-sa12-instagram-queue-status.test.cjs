const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers.cjs');
const input={organizationId:'org',rawEventId:'raw',sourceEventId:'event',leadId:'lead',conversationId:'conversation',instagramAccountId:'account',instagramUserId:'user',commentId:'comment',messageType:'text',body:'hello'};
function fixture(states,{error=false,wrongId=false}={}){
  const calls=[];let i=0;
  const admin={from(table){
    calls.push(table);
    let payload;
    const q={select(){return q;},eq(){return q;},order(){return q;},upsert(value){payload=value;calls.push('upsert:'+table);return q;},async maybeSingle(){
      if(table==='organizations'){const status=states[i++];return {data:status===null?null:{id:wrongId?'other':'org',status},error:error?{}:null};}
      if(table==='instagram_automation_runs')return {data:{id:'run',status:payload.status},error:null};
      throw Error('unexpected single read '+table);
    },then(resolve){
      if(table==='instagram_automation_rules')return resolve({data:[{id:'rule',match_mode:'any',response_text:'reply',requires_human_approval:true}],error:null});
      if(table==='instagram_channel_preferences')return resolve({error:null});
      throw Error('unexpected read '+table);
    }};
    return q;
  }};
  const ops=load('lib/automation/instagram-operations.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/commercial/automation-access':{commercialAutomationAllowed:()=>{throw Error('queue must not invoke send');}},'@/lib/integrations/instagram-connection':{}});
  return {ops,calls};
}
test('inactive, missing or mismatched tenant stops both reply queues before rule reads',async()=>{
  for(const method of ['queueInstagramDmAutomation','queueInstagramCommentAutomation']){
    for(const status of ['suspended','archived',null,'unknown']){
      const f=fixture([status]);assert.equal((await f.ops[method](input)).queued,false);assert.deepEqual(f.calls,['organizations']);
    }
    const f=fixture(['active'],{wrongId:true});assert.equal((await f.ops[method](input)).queued,false);assert.deepEqual(f.calls,['organizations']);
    const e=fixture(['active'],{error:true});await assert.rejects(e.ops[method](input),/authorization unavailable/);assert.deepEqual(e.calls,['organizations']);
  }
});
test('queue rechecks tenant immediately before write and keeps approval lineage',async()=>{
  for(const method of ['queueInstagramDmAutomation','queueInstagramCommentAutomation']){
    const f=fixture(['active','suspended']);assert.equal((await f.ops[method](input)).queued,false);assert.deepEqual(f.calls,['organizations','instagram_automation_rules','organizations']);
    const a=fixture(['active','active']);const result=await a.ops[method](input);assert.equal(result.queued,true);assert.equal(result.status,'pending_approval');assert.ok(a.calls.includes('upsert:instagram_automation_runs'));
  }
});
test('STOP stays a suppression-only path even for inactive tenant at queue boundary',async()=>{
  const f=fixture(['suspended']);const result=await f.ops.queueInstagramDmAutomation({...input,body:' STOP '});assert.equal(result.suppressed,true);assert.equal(result.queued,false);assert.deepEqual(f.calls,['instagram_channel_preferences','upsert:instagram_channel_preferences']);
});
