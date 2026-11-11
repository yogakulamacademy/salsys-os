import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath='docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json';
const manifest=JSON.parse(readFileSync(resolve(manifestPath),'utf8'));
const read=path=>readFileSync(resolve(path),'utf8');
const expectedFoundation=[
  'KB-01B-discovery-schema-DRAFT.sql',
  'KB-06A-discovery-consent-execution-DRAFT.sql',
  'KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql',
  'KB-06C-revoked-discovery-metadata-erasure-DRAFT.sql',
  'KB-06E-reviewed-policy-document-preview-DRAFT.sql',
  'KB-07D-consent-erasure-audit-truncate-guard-DRAFT.sql',
];
const expectedRehearsal=[
  'KB-09F','KB-09G','KB-09H','KB-09I',
  'KB-09J','KB-09K','KB-09L','KB-09M','KB-09N',
];

test('KB-09M manifest is exact, ordered, versioned DRAFT, no migration or grant',()=>{
  assert.equal(manifest.status,'blocked_unapproved_no_migration');
  assert.equal(manifest.parentDraftPr,650);
  assert.deepEqual(manifest.foundationSqlReviewOrder.map(x=>x.split('/').at(-1)),expectedFoundation);
  assert.deepEqual(manifest.disposableRehearsalSqlOrder.map(x=>x.split('/').at(-1).slice(0,6)),expectedRehearsal);
  for(const path of manifest.foundationSqlReviewOrder) {
    assert.equal(existsSync(resolve(path)),true,path);
    assert.ok(!path.includes('/migrations/'),'Foundation is a draft review source, not a migration');
  }
  for(const path of manifest.disposableRehearsalSqlOrder){
    assert.equal(existsSync(resolve(path)),true,path);
    const sql=read(path);
    assert.match(sql,/NOT A MIGRATION/i,path);
    assert.match(sql,/salsys_kb09f_/i,path);
    assert.ok(!path.includes('/migrations/'));
  }
  assert.equal(manifest.conditions.hostedSqlAllowed,false);
  assert.equal(manifest.conditions.deployAllowed,false);
  assert.equal(manifest.conditions.approvedMigrationExists,false);
  assert.equal(manifest.conditions.legalPolicyApproved,false);
  assert.equal(manifest.conditions.independentSecurityApproval,false);
  assert.equal(manifest.conditions.independentlyWitnessedStagingCases,0);
  assert.equal(manifest.conditions.mandatoryStagingCases,16);
  assert.equal(manifest.conditions.deploymentOrMergeAllowed,false);
  assert.equal(manifest.conditions.newPaidStagingUntilRevenueAndFreshApproval,false);
  assert.match(manifest.rollbackMode,/non_destructive_pause/);
  assert.deepEqual(manifest.neverRollbackBy,[
    'regrant_service_role_direct_DML',
    'drop_cascade_on_consents_or_audit',
    'delete_customer_records_or_unapproved_backups',
    'reuse_production_or_recovery_as_staging',
    'deploy_draft_only_SQL_rehearsal_to_hosted',
  ]);
});

test('KB-09M every registered runtime RPC has an exact call in the expected source',()=>{
  assert.equal(manifest.runtimeContracts.length,9);
  for(const entry of manifest.runtimeContracts){
    assert.ok(['authenticated','service_role'].includes(entry.role));
    const src=read(entry.path);
    assert.ok(src.includes("rpc('"+entry.name+"'") ||
      src.includes("rpc(\n      '"+entry.name+"'") ||
      src.includes("rpc(\n        '"+entry.name+"'") ||
      src.includes("rpc(\n      '"+entry.name+"',") ||
      src.includes("rpc(\n        '"+entry.name+"',"),
      entry.path+' must invoke '+entry.name);
  }
  const runner=read('lib/knowledge-discovery/runner.ts');
  assert.ok(runner.includes("rpc('commit_knowledge_discovery_page_with_proof_v1'"));
  assert.ok(!runner.includes("rpc('commit_knowledge_discovery_page_v1'"));
  const route=read('app/api/knowledge/discovery/route.ts');
  assert.ok(!route.includes("createAdminClient()"),
    'Tenant discovery route cannot silently use service-side direct DML');
  const verify=read('app/api/knowledge/discovery/verification/route.ts');
  assert.ok(verify.includes("p_proof_token: proof.body.trim()"));
  assert.ok(!verify.includes("confirm_checked_knowledge_discovery_proof_v1"));
});

test('KB-09M worker DB bridge grants only service_role and retains proof/consent checks',()=>{
  const sql=read('docs/sql/KB-09M-proof-checked-worker-commit-bridge-REHEARSAL-DRAFT.sql');
  const f=read('docs/sql/KB-09F-commit-side-ownership-guard-REHEARSAL-DRAFT.sql');
  assert.match(sql,/create function public\.commit_knowledge_discovery_page_with_proof_v1/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/grant execute on function public\.commit_knowledge_discovery_page_with_proof_v1/);
  assert.match(sql,/revoke execute on function public\.commit_knowledge_discovery_page_v1/);
  assert.match(sql,/kb09f_fixture\.commit_page_with_current_proof_v1/);
  assert.match(f,/for share/);
  assert.match(f,/ownership_proof_not_current/);
  assert.match(f,/select public\.commit_knowledge_discovery_page_v1/);
  const consent=read('docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql');
  assert.match(consent,/consent_not_active/);
  assert.match(consent,/for share/);
  const expectedLegacy=[
    'commit_knowledge_discovery_page_v1',
    'confirm_checked_knowledge_discovery_proof_v1',
    'issue_knowledge_discovery_domain_challenge_v1',
    'claim_knowledge_discovery_proof_check_v1',
    'fail_knowledge_discovery_seed_v1',
  ];
  assert.deepEqual(manifest.revokedUnsafeRpcNames,expectedLegacy);
});

test('KB-09N obsolete seed-repair path is absent from runtime and denied by fixture',()=>{
  const manifest=JSON.parse(read('docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json'));
  const fail='fail_knowledge_discovery_seed_v1';
  assert.ok(manifest.revokedUnsafeRpcNames.includes(fail));
  assert.ok(!manifest.runtimeContracts.some(x=>x.name===fail));
  for(const path of [
    'app/api/knowledge/discovery/route.ts',
    'app/api/knowledge/discovery/worker/route.ts',
    'lib/knowledge-discovery/runner.ts',
  ]){
    assert.equal(read(path).includes("rpc('"+fail+"'"),false,path);
  }
  const sql=read('docs/sql/KB-09N-retired-seed-rpc-and-acl-preflight-REHEARSAL-DRAFT.sql');
  assert.match(sql,/KB09N_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
  assert.match(sql,/revoke execute on function public\.fail_knowledge_discovery_seed_v1/);
  assert.match(sql,/revoke execute on function kb09h_fixture\.fail_unseeded_queued_job_v1/);
  assert.match(sql,/KB09N_retired_rpc_still_executable/);
  assert.match(sql,/KB09N_service_role_direct_write_or_ddl/);
  assert.match(sql,/KB09N_unapproved_policy_grants_active/);
  assert.match(sql,/revoke references on public\.knowledge_discovery_jobs/);
});
