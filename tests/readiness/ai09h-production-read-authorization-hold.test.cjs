const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=p=>fs.readFileSync(path.resolve(p),'utf8');
const sourcePath='docs/contracts/AI-09H-production-read-authorization-release-hold-v1.json';
const manifest=JSON.parse(read(sourcePath));
const expected=[
  'AUTH-01','DB-02','RBAC-03','COURSE-04','KNOWLEDGE-05',
  'AUDIT-06','PRIVACY-07','PROVIDER-08','RELEASE-09',
];
const status='pending_independent_review';

function isHold(value){
  return value && value.schemaVersion===1 &&
    value.checkpoint==='AI-09H' &&
    value.classification==='review_only_not_an_authorization_token' &&
    value.productionReady===false &&
    value.runtimeWired===false &&
    value.mayExecute===false &&
    value.releaseState==='BLOCKED' &&
    value.stagingState==='ON_HOLD_BY_OWNER' &&
    value.signedUserWitnesses===0 &&
    value.requiredSignedUserWitnesses===16 &&
    value.independentReviews===0 &&
    Array.isArray(value.blockedIssues) &&
    JSON.stringify(value.blockedIssues)==='[601,612,613,614]' &&
    Array.isArray(value.decisions) &&
    value.decisions.length===9 &&
    value.decisions.every((gate,i)=>gate.id===expected[i] &&
      gate.state===status && gate.owner && gate.requiredEvidence);
}

test('AI-09H cannot be interpreted as a release approval',()=>{
  assert.equal(isHold(manifest),true);
  for(const patch of [
    {productionReady:true},{runtimeWired:true},{mayExecute:true},
    {releaseState:'APPROVED'}, {stagingState:'ACTIVE'},
    {signedUserWitnesses:16},{independentReviews:1},
    {blockedIssues:[]},{requiredSignedUserWitnesses:0},
    {classification:'authorization_token'},
  ])assert.equal(isHold({...manifest,...patch}),false,JSON.stringify(patch));
});

test('all nine independent owner decisions must remain unresolved, with named evidence',()=>{
  assert.deepEqual(manifest.decisions.map(g=>g.id),expected);
  const ids=new Set(),needed=new Set();
  for(const g of manifest.decisions){
    assert.equal(g.state,status);
    assert.equal(typeof g.owner,'string');
    assert.ok(g.owner.length>3);
    assert.ok(g.requiredEvidence.length>=75,g.id);
    assert.ok(!ids.has(g.id),g.id);ids.add(g.id);
    assert.ok(Array.isArray(g.codeEvidence)&&g.codeEvidence.length>0,g.id);
    assert.ok(Array.isArray(g.mustDeny)&&g.mustDeny.length>0,g.id);
    for(const p of g.codeEvidence){
      assert.ok(!p.startsWith('/')&&!p.includes('..'),p);
      assert.ok(fs.statSync(path.resolve(p)).isFile(),p);
    }
    for(const s of g.mustDeny){
      assert.match(s,/^[a-z][a-z0-9_]+$/);
      assert.ok(!needed.has(s),s);
      needed.add(s);
    }
  }
  for(const category of [
    'auth','database_security','resource_authorization','source_provenance',
    'audit','privacy','output_security','release',
  ])assert.ok(manifest.decisions.some(g=>g.category===category));
});

test('forged review-state edits do not qualify as a safe hold',()=>{
  for(const i of [0,1,4,5,6,8]){
    const cloned=structuredClone(manifest);
    cloned.decisions[i].state='approved';
    assert.equal(isHold(cloned),false,expected[i]);
  }
  const missing=structuredClone(manifest);missing.decisions.pop();
  assert.equal(isHold(missing),false);
  const reordered=structuredClone(manifest);reordered.decisions.reverse();
  assert.equal(isHold(reordered),false);
});

test('allowed tools exactly match source-only registered read operations',()=>{
  assert.deepEqual(manifest.allowedReadToolIds,[
    'crm.course.list','crm.lead.read','knowledge.approved.search',
  ]);
  const gate=read('lib/ai/read-only-tool-gate-v1.ts');
  for(const id of manifest.allowedReadToolIds)assert.ok(gate.includes("'"+id+"'"),id);
  assert.doesNotMatch(JSON.stringify(manifest.allowedReadToolIds),/update|send|write|exec|payment/);
});

