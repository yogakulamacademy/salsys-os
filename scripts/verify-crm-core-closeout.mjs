import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`CRM closeout verification failed: missing ${label} (${needle})`);
  }
}

const migration = read('supabase/migrations/20261020111000_crm_core_closeout_v1.sql');
const crmActions = read('app/actions/crm.ts');
const pipelineActions = read('app/pipeline/actions.ts');
const packageJson = read('package.json');
const ci = read('.github/workflows/ci.yml');

for (const [needle, label] of [
  ['v_crm_core_integrity_health_v1', 'CRM integrity health view'],
  ['enforce_lead_stage_history_consistency_v1', 'deferred stage/history invariant'],
  ['deferrable initially deferred', 'deferred stage constraint'],
  ['enforce_active_crm_assignee_v1', 'active CRM assignee guard'],
  ['reconcile_crm_assignments_on_member_status_v1', 'membership deactivation cleanup'],
  ['organization_members_clear_crm_assignments_v1', 'membership lifecycle trigger'],
  ['invalid_open_conversation_assignee', 'conversation assignment health'],
  ['invalid_open_task_assignee', 'task assignment health'],
  ['message_lineage_mismatch', 'message lineage health'],
  ['person_link_tenant_mismatch', 'Person 360 tenant integrity health'],
  ['next_followup_mismatch', 'follow-up cache health'],
  ["'system'::public.actor_type", 'system reconciliation provenance'],
  ['crm_core_closeout_v1', 'stage reconciliation provenance'],
  ['security_invoker = true', 'RLS-safe health view'],
]) {
  requireText(migration, needle, label);
}

for (const [source, label] of [
  [crmActions, 'lead detail stage mutation'],
  [pipelineActions, 'pipeline stage mutation'],
]) {
  requireText(source, 'set_lead_stage', `${label} uses canonical RPC`);
}

requireText(packageJson, 'verify:crm-core', 'package CRM verifier script');
requireText(ci, 'npm run verify:crm-core', 'CI CRM verifier step');

console.log('CRM Core Closeout V1 contracts verified.');
