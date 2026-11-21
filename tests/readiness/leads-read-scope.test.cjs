const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('leads read rule: same checks as can_access_lead, once per query', () => {
  const sql = read('supabase/migrations/20261121080000_leads_read_scope_initplan_v1.sql');
  // Scope function keeps every check from can_access_lead.
  for (const needle of [
    "auth.role() <> 'authenticated'",
    'public.current_tenant_organization_id()',
    "o.status = 'active'",
    'om.active = true',
    "ow.workspace_code = 'sales' and ow.enabled = true",
    "v_org_role in ('owner', 'admin')",
    "wm.workspace_code = 'sales' and wm.user_id = v_uid and wm.active = true",
    "v_role in ('owner', 'admin', 'manager', 'member')",
  ]) assert.ok(sql.includes(needle), needle);
  // Evaluated once per query (init plans), members see only their own leads.
  assert.match(sql, /organization_id = \(select public\.lead_scope_org\(\)\)/);
  assert.match(sql, /\(select public\.lead_scope_role\(\)\) in \('owner', 'admin', 'manager'\)\s*or owner_user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on function public\.lead_scope_role\(\) from public, anon/);
});

test('read rules use the visible-leads check; write rules keep can_access_lead', () => {
  const sql = read('supabase/migrations/20261121083000_read_policies_use_visible_leads_v1.sql');
  assert.match(sql, /cmd = 'SELECT' and qual like '%can_access_lead\(%'/);
  assert.match(sql, /\(\\1 IN \(SELECT visible_lead\.id FROM public\.leads visible_lead\)\)/);
  assert.match(sql, /raise exception 'Could not rewrite/);
  assert.doesNotMatch(sql, /cmd in \(|cmd = 'UPDATE'|cmd = 'DELETE'|cmd = 'ALL'/);
});

test('read rules list the user\'s businesses once per query', () => {
  const sql = read('supabase/migrations/20261121084500_read_policies_member_orgs_initplan_v1.sql');
  assert.match(sql, /public\.session_is_bound_to_organization\(om\.organization_id\)/);
  assert.match(sql, /om\.active = true/);
  assert.match(sql, /qual like '%visible_lead%'/);
  assert.match(sql, /cmd = 'SELECT'/);
});
