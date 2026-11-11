const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const evidence = load('lib/knowledge-evidence.ts');
process.env.ANTHROPIC_API_KEY='synthetic-test-key-never-sent';
process.env.ANTHROPIC_HAIKU_MODEL='synthetic-router';
process.env.ANTHROPIC_SONNET_MODEL='synthetic-drafter';
const hit = extra => ({ chunk_id:'40000000-0000-4000-8000-000000000001',document_id:'50000000-0000-4000-8000-000000000001',title:'Synthetic transfer policy',category:'transfers',content:'Synthetic policy content for tests, not a real business rule.',rank:.5,valid_until:null,metadata:{document_version:2,secret_debug:'do-not-forward'},...extra });
function setup(options={}) {
  const calls={model:[],search:[],admin:0};
  const old=global.fetch;
  global.fetch=async(_url,init)=>{calls.model.push(JSON.parse(init.body));return{ok:true,text:async()=>JSON.stringify({content:[{type:'text',text:calls.model.length===1?'simple|low|knowledge_lookup|reply|Approved context retrieved':'The admissions team can confirm the current policy.'}]})}};
  const rows={leads:{id:'lead-a',organization_id:'org-a',current_contact_channel:'whatsapp',interested_course_id:options.selectedCourse?'course-a':null},conversations:{id:'conversation-a'},messages:options.messages??[{direction:'inbound',sender_type:'lead',body:'What is the transfer policy?',created_at:'2026-11-02T10:00:00Z'}],courses:[],course_batches:[]};
  function table(name){const q={select(){return q},eq(){return q},order(){return q},gte(){return q},limit(){return q},maybeSingle(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};const result=()=>({data:rows[name],error:options.catalogError&&(name==='courses'||name==='course_batches')?{message:'synthetic catalog error'}:null});return q;}
  const userClient={auth:{getUser:async()=>({data:{user:{id:'user-a'}},error:null})},rpc:async(name,args)=>{
    if(name==='can_work_lead')return{data:options.deny!==true,error:null};
    assert.equal(name,'search_organization_knowledge_v1');assert.equal(args.p_organization_id,'org-a');calls.search.push(args);
    return{data:calls.search.length>1&&options.revoked?[]:Object.hasOwn(options,'matches')?options.matches:[hit()],error:options.retrievalError?{message:'synthetic knowledge outage'}:null};
  }};
  const action=load('app/conversations/copilot-actions.ts',{'@/lib/supabase/server':{createClient:async()=>userClient},'@/lib/supabase/admin':{createAdminClient(){calls.admin++;return{from:table}}},'@/lib/knowledge-evidence':evidence}).generateCopilotReplyAction;
  return{calls,action,restore:()=>{global.fetch=old}};
}
test('denied lead stops before privileged context, retrieval or model calls',async()=>{const f=setup({deny:true});try{assert.equal((await f.action('lead-a')).ok,false);assert.equal(f.calls.admin,0);assert.equal(f.calls.model.length,0);}finally{f.restore()}});
test('knowledge outage and malformed response fail before either model runs',async()=>{for(const options of [{retrievalError:true},{matches:null},{matches:[hit({valid_until:'2020-01-01T00:00:00Z'})]}]){const f=setup(options);try{assert.equal((await f.action('lead-a')).ok,false);assert.equal(f.calls.model.length,0);}finally{f.restore()}}});
test('explicit unverified discovery provenance fails before model routing or drafting',async()=>{
  const held=[
    {document_metadata:{entry_mode:'discovery_manual_review'}},
    {document_metadata:{manual_review_required:true}},
    {document_metadata:{manual_review_required:'true'}},
    {document_metadata:{source_text_verified:false}},
    {document_metadata:{source_text_verified:'false'}},
    {source_metadata:{entry_mode:'discovery_manual_review'}},
    {source_metadata:{source_text_verified:false}},
    {chunk_metadata:{source:'manual_discovery_draft_unverified'}},
    {chunk_metadata:{manual_review_required:true}},
    {entry_mode:'discovery_manual_review'},
  ];
  for(const metadata of held){
    const f=setup({matches:[hit({metadata:{document_version:2,...metadata}})]});
    try{
      const reply=await f.action('lead-a');
      assert.equal(reply.ok,false,JSON.stringify(metadata));
      assert.match(reply.error,/needs source verification/,JSON.stringify(metadata));
      assert.equal(f.calls.model.length,0,'Unverified evidence must not be sent to ANY provider');
      assert.equal(f.calls.search.length,1,'Unsafe result must be rejected before the second retrieval');
      assert.equal(f.calls.admin,1,'Lead permission still verified before reading');
    }finally{f.restore()}
  }
});
test('ordinary approved knowledge remains usable when markers are absent or explicitly verified',async()=>{
  for(const metadata of [
    {document_version:2},
    {document_version:2,document_metadata:{entry_mode:'knowledge_workspace_v2',source_text_verified:true}},
    {document_version:2,chunk_metadata:{source:'manual'}},
  ]){
    const f=setup({matches:[hit({metadata})]});
    try{
      const reply=await f.action('lead-a');
      assert.equal(reply.ok,true,JSON.stringify(metadata));
      assert.equal(reply.knowledgeUsed,1);
      assert.equal(f.calls.model.length,2);
    }finally{f.restore()}
  }
});
test('catalog failure is not silently turned into missing facts',async()=>{for(const selectedCourse of [false,true]){const f=setup({catalogError:true,selectedCourse});try{assert.equal((await f.action('lead-a')).ok,false);assert.equal(f.calls.model.length,0);}finally{f.restore()}}});
test('latest non-text inbound does not fall back to an older unrelated text request',async()=>{const f=setup({messages:[{direction:'inbound',body:null,created_at:'2026-11-02T10:01:00Z'},{direction:'inbound',body:'Old policy question',created_at:'2026-11-02T10:00:00Z'}]});try{const r=await f.action('lead-a');assert.equal(r.ok,false);assert.equal(f.calls.search.length,0);assert.equal(f.calls.model.length,0);}finally{f.restore()}});
test('successful draft has minimized retrieved-document lineage and rechecks current knowledge',async()=>{const f=setup();try{const r=await f.action('lead-a');assert.equal(r.ok,true);assert.equal(r.knowledgeEvidence[0].version,2);assert.equal(f.calls.search.length,2);assert.equal(f.calls.model.length,2);assert.doesNotMatch(JSON.stringify(f.calls.model),/secret_debug|do-not-forward/);assert.match(f.calls.model[1].system,/never send messages yourself/);}finally{f.restore()}});
test('revocation during generation withholds the stale draft',async()=>{const f=setup({revoked:true});try{const r=await f.action('lead-a');assert.equal(r.ok,false);assert.match(r.error,/changed or expired/);assert.equal(f.calls.model.length,2);assert.equal(f.calls.search.length,2);assert.equal(Object.hasOwn(r,'draft'),false);}finally{f.restore()}});
test('a successful empty lookup stays distinct and cannot claim knowledge support',async()=>{const f=setup({matches:[]});try{const r=await f.action('lead-a');assert.equal(r.ok,true);assert.equal(r.knowledgeUsed,0);assert.deepEqual(r.knowledgeEvidence,[]);}finally{f.restore()}});
