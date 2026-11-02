const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const evidence = load('lib/knowledge-evidence.ts');
function setup(options={}) {
  const calls=[];
  const client={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:'user-a'}},error:null})},rpc:async(name,args)=>{calls.push({name,args});if(name==='can_manage_organization')return{data:!options.denied,error:null};return{data:options.data??[],error:options.error?{message:'synthetic outage'}:null}}};
  const action=load('app/settings/knowledge/actions.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{redirect(url){throw Error(url)}},'@/lib/config':{useMockData:false},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/workspace':{requireCurrentOrganizationId:async()=> 'active-org'},'@/lib/knowledge-evidence':evidence}).previewKnowledgeAction;
  const form=new FormData();form.set('query','A customer question');form.set('organization_id','attacker-supplied-org');return{action,calls,form};
}
test('retrieval preview binds the active tenant and uses read-only canonical search',async()=>{const f=setup();const r=await f.action(f.form);assert.equal(r.state,'empty');assert.deepEqual(f.calls.map(c=>c.name),['can_manage_organization','search_organization_knowledge_v1']);assert.equal(f.calls[1].args.p_organization_id,'active-org');assert.equal(f.calls[1].args.p_limit,6)});
test('non-admin and signed-out preview cannot search knowledge',async()=>{for(const options of [{denied:true},{signedOut:true}]){const f=setup(options);await assert.rejects(f.action(f.form));assert.equal(f.calls.some(c=>c.name==='search_organization_knowledge_v1'),false)}});
test('a retrieval failure is unavailable, not an empty successful preview',async()=>{const f=setup({error:true});assert.equal((await f.action(f.form)).state,'error')});
test('invalid questions do not trigger auth, retrieval or model work',async()=>{const f=setup();f.form.set('query','x'.repeat(501));assert.equal((await f.action(f.form)).state,'error');assert.equal(f.calls.length,0)});
