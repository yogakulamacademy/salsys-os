import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadAndVerify, verifyIntegratedHold,
} from '../../scripts/kb10-integrated-review-hold-preflight.mjs';

const read = p => readFileSync(resolve(p),'utf8');
const json = p => JSON.parse(read(p));
const packet = json('docs/checkpoints/KB-10-integrated-review-hold-DRAFT.json');
const inventory = json('docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json');
const ledger = json('docs/checkpoints/KB-09O-release-readiness-ledger-DRAFT.json');
const files = {
  draftAction: read('app/settings/knowledge/discovery/draft-action.ts'),
  knowledgePage: read('app/settings/knowledge/page.tsx'),
  runner: read('lib/knowledge-discovery/runner.ts'),
  htmlPreview: read('app/settings/knowledge/discovery/preview-action.ts'),
  syntheticSql: read('docs/sql/KB-09T-evidence-withdrawal-expiry-REHEARSAL-DRAFT.sql'),
  atomicDraftSql: read('docs/sql/KB-11A-consent-atomic-discovered-draft-REHEARSAL-DRAFT.sql'),
  approvalGuardSql: read('docs/sql/KB-14A-unverified-discovery-approval-guard-REHEARSAL-DRAFT.sql'),
  legacyApprovalAction: read('app/settings/knowledge/actions.ts'),
};
const clone = x => structuredClone(x);
function rejects(mutate,pattern){
  const draft=clone(packet);
  const inv=clone(inventory);
  const gate=clone(ledger);
  const code={...files};
  mutate({draft,inv,gate,code});
  assert.throws(()=>verifyIntegratedHold(draft,inv,gate,code),pattern);
}

test('KB-10 integrated review correctly reports staging ON HOLD and NO release',()=>{
  assert.deepEqual(loadAndVerify(),{
    status:'BLOCKED',
    staging:'ON_HOLD',
    realWitnesses:0,requiredRealWitnesses:16,
    pendingIndependentDecisions:4,migrationApproved:false,
    autoEvidenceCollectionEnabled:false,autoApprovalEnabled:false,
    deployAuthorized:false,
    note:'PASS verifies draft release STOP controls only; this is NOT authorization.',
  });
});

test('KB-10 cannot convert synthetic CI to real staging witness results',()=>{
  rejects(x=>{x.draft.staging.state='READY';},/Expected values/);
  rejects(x=>{x.draft.staging.project_provisioned=true;},/Staging hold/);
  rejects(x=>{x.draft.staging.scenarios_independently_witnessed=16;},/Expected values/);
  rejects(x=>{x.gate.real_acceptance.scenarios[0].status='PASSED';},/false|Expected values|expression evaluated/);
  rejects(x=>{x.gate.real_acceptance.independently_witnessed=1;},/Expected values/);
  rejects(x=>{x.draft.staging.spending_quote_approved=true;},/Staging hold/);
  rejects(x=>{x.draft.staging.owner_requested_hold=false;},/Expected values/);
});

test('KB-10 rejects fabricated independent security/privacy/DBA decisions',()=>{
  rejects(x=>{x.draft.independent_decisions[0].status='APPROVED';},/false|Expected values|expression evaluated/);
  rejects(x=>{x.draft.independent_decisions[1].attestation_ref='self-approved';},/false|Expected values|expression evaluated/);
  rejects(x=>{x.draft.production.legal_retention_approved=true;},/Production hold/);
  rejects(x=>{x.draft.production.approved_retention_days=30;},/No invented approval/);
  rejects(x=>{x.draft.production.reviewer_signature_reference='synthetic-CI';},/No invented approval/);
  rejects(x=>{x.inv.conditions.approvedMigrationExists=true;},/Expected values/);
  rejects(x=>{x.draft.production.reviewed_hosted_migration_exists=true;},/Production hold/);
});

