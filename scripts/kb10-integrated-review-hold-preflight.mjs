/**
 * KB-10: deliberately BLOCKED review-candidate verifier.
 *
 * An exit code of zero means only that the cumulative draft still has its
 * STOP controls. No network, Supabase, GitHub, migration or billing action.
 * This process CANNOT verify future independent attestations or approve a
 * release. The staging hold must be lifted by a separate user decision.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson = path => JSON.parse(readFileSync(resolve(path),'utf8'));
const readText = path => readFileSync(resolve(path),'utf8');

const sixAreas = [
  'integrated_diff','source_content','consent_and_retention',
  'security_and_migration','real_staging_witnesses','deploy_and_monitor',
];

export function verifyIntegratedHold(packet, migrationInventory, releaseLedger, files){
  assert.equal(packet.schema_version,1);
  assert.equal(packet.classification,'DRAFT_REVIEW_ONLY_NOT_PRODUCTION_READY');
  assert.equal(packet.current_status,'BLOCKED');
  assert.equal(packet.consolidated_from.latest_parent_draft_pr,664);
  assert.equal(packet.consolidated_from.latest_parent_sha,
    'ea23c8b778c67a107235003d96c57082fd0731ce');
  assert.equal(packet.consolidated_from.base_branch,'main');
  assert.deepEqual(packet.consolidated_from.parent_relative_to_main,{
    ahead_commits:161,behind_commits:0,changed_files:218,
  });
  assert.equal(migrationInventory.status,'blocked_unapproved_no_migration');
  assert.equal(migrationInventory.runtimeContracts.length,9);
  assert.equal(migrationInventory.disposableRehearsalSqlOrder.length,9);
  assert.equal(migrationInventory.conditions.approvedMigrationExists,false);
  assert.equal(migrationInventory.conditions.hostedSqlAllowed,false);
  assert.equal(migrationInventory.conditions.deploymentOrMergeAllowed,false);

  assert.equal(releaseLedger.verdict,'BLOCKED');
  assert.equal(releaseLedger.real_acceptance.required,16);
  assert.equal(releaseLedger.real_acceptance.independently_witnessed,0);
  assert.equal(releaseLedger.real_acceptance.scenarios.length,16);
  assert.ok(releaseLedger.real_acceptance.scenarios.every(c=>
    c.status==='UNWITNESSED'&&!c.staging_evidence_reference &&
    !c.separate_witness_attestation_reference));
  assert.equal(releaseLedger.governance_gates.length,12);
  assert.ok(releaseLedger.governance_gates.every(g=>g.status==='BLOCKED'));
  assert.equal(releaseLedger.legal_retention.schema_surfaces.length,12);
  assert.equal(releaseLedger.legal_retention.external_copy_categories.length,5);

  const stage=packet.staging;
  assert.equal(stage.state,'ON_HOLD');
  assert.equal(stage.owner_requested_hold,true);
  assert.equal(stage.scenarios_independently_witnessed,0);
  assert.equal(stage.scenarios_required,16);
  for(const flag of [
    'paid_staging_authorized','existing_production_or_recovery_usable_as_staging',
    'project_provisioned','real_authenticated_tenants_witnessed',
    'spending_quote_approved','revenue_condition_confirmed',
  ])assert.equal(stage[flag],false,'Staging hold: '+flag);
  assert.equal(stage.external_evidence_reference,null);

  for(const flag of [
    'worker_live_evidence_writes_enabled',
    'manual_discovery_draft_writes_enabled',
    'legal_retention_approved',
    'reviewed_hosted_migration_exists',
    'independent_security_review_complete',
    'approved_commit_expiry_policy',
    'protected_merge_authorized','deployment_authorized',
    'production_or_recovery_sql_authorized','real_website_crawling_authorized',
    'model_provider_calls_authorized','purpose_consent_enabled',
  ])assert.equal(packet.production[flag],false,'Production hold: '+flag);
  for(const value of [
    'approved_retention_days','reviewer_signature_reference',
    'DBA_approval_reference','legal_approval_reference',
  ])assert.equal(packet.production[value],null,'No invented approval: '+value);

  const areas=packet.review_areas.map(a=>a.id);
  assert.deepEqual(areas,sixAreas);
  assert.ok(packet.review_areas.every(a=>
    a.status!=='APPROVED'&&a.status!=='COMPLETE'));
  assert.deepEqual(packet.independent_decisions.map(x=>x.issue),
    [612,613,614,601]);
  assert.ok(packet.independent_decisions.every(x=>
    x.attestation_ref===null && x.status!=='APPROVED'));

  const contract=packet.atomic_discovered_draft_contract;
  assert.equal(contract.name,'create_discovery_review_draft_with_current_consent_v1');
  assert.equal(contract.status,'REVIEW_REQUIRED_NOT_INSTALLED');
  assert.equal(contract.approval_flag,
    'KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED');
  assert.equal(contract.default_enabled,false);
  assert.equal(contract.no_legacy_fallback,true);
  assert.deepEqual(contract.required_receipt,[
    'ok','status','organization_id','page_id','document_id','source_id',
  ]);
  assert.match(contract.required_execution,/SINGLE.*transaction/);

  const action=files.draftAction;
  const page=files.knowledgePage;
  const runner=files.runner;
  const preview=files.htmlPreview;
  const syntheticSql=files.syntheticSql;
  assert.match(action,/create_discovery_review_draft_with_current_consent_v1/);
  assert.match(action,/KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED !== 'true'/);
  assert.match(action,/creation\?\.organization_id !== organizationId/);
  assert.match(action,/creation\?\.page_id !== pageId/);
  assert.doesNotMatch(action,/create_source_backed_knowledge_document_v2/);
  assert.doesNotMatch(action,/createAdminClient/);
  assert.doesNotMatch(action,/p_approve: true/);
  assert.match(page,/disabled=\{!atomicDiscoveredDraftApproved\}/);
  assert.match(page,/Draft saving on hold/);
  assert.match(runner,/commit_knowledge_discovery_page_with_proof_v1/);
  assert.doesNotMatch(runner,/prepareCrawlerEvidenceEnvelope|commit_discovery_evidence_kb09s_rehearsal_v1/);
  assert.match(preview,/prepareSourceGroundedDrafts/);
  assert.match(preview,/provisionalCandidates/);
  assert.doesNotMatch(preview,/create_source_backed_knowledge_document_v2/);
  assert.match(syntheticSql,/KB09T_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
  assert.match(syntheticSql,/salsys_kb09f_/);

  assert.equal(packet.provenance_review.auto_approval,false);
  assert.equal(packet.provenance_review.publication_authorized,false);
  assert.equal(packet.release_condition,
    'CANNOT_CLAIM_READY_FROM_SYNTHETIC_GREEN_CI');

  return Object.freeze({
    status:'BLOCKED',
    staging:'ON_HOLD',
    realWitnesses:0,
    requiredRealWitnesses:16,
    pendingIndependentDecisions:4,
    migrationApproved:false,
    autoEvidenceCollectionEnabled:false,
    autoApprovalEnabled:false,
    deployAuthorized:false,
    note:'PASS verifies draft release STOP controls only; this is NOT authorization.',
  });
}

function readCurrentFiles(){
  return {
    draftAction:readText('app/settings/knowledge/discovery/draft-action.ts'),
    knowledgePage:readText('app/settings/knowledge/page.tsx'),
    runner:readText('lib/knowledge-discovery/runner.ts'),
    htmlPreview:readText('app/settings/knowledge/discovery/preview-action.ts'),
    syntheticSql:readText('docs/sql/KB-09T-evidence-withdrawal-expiry-REHEARSAL-DRAFT.sql'),
  };
}

export function loadAndVerify(){
  const packet=readJson('docs/checkpoints/KB-10-integrated-review-hold-DRAFT.json');
  const inventory=readJson('docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json');
  const ledger=readJson('docs/checkpoints/KB-09O-release-readiness-ledger-DRAFT.json');
  // Never accidentally publish fixture DDL as a production migration.
  const migrations=readdirSync(resolve('supabase/migrations'));
  assert.equal(migrations.some(name=>/^KB-09[ST]-/i.test(name)),false);
  return verifyIntegratedHold(packet,inventory,ledger,readCurrentFiles());
}

const invoked=process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(invoked){
  try{process.stdout.write(JSON.stringify(loadAndVerify(),null,2)+'\n');}
  catch(error){process.stderr.write('KB-10 BLOCKER: '+error.message+'\n');process.exitCode=1;}
}
