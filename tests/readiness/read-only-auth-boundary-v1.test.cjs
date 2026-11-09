const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers.cjs');

const gate = load('lib/ai/read-only-tool-gate-v1.ts', {
  'server-only': {},
  'node:crypto': crypto,
});
const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';
const USER_A = '20000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const SESSION = '30000000-0000-4000-8000-000000000001';
const LEAD = '40000000-0000-4000-8000-000000000001';
const proposal = (changes={})=>({
  toolId:'crm.course.list',organizationId:ORG_A,leadId:null,query:null,...changes,
});
const binding = (changes={})=>({
  schema_version:1,user_id:USER_A,session_id:SESSION,
  organization_id:ORG_A,membership_role:'admin',session_active:true,
  membership_active:true,organization_active:true,
  binding_source:'direct_live_session_binding',...changes,
});
const harness=(options={})=>{
  const calls={created:0,getUser:0,rpc:[]};
  const fake={
    auth:{
      getUser:async()=>{
        calls.getUser++;
        if(options.authThrows)throw Error('private auth token 123');
        if(options.authResponse)return options.authResponse;
        return {data:{user:{id:options.userId??USER_A}},error:null};
      },
    },
    rpc:async(name,args)=>{
      calls.rpc.push({name,args});
      if(options.rpcThrows)throw Error('sensitive SQL detail: 012345');
      if(options.rpcResponse)return options.rpcResponse;
      return {data:options.binding??binding(),error:null};
    },
  };
  const subject=load('lib/ai/read-only-auth-boundary-v1.ts', {
    'server-only': {},
    '@/lib/supabase/server':{createClient:async()=>{
      calls.created++;
      if(options.clientThrows)throw Error('private initialization failure');
      return fake;
    }},
    './read-only-tool-gate-v1':gate,
  });
  return {calls,subject};
};
test('AI-09E stays source-only and cannot be activated with environment flags',async()=>{
  const own=fs.readFileSync(path.resolve('lib/ai/read-only-auth-boundary-v1.ts'),'utf8');
  const {subject}=harness();
  assert.equal(subject.READ_ONLY_AUTH_BOUNDARY_RUNTIME_WIRED,false);
  assert.equal(subject.REQUIRED_BOUND_SESSION_RPC,'ai_read_current_bound_session_v1');
  assert.doesNotMatch(own,/createAdminClient|\.auth\.getSession\s*\(|requireCurrentOrganizationId|getCurrentWorkspaceContext/);
  assert.doesNotMatch(own,/\bfetch\s*\(|\bexecuteTool\s*\(|\bwhatsapp\.send\b/);
  for(const file of ['app/conversations/copilot-actions.ts','app/settings/knowledge/actions.ts']){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/read-only-auth-boundary-v1/);
  }
  const prev=process.env.SALSYS_AI_TOOLS_ENABLED;
  try{
    process.env.SALSYS_AI_TOOLS_ENABLED='true';
    assert.equal(subject.READ_ONLY_AUTH_BOUNDARY_RUNTIME_WIRED,false);
  }finally{
    if(prev===undefined)delete process.env.SALSYS_AI_TOOLS_ENABLED;
    else process.env.SALSYS_AI_TOOLS_ENABLED=prev;
  }
});
test('admin must be read from verified Auth and a dedicated direct-binding RPC',async()=>{
  const {subject,calls}=harness();
  const result=await subject.previewCurrentAuthenticatedReadBoundary(proposal());
  assert.deepEqual(result,{
    ok:true,decision:'session_binding_review_only',toolId:'crm.course.list',
    organizationId:ORG_A,nextRequiredControl:'atomic_resource_read_and_committed_audit',
    mayExecute:false,
  });
  assert.deepEqual(calls,{created:1,getUser:1,rpc:[
    {name:'ai_read_current_bound_session_v1',args:{p_organization_id:ORG_A}},
  ]});
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.hasOwn(result,'sessionId'),false);
  assert.equal(Object.hasOwn(result,'actorId'),false);
  assert.equal(Object.hasOwn(result,'data'),false);
});
test('owner and each known read-only tool remain review-only, never a grant',async()=>{
  for(const props of [
    proposal({toolId:'crm.course.list'}),
    proposal({toolId:'crm.lead.read',leadId:LEAD}),
    proposal({toolId:'knowledge.approved.search',query:'Synthetic course fee'}),
  ]){
    const {subject}=harness({binding:binding({membership_role:'owner'})});
    const result=await subject.previewCurrentAuthenticatedReadBoundary(props);
    assert.equal(result.ok,true);
    assert.equal(result.toolId,props.toolId);
    assert.equal(result.mayExecute,false);
    assert.equal(Object.hasOwn(result,'records'),false);
  }
});
test('unknown mutation, unsafe tool arguments and forged identities deny before Auth',async()=>{
  for(const changes of [
    {toolId:'crm.lead.update'},{toolId:'whatsapp.send'},
    {actorId:USER_A},{role:'owner'},{sessionId:SESSION},{sessionVerified:true},
    {organizationId:'invalid'},{leadId:LEAD},{query:'wildcard'},
    {endpoint:'https://private.invalid'}, {sql:'select * from leads'},
  ]){
    const {subject,calls}=harness();
    const result=await subject.previewCurrentAuthenticatedReadBoundary(proposal(changes));
    assert.deepEqual(result,{ok:false,reason:'invalid_request',mayExecute:false});
    assert.equal(calls.created,0);
    assert.equal(calls.getUser,0);
    assert.equal(calls.rpc.length,0);
  }
});
test('absent, invalid or failed auth user denies before binding call',async()=>{
  const options=[
    {authResponse:{data:{user:null},error:null}},
    {authResponse:{data:{user:{id:USER_A}},error:{message:'expired'}}},
    {authResponse:{data:{user:{id:'invalid'}},error:null}},
    {authThrows:true},{clientThrows:true},
  ];
  for(const o of options){
    const {subject,calls}=harness(o);
    const result=await subject.previewCurrentAuthenticatedReadBoundary(proposal());
    assert.equal(result.ok,false);
    assert.equal(result.mayExecute,false);
    assert.equal(calls.rpc.length,0);
    assert.doesNotMatch(JSON.stringify(result),/expired|private|token/);
  }
});
test('RPC failure/missing implementation cannot authorize a read',async()=>{
  for(const opts of [
    {rpcResponse:{data:null,error:{message:'missing function'}}},
    {rpcResponse:{data:null,error:null}},
    {rpcThrows:true},
    {rpcResponse:{data:{message:'not configured'},error:null}},
  ]){
    const {subject}=harness(opts);
    const result=await subject.previewCurrentAuthenticatedReadBoundary(proposal());
    assert.equal(result.ok,false);
    assert.equal(result.mayExecute,false);
    assert.doesNotMatch(JSON.stringify(result),/sensitive SQL|missing function|012345/);
  }
});
test('claimed tenant differs from verified session binding',async()=>{
  for(const patch of [
    {organization_id:ORG_B},
    {user_id:USER_B},
    {binding_source:'sole_membership_fallback'},
    {binding_source:'workspace_auto_bind'},
    {binding_source:'service_role_bypass'},
  ]){
    const {subject}=harness({binding:binding(patch)});
    const result=await subject.previewCurrentAuthenticatedReadBoundary(proposal());
    assert.deepEqual(result,{ok:false,reason:'binding_denied',mayExecute:false});
  }
});
test('inactive, revoked or rotated session and membership deny',async()=>{
  for(const patch of [
    {session_active:false},{membership_active:false},{organization_active:false},
    {session_id:'missing'},{session_id:null},{schema_version:2},
    {membership_role:'member'},{membership_role:'viewer'},
    {membership_role:'service_role'},{membership_role:'manager'},
  ]){
    const {subject}=harness({binding:binding(patch)});
    const result=await subject.previewCurrentAuthenticatedReadBoundary(proposal());
    assert.equal(result.ok,false,JSON.stringify(patch));
    assert.equal(result.reason,'binding_denied');
  }
});
test('server Auth and RPC response identities must correspond',async()=>{
  const {subject}=harness({userId:USER_B});
  assert.deepEqual(await subject.previewCurrentAuthenticatedReadBoundary(proposal()),{
    ok:false,reason:'binding_denied',mayExecute:false,
  });
});
test('extra fields and privilege/status claims cannot bypass exact schema',async()=>{
  for(const patch of [
    {roleOverride:'owner'},{may_execute:true},{grants:['read','write']},
    {session_id:'30000000-0000-4000-8000-000000000001',endpoint:'http://unsafe.invalid'},
  ]){
    const {subject}=harness({binding:binding(patch)});
    assert.equal((await subject.previewCurrentAuthenticatedReadBoundary(proposal())).ok,false);
  }
});
test('malformed RPC result types, prototypes and accessors fail closed',async()=>{
  for(const malformed of [
    [],'string',true,42,{},Object.assign(Object.create({admin:true}),binding()),
    Object.defineProperty({...binding()},'organization_id',{get(){throw Error('hostile getter');},enumerable:true}),
    new Proxy(binding(),{getPrototypeOf(){throw Error('hostile proxy');}}),
  ]){
    const {subject}=harness({binding:malformed});
    const result=await subject.previewCurrentAuthenticatedReadBoundary(proposal());
    assert.equal(result.ok,false);
    assert.equal(result.mayExecute,false);
  }
});
test('lead or search request content never forwarded to session lookup',async()=>{
  for(const p of [
    proposal({toolId:'crm.lead.read',leadId:LEAD}),
    proposal({toolId:'knowledge.approved.search',query:'Private synthetic lead data'}),
  ]){
    const {subject,calls}=harness();
    const result=await subject.previewCurrentAuthenticatedReadBoundary(p);
    assert.equal(result.ok,true);
    assert.deepEqual(calls.rpc[0].args,{p_organization_id:ORG_A});
    assert.equal(JSON.stringify(calls.rpc[0]).includes(LEAD),false);
    assert.equal(JSON.stringify(calls.rpc[0]).includes('Private synthetic'),false);
  }
});
