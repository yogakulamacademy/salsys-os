import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const origin = new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,origin),'utf8');
const manual=read('.github/workflows/kb-isolated-staging-session-binding.yml');
const readonly=read('.github/workflows/kb-isolated-staging-readonly.yml');
const runner=read('scripts/verify-kb-isolated-staging-readonly.mjs');
const bindingSql=read('supabase/migrations/20261014060357_tenant_session_binding_foundation.sql');
const strictSql=read('docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql');

test('KB-06H distinct staging session-binding workflow is manual-only and protected by separate GitHub environment',()=>{
  assert.match(manual,/^on:\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(manual,/^\s*(push|pull_request|schedule|repository_dispatch|workflow_run):/m);
  assert.match(manual,/environment:\s+kb-isolated-staging-session-binding-acceptance/);
  assert.match(manual,/timeout-minutes:\s+10/);
  assert.match(manual,/permissions:\s*\n\s*contents:\s*read/);
  assert.match(manual,/SALSYS_KB_STAGING_BINDING_APPROVAL_PHRASE:\s*\$\{\{ inputs\.approval_phrase \}\}/);
  assert.match(manual,/SALSYS_KB_STAGING_BINDING_WRITES_READY:\s*\$\{\{ vars\.SALSYS_KB_STAGING_BINDING_WRITES_READY \}\}/);
  assert.match(manual,/node scripts\/verify-kb-staging-workflow-attestation\.mjs --check/);
  assert.match(manual,/node scripts\/verify-kb-isolated-staging-readonly\.mjs --run-bound-consent-actor/);
  assert.match(manual,/git rev-parse HEAD/);
  assert.doesNotMatch(manual,/\$\{\{ secrets\.[A-Z_]*SERVICE_ROLE/i);
});

test('KB-06H keeps environment claims at runner steps and Auth secrets out of setup/tests',()=>{
  const beforeSteps=manual.split(/^    steps:$/m)[0];
  assert.doesNotMatch(beforeSteps,/\$\{\{\s*(?:vars|secrets)\./,
    'job-level env must not eagerly bind staging claims or credentials');
  const marker='      - name: Bind two new isolated-staging Auth sessions and verify consent authority';
  const i=manual.indexOf(marker);
  assert.ok(i>0,'the authenticated test step must be present');
  const beforeLogin=manual.slice(0,i);
  const login=manual.slice(i);
  assert.doesNotMatch(beforeLogin,/\$\{\{\s*secrets\./,
    'checkout, setup, preflight and offline tests must never receive Auth secrets');
  const secrets=['SALSYS_KB_STAGING_ANON_KEY',
    'SALSYS_KB_STAGING_A_EMAIL','SALSYS_KB_STAGING_A_PASSWORD',
    'SALSYS_KB_STAGING_B_EMAIL','SALSYS_KB_STAGING_B_PASSWORD'];
  for(const key of secrets){
    assert.ok(login.includes('          '+key+': ${{ secrets.'+key+' }}'),key);
    assert.ok(!beforeLogin.includes(key+':'),key+' was exposed before login');
  }
  const stepNames=[
    'Fail closed unless human confirmation matches configured staging',
    'Verify reviewed commit, branch and project BEFORE login',
    'Bind two new isolated-staging Auth sessions and verify consent authority',
  ];
  for(const name of stepNames){
    const start=manual.indexOf('      - name: '+name);
    assert.ok(start>=0,'missing step: '+name);
    const singleStep=manual.slice(start).split(/\n      - name:/)[0];
    assert.match(singleStep,/^        env:$/m,name+' needs runner-step configuration');
  }
  assert.ok(login.includes('SALSYS_KB_STAGING_BINDING_WRITES_READY: ${{ vars.SALSYS_KB_STAGING_BINDING_WRITES_READY }}'));
  assert.ok(login.includes('SALSYS_KB_STAGING_PROJECT_REF: ${{ vars.SALSYS_KB_STAGING_PROJECT_REF }}'));
  // Runner variable consistency never proves real environment reviewer protection.
});

test('KB-06H legacy read-only workflow cannot invoke session binding mode',()=>{
  assert.match(readonly,/^on:\n\s+workflow_dispatch:/m);
  assert.match(readonly,/environment:\s+kb-isolated-staging-acceptance/);
  assert.doesNotMatch(readonly,/--run-bound-consent-actor/);
  assert.doesNotMatch(readonly,/SALSYS_KB_STAGING_BINDING_WRITES_READY/);
  assert.match(readonly,/--run-readonly-consent-actor/);
  assert.match(readonly,/--run-readonly\s*$/m);
});

test('KB-06H caller-bound session-binding RPC enforces active organization and membership',()=>{
  assert.match(bindingSql,/create or replace function public\.bind_current_tenant_session\(/);
  assert.match(bindingSql,/v_session_id\s*:=\s*nullif\(auth\.jwt\(\)\s*->>\s*'session_id'/);
  assert.match(bindingSql,/o\.status\s*=\s*'active'/);
  assert.match(bindingSql,/om\.user_id\s*=\s*v_user_id/);
  assert.match(bindingSql,/om\.active\s*=\s*true/);
  assert.match(bindingSql,/v_existing_organization_id\s*<>\s*p_organization_id/);
  assert.match(bindingSql,/on conflict\s*\(session_id\)/i);
  assert.match(bindingSql,/grant execute on function public\.bind_current_tenant_session\(uuid\)/);
  assert.match(strictSql,/join auth\.sessions s on s\.id=b\.session_id and s\.user_id=b\.user_id/);
  assert.match(strictSql,/m\.role in \('owner','admin'\)/);
});

test('KB-06H runner does not introduce consent mutations, external domains or service-role requests',()=>{
  assert.match(runner,/export const SESSION_BINDING_APPROVAL_PHRASE/);
  assert.match(runner,/bindTestSessions\s*&&\s*\(!checkConsentActor/);
  assert.match(runner,/await deniedConsentActor\(config,tokenA,config\.a\.organizationId,'a_before_binding'\)/);
  assert.match(runner,/await deniedConsentActor\(config,tokenB,config\.b\.organizationId,'b_before_binding'\)/);
  assert.match(runner,/method:'POST',token,json:\{p_organization_id:actor\.organizationId\}/);
  assert.match(runner,/stagingSessionBindingWrites:bindTestSessions\?2:0/);
  assert.match(runner,/auth\/v1\/logout\?scope=local/);
  assert.doesNotMatch(runner, /\/rest\/v1\/rpc\/(?:grant_knowledge_discovery_consent|erase_knowledge_discovery_metadata|withdraw_knowledge_discovery_consent)/);
  assert.doesNotMatch(manual, /(?:curl|wget|supabase db push|apply_migration|service_role)/i);
});