test('KB-10 fails closed if earlier generic create RPC or privileged write fallback returns',()=>{
  rejects(x=>{x.code.draftAction=x.code.draftAction.replace(
    'create_discovery_review_draft_with_current_consent_v1',
    'create_source_backed_knowledge_document_v2');
  },/create_discovery_review_draft_with_current_consent_v1/);
  rejects(x=>{x.code.draftAction+='// create_source_backed_knowledge_document_v2';},
    /create_source_backed_knowledge_document_v2/);
  rejects(x=>{x.code.draftAction=x.code.draftAction.replace(
    "KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED !== 'true'",
    "KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED === 'true'");
  },/KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED !== 'true'/);
  rejects(x=>{x.code.draftAction+='// createAdminClient';},/createAdminClient/);
  rejects(x=>{x.code.knowledgePage=x.code.knowledgePage.replace(
    'disabled={!atomicDiscoveredDraftApproved}','');
  },/disabled=/);
});

test('KB-11B hold rejects removal of Auth/session lock or disposable SQL marker',()=>{
  rejects(x=>{x.code.atomicDraftSql=x.code.atomicDraftSql.replace(
    'for share of b,s,o,m','');
  },/for share of b,s,o,m/);
  rejects(x=>{x.code.atomicDraftSql=x.code.atomicDraftSql.replace(
    'KB11A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED','UNGUARDED');
  },/KB11A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
  rejects(x=>{x.code.atomicDraftSql=x.code.atomicDraftSql.replace(
    'kb_discovery_consent_actor_v1','no_session_guard');
  },/kb_discovery_consent_actor_v1/);
});

test('KB-14A release preflight rejects removal of unverified discovery publication freeze',()=>{
  rejects(x=>{x.code.approvalGuardSql=x.code.approvalGuardSql.replace(
    'KB14A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED','unguarded');
  },/KB14A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
  rejects(x=>{x.code.approvalGuardSql=x.code.approvalGuardSql.replace(
    'create trigger kb14a_hold_unverified_discovery_document','-- omitted trigger');
  },/kb14a_hold_unverified_discovery_document/);
  rejects(x=>{x.code.approvalGuardSql=x.code.approvalGuardSql.replace(
    'create trigger kb14a_hold_unverified_discovery_source','-- omitted source trigger');
  },/kb14a_hold_unverified_discovery_source/);
  rejects(x=>{x.code.approvalGuardSql=x.code.approvalGuardSql.replace(
    "new.status not in ('draft','archived')","new.status not in ('approved')");
  },/new\\.status not in/);
  rejects(x=>{x.code.legacyApprovalAction+='// discoveryApprovalPreflight';},
    /discoveryApprovalPreflight/);
});

test('KB-10 refuses a production worker evidence rollout or simulated approvals',()=>{
  rejects(x=>{x.code.runner+='// prepareCrawlerEvidenceEnvelope';},/prepareCrawlerEvidenceEnvelope/);
  rejects(x=>{x.draft.production.worker_live_evidence_writes_enabled=true;},/Production hold/);
  rejects(x=>{x.draft.production.deployment_authorized=true;},/Production hold/);
  rejects(x=>{x.draft.provenance_review.publication_authorized=true;},/Expected values/);
  rejects(x=>{x.draft.review_areas[3].status='COMPLETE';},/false|expression evaluated/);
});

test('KB-10 offline command cannot silently change approval or contact external accounts',()=>{
  const run=spawnSync(process.execPath,['scripts/kb10-integrated-review-hold-preflight.mjs'],{
    cwd:resolve('.'),encoding:'utf8',timeout:15000,
    env:{PATH:process.env.PATH,HOME:process.env.HOME},
  });
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.staging,'ON_HOLD');
  assert.equal(result.deployAuthorized,false);
  const script=read('scripts/kb10-integrated-review-hold-preflight.mjs');
  const imports=script.split('\n').filter(line=>/^import\s/.test(line)).join('\n');
  assert.doesNotMatch(imports,/node:(?:http|https|net)|supabase|github|child_process/i);
  // Match actual executable calls only, not the guard's own regex literals.
  assert.doesNotMatch(script,/^\s*(?:await\s+)?(?:fetch|apply_migration|execute_sql)\s*\(/m);
  assert.doesNotMatch(script,/^\s*(?:const|let|var)\s+.*process\.env\.SUPABASE/m);
  assert.doesNotMatch(script,/process\.argv\[2\]/);
});
