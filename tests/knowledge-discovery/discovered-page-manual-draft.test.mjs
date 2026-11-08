import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require=createRequire(import.meta.url);
const ts=require('typescript');
function load(path,imports={}){
  const javascript=ts.transpileModule(readFileSync(resolve(path),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const exports={};
  new Function('require','exports','process',javascript)(name=>{
    if(!(name in imports))throw Error('Unapproved dependency '+name);
    return imports[name];
  },exports,process);
  return exports;
}

const gate=load('lib/knowledge-discovery/pilot-gate.ts');
const link=load('lib/knowledge-discovery/public-page-link.ts');
const proof=load('lib/knowledge-discovery/domain-verification.ts',{
  'node:crypto':require('node:crypto'),
});
const consent=load('lib/knowledge-discovery/site-consent.ts');
const helper=load('lib/knowledge-discovery/eligible-page-draft.ts',{
  'server-only':{},
  '@/lib/knowledge-discovery/domain-verification':proof,
  '@/lib/knowledge-discovery/pilot-gate':gate,
  '@/lib/knowledge-discovery/public-page-link':link,
  '@/lib/knowledge-discovery/site-consent':consent,
});
const org='10000000-0000-4000-8000-000000000001';
const otherOrg='10000000-0000-4000-8000-000000000002';
const actor='20000000-0000-4000-8000-000000000001';
const pageId='30000000-0000-4000-8000-000000000001';
const jobId='40000000-0000-4000-8000-000000000001';
const host='fixture.example.com';
const website='https://fixture.example.com/';
const rawPage='https://fixture.example.com/about';

let rows={},readCalls=[],rpcCalls=[],revalidations=[],authenticated=true,role='owner',
  activeOrg=org,canManage=true,createError=null,createResult=null,errorTable=null,
  withdrawBetweenReadsAndCommit=false;
const flags=[
  'KNOWLEDGE_DISCOVERY_PILOT_ENABLED',
  'KNOWLEDGE_DISCOVERY_PAUSED',
  'KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS',
  'KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED',
];
const originalFlags=Object.fromEntries(flags.map(k=>[k,process.env[k]]));
test.after(()=>{
  for(const key of flags){
    if(originalFlags[key]===undefined)delete process.env[key];
    else process.env[key]=originalFlags[key];
  }
});
function reset(){
  process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED='true';
  process.env.KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS=host;
  delete process.env.KNOWLEDGE_DISCOVERY_PAUSED;
  process.env.KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED='true';
  readCalls=[];rpcCalls=[];revalidations=[];
  authenticated=true;role='owner';activeOrg=org;canManage=true;
  createError=null;createResult=null;errorTable=null;
  withdrawBetweenReadsAndCommit=false;
  const now=Date.now();
  rows={
    organization_onboarding:{organization_id:org,website_url:website},
    knowledge_discovery_pages:{
      id:pageId,organization_id:org,job_id:jobId,url:rawPage,
      status:'fetched',http_status:200,page_title:'About our practice',
    },
    knowledge_discovery_jobs:{
      id:jobId,organization_id:org,seed_url:website,status:'completed',
    },
    knowledge_discovery_domain_verifications:{
      organization_id:org,hostname:host,
      verified_at:new Date(now-20_000).toISOString(),
      verified_until:new Date(now+20_000).toISOString(),
    },
    knowledge_discovery_site_consents:{
      organization_id:org,hostname:host,purpose:'website_discovery_review_only',
      status:'granted',policy_version:'reviewed-test-v1',granted_by:actor,
      granted_at:new Date(now-20_000).toISOString(),
      valid_until:new Date(now+20_000).toISOString(),withdrawn_at:null,
    },
  };
}
const client={
  auth:{getUser:async()=>({data:{user:authenticated?{id:actor}:null},error:null})},
  from(table){
    readCalls.push(table);
    if(!(table in rows))throw Error('Unexpected tenant read '+table);
    const constraints={};
    const builder={
      select(){return builder;},
      eq(key,value){constraints[key]=value;return builder;},
      async maybeSingle(){
        if(errorTable===table)return {data:null,error:{code:'42501'}};
        const row=rows[table];
        if(!row || Object.entries(constraints).some(([key,value])=>row[key]!==value)){
          return {data:null,error:null};
        }
        return {data:row,error:null};
      },
    };
    return builder;
  },
  async rpc(name,args){
    rpcCalls.push({name,args});
    if(name==='can_manage_organization')return {data:canManage,error:null};
    if(name==='create_discovery_review_draft_with_current_consent_v1'){
      // Model the required future DB atomic guard rather than old app SELECT:
      // this test mock rechecks page/job/site/proof/consent at the RPC boundary.
      // It does NOT substitute for real SQL/locking or staging verification.
      const checked=await helper.eligibleDiscoveredPageForManualDraft(
        client,args.p_organization_id,args.p_page_id);
      if(withdrawBetweenReadsAndCommit || !checked ||
          rows.knowledge_discovery_site_consents?.status !== 'granted'){
        return {data:{ok:false,reason:'authorization_not_current'},error:null};
      }
      return {data:createError?null:(createResult??{
        ok:true,status:'draft',
        organization_id:org,page_id:pageId,
        document_id:'50000000-0000-4000-8000-000000000001',
        source_id:'60000000-0000-4000-8000-000000000001',
      }),error:createError};
    }
    throw Error('Unexpected RPC '+name);
  },
};

const action=load('app/settings/knowledge/discovery/draft-action.ts',{
  'next/cache':{revalidatePath:path=>revalidations.push(path)},
  'next/navigation':{redirect:where=>{throw Error('redirect:'+where);}},
  '@/lib/config':{useMockData:false},
  '@/lib/supabase/server':{createClient:async()=>client},
  '@/lib/workspace':{getCurrentWorkspaceContext:async()=>({
    activeOrganizationId:activeOrg,
    activeWorkspace:{organizationId:org,role},
  })},
  '@/lib/knowledge-discovery/eligible-page-draft':helper,
});
function submission(overrides={}){
  const data=new FormData();
  for(const [key,value] of Object.entries({
    page_id:pageId,title:'Checked course information',
    content:'Human-verified content about the school only.',
    category:'faq',intent:'approve',
    organization_id:otherOrg,source_uri:'https://attacker.example.com/',
    source_name:'Forged website citation',
    p_approve:'true',...overrides,
  })) if(value!==null)data.set(key,value);
  return data;
}
async function redirected(actionPromise,contains){
  await assert.rejects(actionPromise,error=>{
    assert.match(error.message,/^redirect:/);
    if(contains)assert.ok(error.message.includes(contains),error.message);
    return true;
  });
}

test('KB-09Q manual draft uses a current, fetched, host-bound page with live consent',async()=>{
  reset();
  const found=await helper.eligibleDiscoveredPageForManualDraft(client,org,pageId);
  assert.deepEqual(found,{
    pageId,title:'About our practice',sourceName:'About our practice',sourceUri:rawPage,
  });
  assert.deepEqual(readCalls,[
    'organization_onboarding','knowledge_discovery_pages','knowledge_discovery_jobs',
    'knowledge_discovery_domain_verifications','knowledge_discovery_site_consents',
  ]);
});

test('KB-09Q a forged URL, wrong tenant, stale job or unfetched page cannot become a draft source',async()=>{
  const cases=[
    ()=>{rows.knowledge_discovery_pages.url='https://evil.example.com/page';},
    ()=>{rows.knowledge_discovery_pages.url='javascript:alert(1)';},
    ()=>{rows.knowledge_discovery_pages.status='failed';},
    ()=>{rows.knowledge_discovery_pages.http_status=404;},
    ()=>{rows.knowledge_discovery_jobs.status='cancelled';},
    ()=>{rows.knowledge_discovery_jobs.status='running';},
    ()=>{rows.knowledge_discovery_jobs.seed_url='https://different.example.com/';},
    ()=>{rows.knowledge_discovery_domain_verifications.verified_until=new Date(Date.now()-1000).toISOString();},
    ()=>{rows.knowledge_discovery_site_consents.status='withdrawn';},
    ()=>{rows.knowledge_discovery_site_consents.purpose='analytics';},
    ()=>{rows.knowledge_discovery_site_consents.organization_id=otherOrg;},
    ()=>{rows.organization_onboarding.website_url='https://new.example.com/';},
    ()=>{errorTable='knowledge_discovery_pages';},
  ];
  for(const change of cases){
    reset();change();
    assert.equal(await helper.eligibleDiscoveredPageForManualDraft(client,org,pageId),
      null,'Refused '+String(change));
  }
  reset();
  assert.equal(await helper.eligibleDiscoveredPageForManualDraft(client,otherOrg,pageId),null);
  assert.equal(await helper.eligibleDiscoveredPageForManualDraft(client,org,'bad-id'),null);
});

test('KB-09Q private pilot-off and empty allowed hosts reject page candidates before database use',async()=>{
  for(const value of [
    {key:'KNOWLEDGE_DISCOVERY_PILOT_ENABLED',value:'false'},
    {key:'KNOWLEDGE_DISCOVERY_PAUSED',value:'true'},
    {key:'KNOWLEDGE_DISCOVERY_ALLOWED_HOSTS',value:''},
  ]){
    reset();process.env[value.key]=value.value;
    assert.equal(await helper.eligibleDiscoveredPageForManualDraft(client,org,pageId),null);
  }
});

test('KB-09Q forged form fields cannot approve/publish or change the source URL and tenant',async()=>{
  reset();
  await redirected(action.createManualDraftFromDiscoveredPageAction(submission()),'/settings/knowledge');
  assert.deepEqual(rpcCalls.map(x=>x.name),[
    'can_manage_organization','create_discovery_review_draft_with_current_consent_v1',
  ]);
  const created=rpcCalls[1].args;
  assert.equal(created.p_organization_id,org);
  assert.equal(created.p_page_id,pageId);
  assert.deepEqual(Object.keys(created).sort(),[
    'p_category','p_content','p_organization_id','p_page_id','p_title',
  ].sort(),'Untrusted source URL/name/approval cannot be supplied to new atomic SQL');
  assert.equal(created.p_title,'Checked course information');
  assert.equal(created.p_content,'Human-verified content about the school only.');
  assert.deepEqual(revalidations,['/settings/knowledge']);
  assert.equal(rpcCalls.some(x=>/approve_knowledge_document/.test(x.name)),false);
});

test('KB-09Q page ID rechecked on write; revoked consent and stale proof deny the action',async()=>{
  for(const change of [
    ()=>{rows.knowledge_discovery_site_consents.withdrawn_at=new Date().toISOString();},
    ()=>{rows.knowledge_discovery_domain_verifications.verified_until=new Date(Date.now()-1).toISOString();},
    ()=>{rows.knowledge_discovery_pages.status='blocked';},
    ()=>{rows.knowledge_discovery_pages.organization_id=otherOrg;},
  ]){
    reset();change();
    await redirected(action.createManualDraftFromDiscoveredPageAction(submission()),'draftError=');
    assert.equal(rpcCalls.some(x=>x.name==='create_discovery_review_draft_with_current_consent_v1'),false);
    assert.deepEqual(revalidations,[]);
  }
});

test('KB-09Q blocks anonymous, wrong role, mismatched active tenant or failed manage RPC',async()=>{
  for(const change of [
    ()=>{authenticated=false;},
    ()=>{role='manager';},
    ()=>{role='admissions';},
    ()=>{activeOrg=otherOrg;},
    ()=>{canManage=false;},
  ]){
    reset();change();
    await redirected(action.createManualDraftFromDiscoveredPageAction(submission()));
    assert.equal(rpcCalls.some(x=>x.name==='create_discovery_review_draft_with_current_consent_v1'),false);
    assert.deepEqual(revalidations,[]);
  }
});

test('KB-09Q rejects invalid manual evidence inputs and disabled pilot without saving',async()=>{
  for(const update of [
    {title:'x'},{content:'short'},{category:'untrusted'},
    {content:'x'.repeat(20001)},{page_id:'../../another-tenant'},
  ]){
    reset();
    await redirected(action.createManualDraftFromDiscoveredPageAction(submission(update)));
    assert.deepEqual(rpcCalls,[],'No database RPCs before validation');
  }
  reset();process.env.KNOWLEDGE_DISCOVERY_PILOT_ENABLED='false';
  await redirected(action.createManualDraftFromDiscoveredPageAction(submission()));
  assert.deepEqual(rpcCalls,[]);
});

test('KB-09Q underlying create RPC failure never reports saved or approved',async()=>{
  reset();createError={code:'42501',message:'access denied'};
  await redirected(action.createManualDraftFromDiscoveredPageAction(submission()),'draftError=');
  assert.deepEqual(revalidations,[]);
  assert.equal(rpcCalls.at(-1).args.p_page_id,pageId);
});

test('KB-09Q a misleading successful RPC response never confirms a saved draft',async()=>{
  for(const outcome of [
    null,{ok:true,status:'approved',
      document_id:'50000000-0000-4000-8000-000000000001',
      source_id:'60000000-0000-4000-8000-000000000001'},
    {ok:false,status:'draft'},
    {ok:true,status:'draft',document_id:'invalid',source_id:'invalid'},
  ]){
    reset();
    createResult=outcome??{ok:true,status:'draft',document_id:null,source_id:null};
    await redirected(action.createManualDraftFromDiscoveredPageAction(submission()),'draftError=');
    assert.deepEqual(revalidations,[]);
    assert.equal(rpcCalls.at(-1).args.p_page_id,pageId);
  }
});

test('KB final: consent withdrawal after UI eligibility but before DB mutation fails closed',async()=>{
  reset();
  withdrawBetweenReadsAndCommit=true;
  await redirected(action.createManualDraftFromDiscoveredPageAction(submission()),'draftError=');
  assert.deepEqual(revalidations,[]);
  assert.deepEqual(rpcCalls.map(x=>x.name),[
    'can_manage_organization','create_discovery_review_draft_with_current_consent_v1',
  ]);
});

test('KB final: draft write is held OFF by default even if discovery pilot is enabled',async()=>{
  reset();delete process.env.KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED;
  await redirected(action.createManualDraftFromDiscoveredPageAction(submission()),'draftError=');
  assert.deepEqual(rpcCalls,[],'No DB access until independent reviewed atomic RPC is approved');
});

test('KB final: receipt must bind both the source page and the current tenant',async()=>{
  for(const result of [
    {ok:true,status:'draft',organization_id:otherOrg,page_id:pageId,
      document_id:'50000000-0000-4000-8000-000000000001',
      source_id:'60000000-0000-4000-8000-000000000001'},
    {ok:true,status:'draft',organization_id:org,page_id:jobId,
      document_id:'50000000-0000-4000-8000-000000000001',
      source_id:'60000000-0000-4000-8000-000000000001'},
  ]){
    reset();createResult=result;
    await redirected(action.createManualDraftFromDiscoveredPageAction(submission()),'draftError=');
    assert.deepEqual(revalidations,[]);
  }
});

test('KB-09Q only fetched terminal pages present the handoff and UI has no auto-approval',()=>{
  const discovery=readFileSync(resolve('components/knowledge-discovery-workspace.tsx'),'utf8');
  const page=readFileSync(resolve('app/settings/knowledge/page.tsx'),'utf8');
  const actionFile=readFileSync(resolve('app/settings/knowledge/discovery/draft-action.ts'),'utf8');
  assert.match(discovery,/page.status === 'fetched'/);
  assert.match(discovery,/latest.status === 'completed'/);
  assert.match(discovery,/latest.status === 'partial'/);
  assert.match(discovery,/state.discoveryEnabled/);
  assert.match(discovery,/Prepare manual draft/);
  assert.match(page,/eligibleDiscoveredPageForManualDraft/);
  assert.match(page,/action=\{createManualDraftFromDiscoveredPageAction\}/);
  assert.match(page,/Manually reviewed knowledge/);
  assert.match(page,/Only <strong>Save as Draft<\/strong>/);
  assert.match(page,/canManage && !discoveredDraft/);
  assert.match(actionFile,/create_discovery_review_draft_with_current_consent_v1/);
  assert.doesNotMatch(actionFile,/create_source_backed_knowledge_document_v2/);
  assert.doesNotMatch(actionFile,/p_approve:/);
  assert.match(page,/Draft saving on hold/);
  assert.match(page,/disabled=\{!atomicDiscoveredDraftApproved\}/);
  assert.doesNotMatch(actionFile,/createAdminClient/);
  assert.doesNotMatch(actionFile,/fetch\(|https?\.get/);
});
