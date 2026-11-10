const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const proposal = fs.readFileSync(path.resolve(__dirname,
  '../../docs/sql/r2-staging-automation-tenant-guard-review-v1.sql'), 'utf8');
const audit = fs.readFileSync(path.resolve(__dirname,
  '../../docs/sql/r2-automation-tenant-guard-catalog-audit-v1.sql'), 'utf8');
const allTables = [
  'automation_events', 'automation_runs', 'automation_enrollments',
  'automation_suppressions', 'automation_scheduled_jobs',
  'automation_variables', 'automation_wait_states',
];

test('R2 automation guard is REVIEW-ONLY, transactional, stage-first and fail-closed', () => {
  assert.match(proposal, /DO NOT APPLY FROM docs\/sql/);
  assert.match(proposal, /^BEGIN;$/m);
  assert.match(proposal, /^COMMIT;$/m);
  assert.match(proposal, /^SET LOCAL lock_timeout = '5s';$/m);
  assert.match(proposal, /^SET LOCAL statement_timeout = '30s';$/m);
  assert.equal((proposal.match(/^CREATE OR REPLACE FUNCTION /gm) || []).length, 1);
  assert.match(proposal, /CREATE OR REPLACE FUNCTION public\.enforce_automation_tenant_alignment_v1\(\)/);
  assert.match(proposal, /md5\(p\.prosrc\)='24a1a0b5237884945c67992ef4dc102e'/);
  assert.match(proposal, /BLOCKED_R2_AUTOMATION_GUARD_SOURCE_OR_ACL_MISMATCH/);
  assert.match(proposal, /BLOCKED_R2_AUTOMATION_TRIGGER_TABLE_CONTRACT_MISMATCH/);
  assert.match(proposal, /BLOCKED_R2_AUTOMATION_GUARD_POSTFLIGHT_FAILED/);
  assert.doesNotMatch(proposal, /^(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE TRIGGER)\b/im);
  assert.doesNotMatch(proposal, /(?:pg_net|net\.http|http_post|invoke_function|send_message|customer_message_sent|call provider)/i);
});

test('all seven automation trigger tables and tenant constraints are required', () => {
  const preflight = proposal.slice(proposal.indexOf('DO $r2_preflight$'),
    proposal.indexOf('$r2_preflight$;'));
  const body = proposal.slice(proposal.indexOf('CREATE OR REPLACE FUNCTION'),
    proposal.indexOf('$function$;'));
  for (const table of allTables) {
    assert.ok(preflight.includes("'" + table + "'"), 'missing preflight ' + table);
    assert.ok(body.includes("'" + table + "'"), 'missing body whitelist ' + table);
    assert.ok(audit.includes("'" + table + "'"), 'missing audit ' + table);
  }
  assert.match(proposal, /t\.tgfoid='public\.enforce_automation_tenant_alignment_v1\(\)'::regprocedure/);
  assert.match(proposal, /c\.relrowsecurity/);
  assert.match(proposal, /FOREIGN KEY \(lead_id\) REFERENCES leads\(id\)/);
  assert.match(proposal, /\(t\.tgtype & 1\)=1/);
  assert.match(proposal, /\(t\.tgtype & 2\)=2/);
  assert.match(proposal, /\(t\.tgtype & 4\)=4/);
  assert.match(proposal, /\(t\.tgtype & 16\)=16/);
});

test('every non-null lead/conversation/message is verified against the declared tenant', () => {
  assert.match(proposal, /v_new jsonb := to_jsonb\(new\)/);
  assert.match(proposal, /TG_TABLE_SCHEMA <> 'public'/);
  assert.match(proposal, /TG_OP NOT IN \('INSERT','UPDATE'\)/);
  assert.match(proposal, /new\.organization_id IS NULL/);
  for (const [variable,relation] of [
    ['v_lead_id','leads'], ['v_conversation_id','conversations'],
    ['v_message_id','messages'],
  ]) {
    assert.ok(proposal.includes("v_" + variable.slice(2) +
      " := nullif(v_new->>'" + relation.slice(0,-1) + "_id', '')::uuid") ||
      proposal.includes(variable + " := nullif(v_new->>'" +
        (relation === 'leads' ? 'lead_id' : relation === 'conversations' ? 'conversation_id' : 'message_id') + "', '')::uuid"));
    assert.match(proposal, new RegExp('IF ' + variable + ' IS NOT NULL THEN'));
    assert.match(proposal, new RegExp('FROM public\\.' + relation + ' WHERE id=' + variable));
  }
  assert.equal((proposal.match(/v_org IS NULL OR v_org <> new\.organization_id/g)||[]).length, 3);
  assert.match(proposal, /RETURN new;/i);
});

test('function EXECUTE privileges remain restricted while schema stays isolated', () => {
  assert.match(proposal, /NOT pg_catalog\.has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
  assert.match(proposal, /NOT pg_catalog\.has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.match(proposal, /pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(proposal, /p\.prosecdef/);
  assert.match(proposal, /pg_catalog\.pg_get_userbyid\(p\.proowner\)='postgres'/);
  assert.match(proposal, /search_path=public, auth, pg_temp/);
  assert.doesNotMatch(proposal, /(?:auth\.users|storage\.objects|public\.messages\s+UPDATE|https?:\/\/|supabase\.co)/i);
});

test('independent metadata audit denies E2E and release claims', () => {
  assert.match(audit, /AUTOMATION_TENANT_GUARD_REVIEW_REQUIRED/);
  assert.match(audit, /AUTOMATION_TENANT_GUARD_METADATA_PASS_NOT_E2E/);
  assert.match(audit, /s\.attached_triggers=7/);
  assert.match(audit, /s\.structural_tables=7/);
  assert.match(audit, /'two_tenant_negative_test_witnessed',false/);
  assert.match(audit, /'staging_migration_approved',false/);
  assert.match(audit, /'release_authorized',false/);
  assert.doesNotMatch(audit, /^\s*(?:CREATE|ALTER|GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE|DO|EXECUTE|TRUNCATE)\b/im);
});
