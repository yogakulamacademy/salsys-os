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
