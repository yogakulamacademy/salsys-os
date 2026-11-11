import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  validateDraftReleaseHold,
  EXPECTED_CASES,EXPECTED_SURFACES,EXPECTED_PROCESSORS,
} from '../../scripts/kb09o-release-preflight.mjs';

const read=path=>JSON.parse(readFileSync(resolve(path),'utf8'));
const packet=read('docs/checkpoints/KB-09O-release-readiness-ledger-DRAFT.json');
const contract=read('docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json');
const copy=obj=>structuredClone(obj);
const rejectsChange=(mutate,needle)=>{
  const modified=copy(packet);
  mutate(modified);
  assert.throws(()=>validateDraftReleaseHold(modified,contract),needle);
};

test('KB-09O exact release gate #601: all sixteen independently witnessed cases remain open',()=>{
  const result=validateDraftReleaseHold(packet,contract);
  assert.deepEqual(result,{
    verdict:'BLOCKED',
    independentlyWitnessedCases:0,
    mandatoryCases:16,
    unresolvedGates:12,
    retentionDecisionsMissing:12,
    processorCategoriesUninventoried:5,
    hostedDatabaseChangesAllowed:false,
    mergeOrDeploymentAllowed:false,
    note:'PASS means the release remains BLOCKED; this is NOT release authorization.',
  });
  assert.deepEqual(packet.real_acceptance.scenarios.map(c=>c.id),EXPECTED_CASES);
  assert.deepEqual(packet.legal_retention.schema_surfaces.map(s=>s.table),EXPECTED_SURFACES);
  assert.deepEqual(packet.legal_retention.external_copy_categories.map(p=>p.category),
    EXPECTED_PROCESSORS);
  assert.equal(contract.runtimeContracts.length,9);
  assert.equal(contract.disposableRehearsalSqlOrder.length,9);
});

test('KB-09O cannot claim release readiness or reinterpret synthetic CI as witness evidence',()=>{
  rejectsChange(p=>{p.verdict='READY';},/cannot mark any release READY/);
  rejectsChange(p=>{p.real_acceptance.independently_witnessed=1;},/strictEqual|Expected values/);
  rejectsChange(p=>{p.real_acceptance.scenarios[0].status='PASSED';},
    /No synthetic passes can be staged witnesses/);
  rejectsChange(p=>{p.real_acceptance.scenarios[0].staging_evidence_reference='ci-green';},
    /must have no unverified receipt/);
  rejectsChange(p=>{p.real_acceptance.scenarios[0].separate_witness_attestation_reference='self-report';},
    /must have no unverified receipt/);
  rejectsChange(p=>{p.evidence_policy.synthetic_ci_counts_as_witness=true;},
    /deepStrictEqual|Expected values/);
  rejectsChange(p=>{p.evidence_policy.self_reported_pass_counts_as_witness=true;},
    /deepStrictEqual|Expected values/);
});

test('KB-09O rejects missing, duplicated, or invented acceptance cases',()=>{
  rejectsChange(p=>{p.real_acceptance.scenarios.pop();},/Issue #601 scenarios count/);
  rejectsChange(p=>{p.real_acceptance.scenarios[0].id=p.real_acceptance.scenarios[1].id;},
    /Issue #601 scenarios duplicate/);
  rejectsChange(p=>{p.real_acceptance.scenarios[5].id='synthetic_test_passes';},
    /Issue #601 scenarios exact identifiers/);
});

test('KB-09O requires separate independent security, privacy/DBA and budget evidence',()=>{
  rejectsChange(p=>{p.governance_gates[0].status='APPROVED';},/Gate cannot self-approve/);
  rejectsChange(p=>{p.governance_gates[3].external_attestation_reference='draft-receipt';},
    /must have no unverified receipt/);
  rejectsChange(p=>{p.governance_gates[6].issue=601;},
    /Correct owner ticket/);
  rejectsChange(p=>{p.governance_gates.splice(2,1);},/Owner approval gates count/);
  rejectsChange(p=>{p.actual_staging.spending_approved=true;},
    /Staging.spending_approved cannot be approved/);
  rejectsChange(p=>{p.actual_staging.project_reference='production-is-not-staging';},
    /strictEqual|Expected values/);
  rejectsChange(p=>{p.actual_staging.revenue_condition_confirmed=true;},
    /Staging.revenue_condition_confirmed cannot be approved/);
});

test('KB-09O cannot quietly authorize schema erasure, provider use, or policy activation',()=>{
  rejectsChange(p=>{p.legal_retention.schema_surfaces[0].status='APPROVED';},
    /strictEqual|Expected values/);
  rejectsChange(p=>{p.legal_retention.schema_surfaces[0].retention_window_approved=true;},
    /strictEqual|Expected values/);
  rejectsChange(p=>{p.legal_retention.schema_surfaces[1].table=
    p.legal_retention.schema_surfaces[0].table;},/Issue #613 tables duplicate/);
  rejectsChange(p=>{p.legal_retention.external_copy_categories[0].status='REVIEWED';},
    /strictEqual|Expected values/);
  rejectsChange(p=>{p.operations.policy_grants_enabled=true;},
    /Operations.policy_grants_enabled cannot be approved/);
  rejectsChange(p=>{p.operations.provider_model_call_authorized=true;},
    /Operations.provider_model_call_authorized cannot be approved/);
  rejectsChange(p=>{p.operations.merge_authorized=true;},
    /Operations.merge_authorized cannot be approved/);
  rejectsChange(p=>{p.security.outer_transaction_expiry_policy_approved=true;},
    /Security.outer_transaction_expiry_policy_approved cannot be approved/);
});

test('KB-09O honors the separately pinned and still-blocked KB-09M database inventory',()=>{
  const altered=copy(contract);
  altered.conditions.approvedMigrationExists=true;
  assert.throws(()=>validateDraftReleaseHold(packet,altered),/Unapproved cutover: approvedMigrationExists/);
  altered.conditions.approvedMigrationExists=false;
  altered.runtimeContracts.pop();
  assert.throws(()=>validateDraftReleaseHold(packet,altered),/strictEqual|Expected values/);
  altered.runtimeContracts=copy(contract.runtimeContracts);
  altered.disposableRehearsalSqlOrder.pop();
  assert.throws(()=>validateDraftReleaseHold(packet,altered),/strictEqual|Expected values/);
});

test('KB-09O CLI is read-only and prints BLOCKED, never a READY deployment verdict',()=>{
  const r=spawnSync(process.execPath,['scripts/kb09o-release-preflight.mjs'],{
    cwd:resolve('.'),encoding:'utf8',timeout:15000,
    env:{PATH:process.env.PATH,HOME:process.env.HOME},
  });
  assert.equal(r.status,0,r.stderr);
  const result=JSON.parse(r.stdout);
  assert.equal(result.verdict,'BLOCKED');
  assert.equal(result.mergeOrDeploymentAllowed,false);
  assert.equal(result.independentlyWitnessedCases,0);
  assert.match(result.note,/NOT release authorization/);
});

test('KB-09O has no installation, credential, project or hosted write capability',()=>{
  const source=readFileSync(resolve('scripts/kb09o-release-preflight.mjs'),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|createAdminClient|execute_sql|apply_migration|createProject|supabase\.rpc/i);
  assert.doesNotMatch(source,/process\.argv\[2\]|process\.env\.SUPABASE|https:\/\/\S+/i);
  assert.match(source,/NO_RELEASE_UNTIL_EXPLICIT_APPROVED_EXTERNAL_EVIDENCE_AND_INDEPENDENT_REVIEW/);
});
