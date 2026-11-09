const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.resolve(__dirname,
  '../../docs/sql/r2-staging-postinstall-function-grants-parity-v1.sql'), 'utf8');
const expected = [
  "attach_whatsapp_outbound_message_id",
  "auto_disarm_whatsapp_provider_pilot_v1",
  "can_manage_lead_assignments",
  "enforce_admissions_auto_task_event_org",
  "enforce_automation_tenant_alignment_v1",
  "enforce_task_organization",
  "evaluate_identity_for_lead_v1",
  "finalize_course_catalog_sync",
  "guard_organization_site_alias_claim_v1",
  "guard_organization_site_primary_claim_v1",
  "ingest_tracking_event_v1",
  "reconcile_whatsapp_canonical_message_approval_v1",
  "release_physical_room_with_accommodation",
  "resolve_whatsapp_channel_policy_v3",
  "run_admissions_auto_tasks",
  "search_enqueue_row_trigger_v1",
  "search_privacy_tombstone_trigger_v1",
  "set_course_batch_admin_event_organization",
  "sync_batch_changes_to_leads",
  "sync_lead_from_preferred_batch",
  "update_crm_pipeline_aging_rule",
  "update_crm_stage_probability"
];
const searchPathFunctions = ['log_new_lead_stage', 'normalize_event_intelligence_url_v1',
  'privacy_purpose_for_event_v1', 'set_updated_at'];

test('security proposal is transactional, fail-closed, and uses PostgreSQL catalog guards', () => {
  assert.match(sql, /^BEGIN;$/m);
  assert.match(sql, /^COMMIT;$/m);
  assert.match(sql, /^SET LOCAL lock_timeout = '5s';$/m);
  assert.match(sql, /^SET LOCAL statement_timeout = '30s';$/m);
  assert.match(sql, /BLOCKED_R2_FUNCTION_CATALOG_OR_SERVICE_ROLE_MISMATCH/);
  assert.match(sql, /BLOCKED_R2_SEARCH_PATH_FUNCTION_CONTRACT_MISMATCH/);
  assert.match(sql, /BLOCKED_R2_POSTINSTALL_FUNCTION_GRANTS_PARITY_FAILED/);
  assert.match(sql, /BLOCKED_R2_POSTINSTALL_SEARCH_PATH_PARITY_FAILED/);
  assert.match(sql, /has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(sql, /has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
  assert.match(sql, /has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.equal((sql.match(/^DO \$r2_(?:preflight|postflight)\$$/gm) || []).length, 2);
});

test('only the catalog-verified 22 definer functions have EXECUTE revoked', () => {
  const commands = [...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) FROM (PUBLIC, anon(?:, authenticated)?);$/gm)];
  assert.equal(commands.length, 22);
  assert.deepEqual(commands.map(x => x[1]).sort(), [...expected].sort());
  for (const item of commands) {
    assert.ok(item[2].length >= 0);
    assert.equal(item[3], item[1] === 'attach_whatsapp_outbound_message_id'
      ? 'PUBLIC, anon' : 'PUBLIC, anon, authenticated');
  }
  assert.doesNotMatch(sql, /\bGRANT\s+EXECUTE\b/i);
  assert.doesNotMatch(sql, /\bREVOKE\s+(?:ALL|USAGE|SELECT|INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|CREATE\s+TABLE|CREATE\s+POLICY|ALTER\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.)\b/i);
});

test('exactly four INVOKER search_path changes match the production catalog configuration', () => {
  const cmds = [...sql.matchAll(/^ALTER FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) SET search_path = public, pg_temp;$/gm)];
  assert.equal(cmds.length, 4);
  assert.deepEqual(cmds.map(x => x[1]).sort(), [...searchPathFunctions].sort());
  assert.match(sql, /p\.proconfig @> ARRAY\['search_path=public, pg_temp'\]::text\[\]/);
  assert.doesNotMatch(sql, /\bALTER FUNCTION[^;]*SECURITY DEFINER\b/i);
});

test('no project refs, endpoints, customer records or provider secrets appear in patch', () => {
  assert.doesNotMatch(sql, /(?:ndxpjqkthuzxlmbenxti|doaozrkrtgeslddwhclj|wunnbqjvfzmawubglyhe)/i);
  assert.doesNotMatch(sql, /(?:https?:\/\/|supabase\.co|bearer |service_role[_-]?key|sb_secret_|sk_[a-z0-9])/i);
  assert.doesNotMatch(sql, /\b(?:auth\.users|public\.leads|public\.messages)\b/i);
});
