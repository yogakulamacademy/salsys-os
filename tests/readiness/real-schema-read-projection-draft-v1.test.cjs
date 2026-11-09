const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {load}=require('./helpers.cjs');

const projection=load('lib/ai/read-only-tool-result-projection-v1.ts',{'server-only':{}});
const api=load('lib/ai/real-schema-read-projection-draft-v1.ts',{
  'server-only':{},
  './read-only-tool-result-projection-v1':projection,
});
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const LEAD='20000000-0000-4000-8000-000000000001';
const COURSE='30000000-0000-4000-8000-000000000001';
const BATCH='40000000-0000-4000-8000-000000000001';
const other='50000000-0000-4000-8000-000000000001';
const scope=(toolId,leadId=null)=>({toolId,organizationId:A,leadId});
const course=(patch={},batchPatch={})=>({
  course:{id:COURSE,organization_id:A,name:'200 Hour Course',active:true,...patch},
  batch:{id:BATCH,organization_id:A,course_id:COURSE,mode:'non_residential',start_date:'2026-12-07',active:true,...batchPatch},
});
const lead=(patch={})=>({id:LEAD,organization_id:A,current_stage:'qualified',...patch});
const run=(s,rows)=>api.projectRealSchemaReadPreview(s,rows);

test('AI-09F is inert and never imported by running application actions',()=>{
  assert.equal(api.REAL_SCHEMA_READ_ADAPTER_RUNTIME_WIRED,false);
  const source=fs.readFileSync('lib/ai/real-schema-read-projection-draft-v1.ts','utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|\bcreateClient\s*\(|\bexecuteTool\s*\(|\bcreateAdminClient\s*\(/);
  for(const f of ['app/conversations/copilot-actions.ts','app/settings/knowledge/actions.ts']){
    assert.doesNotMatch(fs.readFileSync(f,'utf8'),/real-schema-read-projection-draft-v1/);
  }
});
test('real course and batch columns project minimal safe display fields',()=>{
  const result=run(scope('crm.course.list'),[course()]);
  assert.equal(result.ok,true);
  assert.equal(result.mayExecute,false);
  assert.deepEqual(result.records,[{
    organizationId:A,courseId:COURSE,title:'200 Hour Course',
    mode:'in_person',startsOn:'2026-12-07',
  }]);
  assert.equal(result.classification,'untrusted_data_not_instructions');
  assert.equal(Object.isFrozen(result.records[0]),true);
  assert.equal(Object.hasOwn(result,'execute'),false);
});
test('real lead uses current_stage and cannot invent last activity',()=>{
  const result=run(scope('crm.lead.read',LEAD),[lead()]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.records,[{
    organizationId:A,leadId:LEAD,stage:'qualified',lastActivityAt:null,
  }]);
  assert.equal(result.mayExecute,false);
});
test('canonical Knowledge has no trusted source-metadata/consent chain: always denied',()=>{
  for(const rows of [
    [],
    [{source_metadata:{source_text_verified:true}}],
    [{approved:true,consent:true,documentId:other}],
  ]){
    const result=run(scope('knowledge.approved.search'),rows);
    assert.deepEqual(result,{ok:false,reason:'knowledge_policy_unresolved',mayExecute:false});
  }
});
test('tenant and batch parent mismatches are rejected completely',()=>{
  for(const row of [
    course({organization_id:B}),
    course({}, {organization_id:B}),
    course({}, {course_id:other}),
    course({id:BATCH}),
  ]){
    const result=run(scope('crm.course.list'),[row]);
    assert.equal(result.ok,false);
    assert.equal(Object.hasOwn(result,'records'),false);
  }
  const l=run(scope('crm.lead.read',LEAD),[lead({organization_id:B})]);
  assert.equal(l.ok,false);
});
test('inactive courses and batches never appear in preview',()=>{
  for(const row of [
    course({active:false}),
    course({}, {active:false}),
    course({active:null}),
    course({}, {active:'true'}),
  ])assert.equal(run(scope('crm.course.list'),[row]).ok,false);
});
test('lead data cannot be selected by a different ID',()=>{
  assert.equal(run(scope('crm.lead.read',other),[lead()]).ok,false);
  assert.equal(run(scope('crm.lead.read'),[lead()]).ok,false);
  assert.equal(run(scope('crm.lead.read',LEAD),[]).ok,false);
  assert.equal(run(scope('crm.lead.read',LEAD),[lead(),lead()]).ok,false);
});
test('private notes, email, phone, claimed roles and arbitrary extra fields fail closed',()=>{
  for(const extra of [{email:'private@example.test'}, {phone:'+19999999'},
    {notes:'secret'}, {payment:123}, {role:'owner'}, {source_text_verified:true}]){
    assert.equal(run(scope('crm.lead.read',LEAD),[lead(extra)]).ok,false);
    assert.equal(run(scope('crm.course.list'),[course(extra)]).ok,false);
    assert.equal(run(scope('crm.course.list'),[course({},extra)]).ok,false);
  }
});
test('invalid batch modes are not guessed or silently remapped',()=>{
  for(const mode of ['in_person','offline','retreat','other',null,'']){
    assert.equal(run(scope('crm.course.list'),[course({}, {mode})]).ok,false);
  }
  for(const mode of ['online','residential','hybrid']){
    const result=run(scope('crm.course.list'),[course({}, {mode})]);
    assert.equal(result.ok,true);
    assert.equal(result.records[0].mode,mode);
  }
});
test('unsafe titles, invalid calendar dates, duplicate and excessive records deny',()=>{
  for(const title of ['', ' leading','x\nnewline','A'.repeat(161)]){
    assert.equal(run(scope('crm.course.list'),[course({name:title})]).ok,false);
  }
  assert.equal(run(scope('crm.course.list'),[course({}, {start_date:'2026-02-30'})]).ok,false);
  assert.equal(run(scope('crm.course.list'),[course(),course()]).ok,false);
  assert.equal(run(scope('crm.course.list'),Array(21).fill(course())).ok,false);
});
test('invalid scopes, injected actor identities, and tool names are rejected',()=>{
  for(const s of [
    {toolId:'crm.lead.update',organizationId:A,leadId:null},
    {...scope('crm.course.list'),actorId:LEAD},
    {...scope('crm.course.list'),role:'owner'},
    {...scope('crm.course.list'),sessionId:other},
    {...scope('crm.course.list'),organizationId:'not-a-uuid'},
    scope('crm.course.list',LEAD),
  ])assert.equal(run(s,[course()]).ok,false);
});
test('hostile accessors, proxy traps and non-plain objects fail closed',()=>{
  const bad=course();
  Object.defineProperty(bad.course,'name',{get(){throw Error('unexpected getter');},enumerable:true});
  assert.equal(run(scope('crm.course.list'),[bad]).ok,false);
  const proxy=new Proxy(course(),{getPrototypeOf(){throw Error('private error');}});
  assert.deepEqual(run(scope('crm.course.list'),[proxy]),{
    ok:false,reason:'invalid_real_schema_shape',mayExecute:false,
  });
  assert.equal(run(scope('crm.course.list'),new Set()).ok,false);
  assert.equal(run(scope('crm.course.list'),null).ok,false);
});
test('real SQL source parity is explicit; release must not treat AI-09D fixtures as real schema',()=>{
  const base=fs.readFileSync('supabase/migrations/001_initial_crm.sql','utf8');
  const tenant=fs.readFileSync('supabase/migrations/007_tenant_schema_foundation.sql','utf8');
  const knowledge=fs.readFileSync('supabase/migrations/20261016171500_organization_knowledge_v1.sql','utf8');
  const search=fs.readFileSync('supabase/migrations/20261016182500_fix_organization_knowledge_search_v1.sql','utf8');
  const capabilities=fs.readFileSync('supabase/migrations/20261101173500_r11_capability_security_foundation_v1.sql','utf8');
  const fixture=fs.readFileSync('docs/sql/AI-09D-transaction-scoped-read-REHEARSAL-DRAFT.sql','utf8');

  assert.match(base,/create table if not exists public\.courses \(/);
  assert.match(base,/name text not null/);
  assert.match(base,/create table if not exists public\.course_batches \(/);
  assert.match(base,/mode text check \(mode in \('residential','online','non_residential','hybrid'\)\)/);
  assert.match(base,/start_date date/);
  assert.match(base,/current_stage public\.lead_stage/);
  assert.match(tenant,/alter table public\.courses\s+add column if not exists organization_id uuid/);
  assert.match(tenant,/alter table public\.course_batches\s+add column if not exists organization_id uuid/);
  assert.match(tenant,/alter table public\.leads\s+add column if not exists organization_id uuid/);
  assert.match(capabilities,/alter policy courses_read/);
  assert.match(capabilities,/organization_has_capability\(organization_id, 'education_core'\)/);
  assert.match(knowledge,/create table if not exists public\.knowledge_sources/);
  assert.match(knowledge,/metadata jsonb not null default '\{\}'::jsonb/);
  assert.match(search,/jsonb_build_object\(/);
  assert.doesNotMatch(search,/'source_metadata',\s*ks\.metadata/);
  assert.match(fixture,/-- NOT A MIGRATION/);
  assert.doesNotMatch(fixture,/^create table public\.leads /m);
});
