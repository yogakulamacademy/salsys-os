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
  const serviceGrants = [...sql.matchAll(/^GRANT EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) TO (service_role);$/gm)];
  assert.equal(serviceGrants.length, 1);
  assert.equal(serviceGrants[0][1], 'approve_sales_asset_v1');
  assert.doesNotMatch(sql, /\bREVOKE\s+(?:ALL|USAGE|SELECT|INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|CREATE\s+TABLE|CREATE\s+POLICY|ALTER\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.)\b/i);
});

test('additional authenticated and service-role drift is corrected only for two exact signatures', () => {
  assert.match(sql, /^REVOKE EXECUTE ON FUNCTION public\.prepare_failed_whatsapp_provider_retry_v1\(p_organization_id uuid, p_failed_audit_id uuid, p_now timestamp with time zone\) FROM authenticated;$/m);
  assert.match(sql, /^GRANT EXECUTE ON FUNCTION public\.approve_sales_asset_v1\(p_organization_id uuid, p_asset_id uuid, p_auto_send_allowed boolean\) TO service_role;$/m);
  assert.match(sql, /BLOCKED_R2_EXTRA_AUTHENTICATED_FUNCTION_CONTRACT_MISMATCH/);
  assert.match(sql, /BLOCKED_R2_MISSING_SERVICE_ROLE_FUNCTION_CONTRACT_MISMATCH/);
  assert.match(sql, /BLOCKED_R2_EXTRA_AUTHENTICATED_POSTFLIGHT_FAILED/);
  assert.match(sql, /BLOCKED_R2_SALES_ASSET_SERVICE_ROLE_POSTFLIGHT_FAILED/);
  const extra = [...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.prepare_failed_whatsapp_provider_retry_v1\(/gm)];
  assert.equal(extra.length, 1);
});

test('preflight accepts already-correct production grants while postflight demands parity', () => {
  const preflight = sql.split('DO $r2_preflight
  const cmds = [...sql.matchAll(/^ALTER FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) SET search_path = public, pg_temp;$/gm)];
  assert.equal(cmds.length, 4);
  assert.deepEqual(cmds.map(x => x[1]).sort(), [...searchPathFunctions].sort());
  assert.match(sql, /p\.proconfig @> ARRAY\['search_path=public, pg_temp'\]::text\[\]/);
  assert.doesNotMatch(sql, /\bALTER FUNCTION[^;]*SECURITY DEFINER\b/i);
});

test('no project refs, endpoints, customer records or provider secrets appear in patch', () => {
  assert.doesNotMatch(sql, /(?:ndxpjqkthuzxlmbenxti|doaozrkrtgeslddwhclj|wunnbqjvfzmawubglyhe)/i);
  assert.doesNotMatch(sql, /(?:https?:\/\/|supabase\.co|bearer |service_role[_-]?key|sb_secret_|(?:^|[^a-z0-9_])sk_[a-z0-9])/im);
  assert.doesNotMatch(sql, /\b(?:auth\.users|public\.leads|public\.messages)\b/i);
});
)[1]?.split('$r2_preflight$;')[0] ?? '';
  const retry = preflight.split("p.proname='prepare_failed_whatsapp_provider_retry_v1'")[1]?.split('IF v_count')[0] ?? '';
  const sales = preflight.split("p.proname='approve_sales_asset_v1'")[1]?.split('IF v_count')[0] ?? '';
  assert.ok(retry.includes('BLOCKED') === false && retry.includes("has_function_privilege('service_role'"));
  assert.doesNotMatch(retry, /has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.match(sales, /has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.doesNotMatch(sales, /NOT pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(sql, /BLOCKED_R2_EXTRA_AUTHENTICATED_POSTFLIGHT_FAILED/);
  assert.match(sql, /BLOCKED_R2_SALES_ASSET_SERVICE_ROLE_POSTFLIGHT_FAILED/);
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
  assert.doesNotMatch(sql, /(?:https?:\/\/|supabase\.co|bearer |service_role[_-]?key|sb_secret_|(?:^|[^a-z0-9_])sk_[a-z0-9])/im);
  assert.doesNotMatch(sql, /\b(?:auth\.users|public\.leads|public\.messages)\b/i);
});
