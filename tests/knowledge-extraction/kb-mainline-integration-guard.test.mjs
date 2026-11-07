import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auditKBMainlineIntegration, gitBlobSha, runtimePaths,
  PROTECTED_MAIN_BLOBS, REVIEWED_MAIN_SHA, REVIEWED_PARENT_HEAD,
} from '../../scripts/kb09a-verify-mainline-integration-guard.mjs';

function tamper(path,change,codePaths=runtimePaths()){
  const readFile=(requested)=>{
    const original=readFileSync(requested);
    return requested===path?Buffer.from(change(original.toString('utf8'))):original;
  };
  return auditKBMainlineIntegration({readFile,codePaths});
}

test('current KB-09A source tree passes offline baseline and rehearsal isolation audit',()=>{
  assert.deepEqual(auditKBMainlineIntegration(),[]);
  assert.match(REVIEWED_MAIN_SHA,/^[a-f0-9]{40}$/);
  assert.match(REVIEWED_PARENT_HEAD,/^[a-f0-9]{40}$/);
  assert.equal(Object.keys(PROTECTED_MAIN_BLOBS).length,7);
});

test('known working Co-Pilot and manual approval contracts match reviewed Git blob IDs',()=>{
  for(const [path,expected] of Object.entries(PROTECTED_MAIN_BLOBS)){
    assert.equal(gitBlobSha(readFileSync(path)),expected,path);
  }
});

test('editing existing manual approval or Co-Pilot code fails the KB-only integration contract',()=>{
  for(const path of [
    'app/settings/knowledge/actions.ts',
    'app/conversations/copilot-actions.ts',
    'supabase/migrations/20261016173500_organization_knowledge_search_v1.sql',
    'lib/supabase/admin.ts',
  ]){
    assert.ok(tamper(path,s=>s+'\n// hypothetical unreviewed change\n').includes(
      'protected_main_contract_changed:'+path),path);
  }
});

test('an ungated worker or a broader discovery host allowlist blocks review',()=>{
  const worker='app/api/knowledge/discovery/worker/route.ts';
  assert.ok(tamper(worker,s=>s.replace('bearerMatchesAnySecret(','removedBearerGate('))
    .includes('worker_pilot_auth_or_consent_boundary_changed'));
  assert.ok(tamper(worker,s=>s.replace(
    'process.env.KNOWLEDGE_DISCOVERY_RUNNER_SECRET?.trim()',
    'process.env.CRON_SECRET?.trim()',
  )).includes('worker_pilot_auth_or_consent_boundary_changed'),
  'A shared cross-service cron credential must never replace the dedicated worker token');
  const gate='lib/knowledge-discovery/pilot-gate.ts';
  assert.ok(tamper(gate,s=>s.replace('allowed.includes(host)','allowed.some(value => host.endsWith(value))'))
    .includes('pilot_default_off_or_exact_host_gate_changed'));
});

test('reintroducing GET job claims or skipping the claimed-lease check blocks review',()=>{
  const path='app/api/knowledge/discovery/worker/route.ts';
  assert.ok(tamper(path,s=>s.replace(
    'export function GET()',
    'export const GET = POST;\nfunction unusedGet()',
  )).includes('worker_get_mutation_boundary_changed'));
  assert.ok(tamper(path,s=>s.replace(
    'validDiscoveryClaim(claim)', 'Boolean(claim)',
  )).includes('worker_claim_validation_boundary_changed'));
});

test('removing a disposable DB guard or copying a fixture into app runtime blocks review',()=>{
  const file='docs/sql/KB-08G-source-verification-alert-gate-REHEARSAL-DRAFT.sql';
  assert.ok(tamper(file,s=>s.replace('KB08G_DISPOSABLE_PARENT_FIXTURE_REQUIRED',
    'unsafe_to_execute')).includes('rehearsal_db_guard_missing:'+file));
  const paths=['app/unsafe-example.ts'];
  const readFile=(path)=>path===paths[0]
    ? Buffer.from("export const x='kb08g_fixture.source_monitors';")
    : readFileSync(path);
  assert.ok(auditKBMainlineIntegration({readFile,codePaths:paths})
    .includes('disposable_fixture_referenced_by_runtime:'+paths[0]));
});

test('new automated triggers or removed protected environment block staging workflow registration',()=>{
  const path='.github/workflows/kb-isolated-staging-session-binding.yml';
  assert.ok(tamper(path,s=>s.replace(
    '  workflow_dispatch:',
    '  push:\n    branches: [main]\n  workflow_dispatch:',
  )).includes('staging_workflow_dispatch_or_env_changed:'+path));
  const readonly='.github/workflows/kb-isolated-staging-readonly.yml';
  assert.ok(tamper(readonly,s=>s.replace(
    'environment: kb-isolated-staging-acceptance',
    'environment: production',
  )).includes('staging_workflow_dispatch_or_env_changed:'+readonly));
});

test('offline KB09A guard imports only local read-only Node utilities',()=>{
  const code=readFileSync('scripts/kb09a-verify-mainline-integration-guard.mjs','utf8');
  const imports=[...code.matchAll(/^import .*? from '([^']+)'/gm)].map(x=>x[1]).sort();
  assert.deepEqual(imports,['node:crypto','node:fs','node:path','node:url'].sort());
  // The guard must quote its source-code contract snippets; string matching
  // "createAdminClient()" itself would falsely flag a non-executing literal.
  assert.ok(!/^\s*(?:await\s+)?(?:fetch|createAdminClient|createClient)\(/m.test(code));
  assert.ok(!/from ['"](?:node:child_process|child_process|@supabase\/)/m.test(code));
});
