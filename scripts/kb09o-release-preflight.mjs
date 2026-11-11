/**
 * KB-09O LOCAL / DRAFT ONLY. A green output verifies that release is BLOCKED,
 * not that deployment is authorized. No network, GitHub, Supabase or secrets.
 *
 * This checker ONLY recognizes a strictly unapproved packet. It cannot
 * approve a future release: real witness/signer verification needs a
 * separately reviewed, protected external process.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXPECTED_CASES = Object.freeze([
  'ownership_expiry_denies',
  'consent_missing_denies',
  'consent_withdrawal_stops_queued',
  'tenant_a_cannot_read_b',
  'tenant_a_cannot_write_b',
  'retention_expiry_erases',
  'deletion_rehearsal_audited',
  'unauthenticated_reviewer_denied',
  'stale_document_version_denied',
  'existing_workflow_only',
  'ssrf_dns_redirect_robots_denied',
  'quota_and_emergency_stop',
  'browser_visible_text_reconciled',
  'model_ungrounded_answer_denied',
  'historical_citation_coverage',
  'isolated_staging_rollback',
]);

export const EXPECTED_SURFACES = Object.freeze([
  'knowledge_sources','knowledge_documents','knowledge_chunks',
  'knowledge_approvals','knowledge_discovery_domain_verifications',
  'knowledge_discovery_jobs','knowledge_discovery_pages',
  'knowledge_discovery_site_consents','knowledge_discovery_consent_control',
  'knowledge_discovery_consent_audit',
  'knowledge_discovery_metadata_erasure_audit',
  'knowledge_discovery_policy_documents',
]);

export const EXPECTED_PROCESSORS = Object.freeze([
  'backups_pitr_restores','logs_traces','ai_prompts_provider_records',
  'caches_indexes_exports','downstream_sent_published_copies',
]);

const EXPECTED_GATES = Object.freeze([
  ['security_review',612],
  ['protected_environment',612],
  ['privacy_legal',613],
  ['dba_retention',613],
  ['external_processor_inventory',613],
  ['staging_budget',614],
  ['isolated_staging',614],
  ['reviewed_migrations',601],
  ['physical_commit_policy',601],
  ['service_key_and_proof',612],
  ['witness_reviews',601],
  ['owner_release',601],
]);

const EXPECTED_OPERATION_KEYS = Object.freeze([
  'feature_pilot_enabled','consent_management_enabled',
  'policy_grants_enabled','protected_workflow_runnable',
  'external_website_crawl_authorized','provider_model_call_authorized',
  'hosted_sql_authorized','deploy_authorized','merge_authorized',
  'new_paid_resource_authorized',
]);

const EXPECTED_SECURITY_KEYS = Object.freeze([
  'proven_real_auth_sessions','real_tenant_isolation_witnessed',
  'independent_security_review','migrations_authorized',
  'exact_hosted_acl_verified','outer_transaction_expiry_policy_approved',
  'service_key_containment_verified','operator_policy_registry_approved',
]);

const EXPECTED_STAGING_KEYS = Object.freeze([
  'provisioned','approved','reviewer_protection_verified',
  'synthetic_tenants_accepted','spending_approved','fresh_quote_approved',
  'revenue_condition_confirmed',
]);

function exactlyEqualSet(values,expected,label) {
  assert.equal(values.length,expected.length,label+' count');
  assert.equal(new Set(values).size,values.length,label+' duplicate');
  assert.deepEqual([...values].sort(),[...expected].sort(),label+' exact identifiers');
}

function allFalse(object,keys,label) {
  assert.ok(object && typeof object==='object',label+' exists');
  exactlyEqualSet(Object.keys(object).filter(k=>keys.includes(k)),keys,label+' flags');
  for(const key of keys)assert.equal(object[key],false,label+'.'+key+' cannot be approved');
}

function allNull(object,keys,label){
  for(const key of keys)assert.equal(object[key],null,label+'.'+key+' must have no unverified receipt');
}

export function validateDraftReleaseHold(packet,contract) {
  assert.equal(packet.schema_version,1);
  assert.equal(packet.packet_id,'KB-09O');
  assert.equal(packet.classification,'DRAFT_ONLY_SYNTHETIC_ENGINEERING_NOT_RELEASE');
  assert.equal(packet.as_of,'2026-11-08');
  assert.equal(packet.verdict,'BLOCKED','This tool cannot mark any release READY');

  const basis=packet.source_of_truth;
  assert.equal(basis.release_gate_issue,601);
  assert.deepEqual(basis.approval_issues,[612,613,614]);
  assert.equal(basis.parent_unmerged_draft_pr,655);
  assert.equal(basis.parent_sha,'2c15dc0ddfeed37ff1b10320a51a515b0fea66c8');
  assert.equal(basis.audit_file,'docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json');

  assert.equal(contract.status,'blocked_unapproved_no_migration');
  assert.equal(contract.conditions.mandatoryStagingCases,16);
  assert.equal(contract.conditions.independentlyWitnessedStagingCases,0);
  for(const key of [
    'hostedSqlAllowed','deployAllowed','approvedMigrationExists',
    'legalPolicyApproved','independentSecurityApproval',
    'deploymentOrMergeAllowed','newPaidStagingUntilRevenueAndFreshApproval',
  ]) assert.equal(contract.conditions[key],false,'Unapproved cutover: '+key);
  assert.equal(contract.runtimeContracts.length,9);
  assert.equal(contract.disposableRehearsalSqlOrder.length,9);

  const stage=packet.actual_staging;
  allFalse(stage,EXPECTED_STAGING_KEYS,'Staging');
  assert.equal(stage.project_reference,null);
  assert.equal(packet.real_acceptance.required,16);
  assert.equal(packet.real_acceptance.independently_witnessed,0);
  exactlyEqualSet(packet.real_acceptance.scenarios.map(c=>c.id),
    EXPECTED_CASES,'Issue #601 scenarios');
  for(const c of packet.real_acceptance.scenarios){
    assert.equal(c.status,'UNWITNESSED','No synthetic passes can be staged witnesses: '+c.id);
    assert.ok(typeof c.description==='string'&&c.description.length>15,c.id+' description');
    assert.ok(typeof c.category==='string'&&c.category.length>2,c.id+' category');
    allNull(c,[
      'staging_evidence_reference','separate_witness_attestation_reference',
      'exact_verified_commit','recorded_at',
    ],c.id);
  }

  const gates=packet.governance_gates;
  exactlyEqualSet(gates.map(g=>g.id),EXPECTED_GATES.map(g=>g[0]),'Owner approval gates');
  const issueByGate=new Map(EXPECTED_GATES);
  for(const gate of gates){
    assert.equal(gate.issue,issueByGate.get(gate.id),'Correct owner ticket: '+gate.id);
    assert.equal(gate.status,'BLOCKED','Gate cannot self-approve: '+gate.id);
    assert.ok(gate.required_decision.length>20,'Substantive decision: '+gate.id);
    allNull(gate,['external_attestation_reference','independently_verified_at'],gate.id);
  }

  const retention=packet.legal_retention;
  exactlyEqualSet(retention.schema_surfaces.map(s=>s.table),EXPECTED_SURFACES,'Issue #613 tables');
  for(const s of retention.schema_surfaces){
    assert.equal(s.status,'UNDECIDED');
    assert.equal(s.policy_decision_reference,null);
    assert.equal(s.retention_window_approved,false);
    assert.equal(s.disposition_approved,false);
  }
  exactlyEqualSet(retention.external_copy_categories.map(p=>p.category),
    EXPECTED_PROCESSORS,'Issue #613 external processors');
  for(const p of retention.external_copy_categories){
    assert.equal(p.status,'UNINVENTORIED');
    assert.equal(p.processor_attestation_reference,null);
  }

  allFalse(packet.security,EXPECTED_SECURITY_KEYS,'Security');
  allFalse(packet.operations,EXPECTED_OPERATION_KEYS,'Operations');
  assert.deepEqual(packet.evidence_policy,{
    synthetic_ci_counts_as_witness:false,
    self_reported_pass_counts_as_witness:false,
    populated_placeholder_counts_as_witness:false,
    external_signoff_required:true,
    secrets_in_repository_prohibited:true,
  });
  assert.equal(packet.decision_rule,
    'NO_RELEASE_UNTIL_EXPLICIT_APPROVED_EXTERNAL_EVIDENCE_AND_INDEPENDENT_REVIEW');

  return Object.freeze({
    verdict:'BLOCKED',
    independentlyWitnessedCases:0,
    mandatoryCases:16,
    unresolvedGates:gates.length,
    retentionDecisionsMissing:retention.schema_surfaces.length,
    processorCategoriesUninventoried:retention.external_copy_categories.length,
    hostedDatabaseChangesAllowed:false,
    mergeOrDeploymentAllowed:false,
    note:'PASS means the release remains BLOCKED; this is NOT release authorization.',
  });
}

const invokedAsScript=process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(invokedAsScript){
  // Only reads committed draft data. No command-line file override,
  // external receipt acceptance, network, or credential path exists.
  const packet=JSON.parse(readFileSync(resolve(
    'docs/checkpoints/KB-09O-release-readiness-ledger-DRAFT.json'),'utf8'));
  const contract=JSON.parse(readFileSync(resolve(
    'docs/checkpoints/KB-09M-cutover-inventory-DRAFT.json'),'utf8'));
  try{
    process.stdout.write(JSON.stringify(validateDraftReleaseHold(packet,contract),null,2)+'\n');
  }catch(error){
    process.stderr.write('KB-09O packet invalid: '+error.message+'\n');
    process.exitCode=1;
  }
}
