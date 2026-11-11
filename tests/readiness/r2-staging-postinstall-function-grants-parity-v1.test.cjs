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
  const commands = [...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) FROM (PUBLIC, anon(?:, authenticated)?);$/gm)].filter(x => expected.includes(x[1]));
  assert.equal(commands.length, 22);
  assert.deepEqual(commands.map(x => x[1]).sort(), [...expected].sort());
  for (const item of commands) {
    assert.ok(item[2].length >= 0);
    assert.equal(item[3], item[1] === 'attach_whatsapp_outbound_message_id'
      ? 'PUBLIC, anon' : 'PUBLIC, anon, authenticated');
  }
  const serviceGrants = [...sql.matchAll(/^GRANT EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) TO (service_role);$/gm)];
  assert.equal(serviceGrants.length, 0, 'no service-role grants in the stage-only proposal');
  assert.doesNotMatch(sql, /\bREVOKE\s+(?:ALL|USAGE|SELECT|INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|CREATE\s+TABLE|CREATE\s+POLICY|ALTER\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\.)\b/i);
});

test('only WhatsApp retry access is corrected; Sales Asset approval stays service-denied', () => {
  assert.match(sql, /^REVOKE EXECUTE ON FUNCTION public\.prepare_failed_whatsapp_provider_retry_v1\(p_organization_id uuid, p_failed_audit_id uuid, p_now timestamp with time zone\) FROM authenticated;$/m);
  assert.doesNotMatch(sql, /^GRANT EXECUTE ON FUNCTION public\.approve_sales_asset_v1\(/m);
  assert.match(sql, /BLOCKED_R2_EXTRA_AUTHENTICATED_FUNCTION_CONTRACT_MISMATCH/);
  assert.match(sql, /BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_PREFLIGHT_FAILED/);
  assert.match(sql, /BLOCKED_R2_EXTRA_AUTHENTICATED_POSTFLIGHT_FAILED/);
  assert.match(sql, /BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_POSTFLIGHT_FAILED/);
  const extra = [...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.prepare_failed_whatsapp_provider_retry_v1\(/gm)];
  assert.equal(extra.length, 1);
});

test('stage preflight refuses broader production Sales Asset approval permissions', () => {
  const preflight = sql.split('DO $r2_preflight$')[1]?.split('$r2_preflight$;')[0] ?? '';
  const retry = preflight.split("p.proname='prepare_failed_whatsapp_provider_retry_v1'")[1]?.split('IF v_count')[0] ?? '';
  const sales = preflight.split("p.proname='approve_sales_asset_v1'")[1]?.split('IF v_count')[0] ?? '';
  assert.ok(retry.includes('BLOCKED') === false && retry.includes("has_function_privilege('service_role'"));
  assert.doesNotMatch(retry, /has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.match(sales, /has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.match(sales, /NOT pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(sales, /auth\.role\(\) <> ''authenticated''/);
  assert.match(sales, /v_actor is null/);
  assert.match(sql, /BLOCKED_R2_EXTRA_AUTHENTICATED_POSTFLIGHT_FAILED/);
  assert.match(sql, /BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_POSTFLIGHT_FAILED/);
});


test('checked-in human-admin-only migration cannot be weakened by the staging proposal', () => {
  const humanGuard = fs.readFileSync(path.resolve(__dirname,
    '../../supabase/migrations/20261103195300_sales_asset_human_approval_guard_v1.sql'), 'utf8');
  assert.match(humanGuard, /auth\.role\(\) <> 'authenticated'/);
  assert.match(humanGuard, /v_actor is null/);
  assert.match(humanGuard, /revoke execute on function public\.approve_sales_asset_v1\(uuid, uuid, boolean\) from public, anon, service_role/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.approve_sales_asset_v1\(/);
  const pre = sql.slice(0, sql.indexOf('-- Revoke inherited PUBLIC'));
  const post = sql.slice(sql.lastIndexOf('\nDO '));
  assert.match(pre, /BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_PREFLIGHT_FAILED/);
  assert.match(pre, /NOT pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(post, /BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_POSTFLIGHT_FAILED/);
  assert.match(post, /NOT pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
});

test('exactly four INVOKER search_path changes match the production catalog configuration', () => {
  const cmds = [...sql.matchAll(/^ALTER FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) SET search_path = public, pg_temp;$/gm)];
  assert.equal(cmds.length, 4);
  assert.deepEqual(cmds.map(x => x[1]).sort(), [...searchPathFunctions].sort());
  assert.match(sql, /p\.proconfig @> ARRAY\['search_path=public, pg_temp'\]::text\[\]/);
  assert.doesNotMatch(sql, /\bALTER FUNCTION[^;]*SECURITY DEFINER\b/i);
});


const invokerFunctions = ['get_pipeline_snapshot', 'get_reengaged_workspace_v2',
  'get_tracking_workspace'];
const globalAudit = fs.readFileSync(path.resolve(__dirname,
  '../../docs/sql/r2-staging-postinstall-global-anon-function-audit-v1.sql'), 'utf8');

test('three invoker RPC grants are changed without changing authenticated or service roles', () => {
  const statements = [...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(\) FROM PUBLIC, anon;$/gm)]
    .filter(x => invokerFunctions.includes(x[1]));
  assert.equal(statements.length, 3);
  assert.deepEqual(statements.map(x => x[1]).sort(), [...invokerFunctions].sort());
  assert.match(sql, /BLOCKED_R2_PUBLIC_INVOKER_FUNCTION_CONTRACT_MISMATCH/);
  assert.match(sql, /BLOCKED_R2_PUBLIC_INVOKER_POSTFLIGHT_FAILED/);
  const pre = sql.slice(0, sql.indexOf('-- Revoke inherited PUBLIC'));
  const post = sql.slice(sql.lastIndexOf('\nDO '));
  assert.match(pre, /pg_catalog\.pg_get_function_identity_arguments\(p\.oid\)=''/);
  assert.match(pre, /NOT p\.prosecdef/);
  assert.match(pre, /pg_catalog\.has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.match(pre, /pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(post, /NOT pg_catalog\.has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
  for (const name of invokerFunctions) {
    assert.ok(pre.includes("'" + name + "'"), 'preflight missing ' + name);
    assert.ok(post.includes("'" + name + "'"), 'postflight missing ' + name);
  }
  const revokes = [...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\([^;\n]*\) FROM PUBLIC, anon(?:, authenticated)?;$/gm)];
  assert.equal(revokes.length, 25);
});

test('all-public-functions audit catches anon EXECUTE on invokers and definers', () => {
  assert.match(globalAudit, /PUBLIC_FUNCTION_EXECUTE_CATALOG_PASS_NOT_E2E/);
  assert.match(globalAudit, /PUBLIC_FUNCTION_EXECUTE_REVIEW_REQUIRED/);
  assert.match(globalAudit, /o\.anon_callable_functions=0/);
  assert.match(globalAudit, /i\.expected_invokers=3/);
  assert.match(globalAudit, /i\.anon_executable_expected_invokers=0/);
  assert.match(globalAudit, /'tenant_e2e_verified',false/);
  assert.match(globalAudit, /'authorized_to_release',false/);
  for (const name of invokerFunctions) assert.ok(globalAudit.includes("'" + name + "'"));
  assert.doesNotMatch(globalAudit, /^\s*(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|DO|TRUNCATE)\b/im);
  assert.doesNotMatch(globalAudit, /(?:auth\.users|public\.leads|public\.messages|supabase\.co|https?:\/\/)/i);
});

test('no project refs, endpoints, customer records or provider secrets appear in patch', () => {
  assert.doesNotMatch(sql, /(?:ndxpjqkthuzxlmbenxti|doaozrkrtgeslddwhclj|wunnbqjvfzmawubglyhe)/i);
  assert.doesNotMatch(sql, /(?:https?:\/\/|supabase\.co|bearer |service_role[_-]?key|sb_secret_|(?:^|[^a-z0-9_])sk_[a-z0-9])/im);
  assert.doesNotMatch(sql, /\b(?:auth\.users|public\.leads|public\.messages)\b/i);
});

const audit = fs.readFileSync(path.resolve(__dirname,
  '../../docs/sql/r2-staging-postinstall-function-role-parity-audit-v1.sql'), 'utf8');

test('read-only SQL gate verifies 24 exact function signatures and four fixed paths', () => {
  const rows = [...audit.matchAll(/^\s+\('([a-z0-9_]+)', '([^']*)', false, (true|false), (true|false)\),?$/gm)];
  assert.equal(rows.length, 24, '24 exact function role contracts');
  const names = rows.map(x => x[1]);
  assert.equal(new Set(names).size, 24);
  assert.deepEqual(rows.filter(x => x[4] === 'false').map(x => x[1]),
    ['approve_sales_asset_v1']);
  assert.match(audit, /human_guard_ok/);
  assert.match(audit, /'human_only_approval_guard_required',true/);
  assert.deepEqual(names.slice(0,22).sort(), [...expected].sort());
  assert.deepEqual(names.slice(22).sort(),
    ['prepare_failed_whatsapp_provider_retry_v1', 'approve_sales_asset_v1'].sort());
  const authorized = rows.filter(x => x[3] === 'true').map(x => x[1]).sort();
  assert.deepEqual(authorized,
    ['attach_whatsapp_outbound_message_id', 'approve_sales_asset_v1'].sort());

  const changes = [...sql.matchAll(/^REVOKE EXECUTE ON FUNCTION public\.([a-z0-9_]+)\(([^\n;]*)\) FROM PUBLIC, anon(?:, authenticated)?;$/gm)].filter(x => expected.includes(x[1]));
  for (const change of changes) {
    assert.ok(rows.some(x => x[1] === change[1] && x[2] === change[2]),
      'matching exact signature in read-only audit: ' + change[1]);
  }

  const paths = [...audit.matchAll(/^\s+\('([a-z0-9_]+)', '[^']*', 'search_path=public, pg_temp'\),?$/gm)];
  assert.equal(paths.length, 4);
  assert.deepEqual(paths.map(x => x[1]).sort(), [...searchPathFunctions].sort());
  assert.match(audit, /pg_catalog\.pg_get_function_identity_arguments\(p\.oid\)=e\.identity_args/);
});

test('read-only parity gate refuses acceptance when any role or path differs', () => {
  assert.match(audit, /FUNCTION_STAGE_POLICY_REVIEW_REQUIRED/);
  assert.match(audit, /FUNCTION_STAGE_POLICY_CATALOG_PASS_NOT_TENANT_ACCEPTANCE/);
  assert.match(audit, /f\.role_mismatched_functions=0/);
  assert.match(audit, /f\.structural_mismatches=0/);
  assert.match(audit, /p\.valid_paths=4/);
  assert.match(audit, /'tenant_acceptance_verified',false/);
  assert.match(audit, /'release_authorized',false/);
  assert.doesNotMatch(audit, /^\s*(?:GRANT|REVOKE|ALTER|CREATE|DROP|INSERT|UPDATE|DELETE|TRUNCATE|DO)\b/im);
  assert.doesNotMatch(audit, /(?:auth\.users|public\.leads|public\.messages|supabase\.co|https?:\/\/)/i);
});
