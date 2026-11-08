import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require=createRequire(import.meta.url);
const ts=require('typescript');
function load(path,imports={}){
  const js=ts.transpileModule(readFileSync(resolve(path),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const exports={};
  new Function('require','exports','process',js)(name=>{
    if(!(name in imports))throw Error('Unapproved import '+name);
    return imports[name];
  },exports,process);
  return exports;
}
const hold=load('lib/knowledge-discovery/discovery-publication-hold.ts');
const preflight=load('lib/knowledge-discovery/discovery-approval-preflight.ts',{
  'server-only':{},
  '@/lib/knowledge-discovery/discovery-publication-hold':hold,
});
const ORG='10000000-0000-4000-8000-000000000001';
const DOC='50000000-0000-4000-8000-000000000001';
let metadata={},readError=null,found=true,management=true,calls=[],refreshed=[];
const client={
  auth:{getUser:async()=>({data:{user:{id:'20000000-0000-4000-8000-000000000001'}},error:null})},
  from(table){
    calls.push({kind:'from',table});
    assert.equal(table,'knowledge_documents');
    return {
      select(columns){
        assert.equal(columns,'metadata');
        const filters={};
        const builder={
          eq(key,value){filters[key]=value;return builder;},
          async maybeSingle(){
            assert.deepEqual(filters,{organization_id:ORG,id:DOC});
            return {data:found?{metadata}:null,error:readError};
          },
        };
        return builder;
      },
    };
  },
  async rpc(name,args){
    calls.push({kind:'rpc',name,args});
    if(name==='can_manage_organization')return {data:management,error:null};
    if(name==='approve_knowledge_document_v1')return {
      data:{ok:true,status:'approved',document_id:DOC},error:null,
    };
    throw Error('Unexpected RPC '+name);
  },
};
const actions=load('app/settings/knowledge/actions.ts',{
  'next/cache':{revalidatePath:path=>refreshed.push(path)},
  'next/navigation':{redirect:url=>{throw Error('redirect:'+url);}},
  '@/lib/config':{useMockData:false},
  '@/lib/supabase/server':{createClient:async()=>client},
  '@/lib/workspace':{requireCurrentOrganizationId:async()=>ORG},
  '@/lib/knowledge-evidence':{inspectKnowledgeMatches:()=>{throw Error('No retrieval in approval test');}},
  '@/lib/knowledge-discovery/discovery-approval-preflight':preflight,
});
function reset(nextMetadata={}){
  metadata=nextMetadata;readError=null;found=true;management=true;
  calls=[];refreshed=[];
}
function form(){const data=new FormData();data.set('document_id',DOC);return data;}
async function redirected(query){
  await assert.rejects(actions.approveKnowledgeDocumentAction(form()),
    error=>error instanceof Error && error.message.startsWith('redirect:'+query),
  );
}
function approvedRPCs(){return calls.filter(x=>x.name==='approve_knowledge_document_v1');}

test('KB-14A status helper holds unverified discovery provenance without blocking normal manual knowledge',()=>{
  for(const value of [
    {entry_mode:'discovery_manual_review'},
    {manual_review_required:true},
    {source_text_verified:false},
    {entry_mode:'discovery_manual_review',source_text_verified:true},
  ])assert.equal(hold.discoveryPublicationHeld(value),true);
  for(const value of [
    null,undefined,42,'not-an-object',[],{}, {entry_mode:'knowledge_workspace_v2'},
    {source_text_verified:true},{manual_review_required:false},
  ])assert.equal(hold.discoveryPublicationHeld(value),false);
});

test('KB-14A server action rejects discovered-page draft before calling legacy approval RPC',async()=>{
  for(const value of [
    {entry_mode:'discovery_manual_review',source_text_verified:false},
    {manual_review_required:true},
    {source_text_verified:false},
  ]){
    reset(value);
    await redirected('/settings/knowledge?error=');
    assert.deepEqual(approvedRPCs(),[],'No generic approve attempt for unverified material');
    assert.deepEqual(refreshed,[]);
  }
});

test('KB-14A missing or inaccessible document is fail closed',async()=>{
  reset();found=false;
  await redirected('/settings/knowledge?error=');
  assert.deepEqual(approvedRPCs(),[]);
  reset();readError={code:'42501'};
  await redirected('/settings/knowledge?error=');
  assert.deepEqual(approvedRPCs(),[]);
  reset();management=false;
  await redirected('/settings/knowledge?error=');
  assert.deepEqual(approvedRPCs(),[]);
});

test('KB-14A existing manually entered Knowledge approval path remains intact',async()=>{
  reset({entry_mode:'knowledge_workspace_v2'});
  await redirected('/settings/knowledge?notice=');
  assert.equal(approvedRPCs().length,1);
  assert.deepEqual(approvedRPCs()[0].args,{p_organization_id:ORG,p_document_id:DOC});
  assert.deepEqual(refreshed,['/settings/knowledge','/conversations']);
});

test('KB-14A UI displays held discovery drafts without an approval action',()=>{
  const ui=readFileSync(resolve('app/settings/knowledge/page.tsx'),'utf8');
  assert.match(ui,/discoveryPublicationHeld\(document\.metadata\)/);
  assert.match(ui,/document\.status !== 'approved' && !publicationHeld/);
  assert.match(ui,/Discovery draft held: independent evidence review required/);
  assert.match(ui,/archiveKnowledgeDocumentAction/);
  const action=readFileSync(resolve('app/settings/knowledge/actions.ts'),'utf8');
  const preflightText=readFileSync(resolve('lib/knowledge-discovery/discovery-approval-preflight.ts'),'utf8');
  assert.match(preflightText,/\.from\('knowledge_documents'\)/);
  assert.match(preflightText,/discoveryPublicationHeld\(data\.metadata\)/);
  assert.match(action,/discoveryApprovalPreflight\(supabase, organizationId, documentId\)/);
  assert.doesNotMatch(action,/\.from\('knowledge_documents'\)/);
  assert.match(action,/approve_knowledge_document_v1/);
});

test('KB-14A publication guard is disposable SQL, never installable migration',()=>{
  const sql=readFileSync(resolve('docs/sql/KB-14A-unverified-discovery-approval-guard-REHEARSAL-DRAFT.sql'),'utf8');
  assert.match(sql,/KB14A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
  assert.match(sql,/kb14a_hold_unverified_discovery_document/);
  assert.match(sql,/kb14a_hold_unverified_discovery_source/);
  assert.match(sql,/source_text_verified/);
  assert.match(sql,/new\.status not in \('draft','archived'\)/);
  for(const path of readdirSync(resolve('supabase/migrations')).filter(f=>f.endsWith('.sql'))){
    const migration=readFileSync(resolve('supabase/migrations',path),'utf8');
    assert.doesNotMatch(migration,/kb14a_hold_discovery_document_publish_v1/i,path);
  }
});