test('proposed Auth RPC remains deliberately uninstalled',()=>{
  const boundary=read('lib/ai/read-only-auth-boundary-v1.ts');
  assert.match(boundary,/READ_ONLY_AUTH_BOUNDARY_RUNTIME_WIRED\s*=\s*false\s+as const/);
  assert.match(boundary,/REQUIRED_BOUND_SESSION_RPC\s*=\s*'ai_read_current_bound_session_v1'/);
  assert.match(boundary,/session\.auth\.getUser\(\)/);
  assert.doesNotMatch(boundary,/createAdminClient|requireCurrentOrganizationId\(/);
  const migrations=fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql'));
  for(const m of migrations){
    const content=read('supabase/migrations/'+m);
    assert.doesNotMatch(content,/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:(?:public|ai09g_rehearsal)\.)?(?:ai_read_current_bound_session_v1|read_real_shape_fixture_v1)\s*\(/i,m);
  }
});

test('all draft AI tool components must remain source-only, regardless of environment flags',()=>{
  const paths={
    'lib/ai/read-only-tool-gate-v1.ts':'READ_ONLY_TOOL_GATE_RUNTIME_WIRED',
    'lib/ai/read-only-auth-boundary-v1.ts':'READ_ONLY_AUTH_BOUNDARY_RUNTIME_WIRED',
    'lib/ai/real-schema-read-projection-draft-v1.ts':'REAL_SCHEMA_READ_ADAPTER_RUNTIME_WIRED',
    'lib/ai/read-only-tool-result-projection-v1.ts':'READ_ONLY_TOOL_RESULT_RUNTIME_WIRED',
  };
  for(const [p,constant] of Object.entries(paths)){
    const s=read(p);
    assert.ok(s.includes('server-only'),p);
    assert.match(s,new RegExp(constant+'\\s*=\\s*false\\s+as const'),p);
    for(const action of ['app/conversations/copilot-actions.ts','app/settings/knowledge/actions.ts']){
      assert.equal(read(action).includes(path.basename(p,'.ts')),false,p+' -> '+action);
    }
  }
});

test('canonical Knowledge search is still not sufficient provenance',()=>{
  const search=read('supabase/migrations/20261016182500_fix_organization_knowledge_search_v1.sql');
  const source=read('supabase/migrations/20261016171500_organization_knowledge_v1.sql');
  assert.match(source,/create table if not exists public\.knowledge_sources/);
  assert.match(source,/metadata jsonb not null default '\{\}'::jsonb/);
  assert.match(search,/create or replace function public\.search_organization_knowledge_v1/);
  assert.doesNotMatch(search,/'source_metadata',\s*ks\.metadata/);
  assert.match(read('lib/ai/real-schema-read-projection-draft-v1.ts'),/knowledge_policy_unresolved/);
  assert.match(read('docs/sql/AI-09G-real-shape-read-REHEARSAL-DRAFT.sql'),/ai09g_knowledge_policy_unresolved/);
  assert.ok(manifest.decisions.find(g=>g.id==='KNOWLEDGE-05').mustDeny.includes('withdrawn_source_consent'));
});

test('legacy tenant fallback and service-role shortcuts cannot be used as AI review proof',()=>{
  const legacy=read('supabase/migrations/20261014061001_session_bound_tenant_authorization.sql');
  assert.match(legacy,/sole_membership/);
  assert.match(legacy,/auth\.role\(\)\s*=\s*'service_role'/);
  const gate=manifest.decisions.find(g=>g.id==='AUTH-01');
  const dba=manifest.decisions.find(g=>g.id==='DB-02');
  assert.ok(gate.mustDeny.includes('sole_membership_fallback'));
  assert.ok(dba.mustDeny.includes('role_bypass'));
  const boundary=read('lib/ai/read-only-auth-boundary-v1.ts');
  assert.doesNotMatch(boundary,/\bcurrent_tenant_organization_id\s*\(/);
  assert.doesNotMatch(boundary,/\bgetCurrentWorkspaceContext\s*\(/);
});

test('course and lead sources preserve real schema and capability boundaries',()=>{
  const initial=read('supabase/migrations/001_initial_crm.sql');
  const tenant=read('supabase/migrations/007_tenant_schema_foundation.sql');
  const capability=read('supabase/migrations/20261101173500_r11_capability_security_foundation_v1.sql');
  assert.match(initial,/create table if not exists public\.courses/);
  assert.match(initial,/create table if not exists public\.course_batches/);
  assert.match(initial,/current_stage public\.lead_stage/);
  assert.match(tenant,/alter table public\.leads\s+add column if not exists organization_id uuid/);
  assert.match(tenant,/alter table public\.courses\s+add column if not exists organization_id uuid/);
  assert.match(capability,/organization_has_capability\(organization_id, 'education_core'\)/);
  const course=manifest.decisions.find(g=>g.id==='COURSE-04');
  const lead=manifest.decisions.find(g=>g.id==='RBAC-03');
  assert.ok(course.mustDeny.includes('disabled_education_core'));
  assert.ok(lead.mustDeny.includes('foreign_lead_id'));
});

test('commit-observed audit and its failure paths remain distinct review gates',()=>{
  const audit=manifest.decisions.find(g=>g.id==='AUDIT-06');
  for(const scenario of ['audit_insert_failed','audit_commit_unknown','audit_commit_failed','stream_before_commit','replayed_request']){
    assert.ok(audit.mustDeny.includes(scenario));
  }
  const fixture=read('docs/sql/AI-09G-real-shape-read-REHEARSAL-DRAFT.sql');
  assert.match(fixture,/insert into ai09g_rehearsal\.read_audit/);
  assert.match(fixture,/may_execute',false/);
  assert.match(fixture,/NOT A MIGRATION/);
  assert.doesNotMatch(fixture,/create\s+function\s+public\./i);
});

test('no release sequence step is marked complete or authorized',()=>{
  assert.equal(manifest.reviewSequence.length,6);
  assert.deepEqual(manifest.reviewSequence.map(x=>x.order),[1,2,3,4,5,6]);
  assert.equal(manifest.reviewSequence.every(x=>x.state==='blocked'),true);
  assert.equal(manifest.reviewSequence[4].phase,'16_real_signed_user_staging_witnesses');
  assert.equal(manifest.nonActions.length,7);
  for(const v of ['No hosted Supabase SQL','No production main merge','No MCP exposure','No autonomous Knowledge retrieval']){
    assert.ok(manifest.nonActions.includes(v));
  }
});

test('machine-readable contract is review data, not SQL or a release execution endpoint',()=>{
  const manifestText=read(sourcePath);
  assert.doesNotMatch(manifestText,/PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY|BEGIN RSA|BEGIN OPENSSH/);
  assert.doesNotMatch(manifestText,/https:\/\/[^\s"]+\/rest\/v1|https:\/\/[^\s"]+\/functions\/v1/);
  assert.equal(Object.hasOwn(manifest,'sql'),false);
  assert.equal(Object.hasOwn(manifest,'providerKey'),false);
  assert.equal(Object.hasOwn(manifest,'approve'),false);
});
