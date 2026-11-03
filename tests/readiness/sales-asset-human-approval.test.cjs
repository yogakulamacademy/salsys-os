const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../supabase/migrations/20261103195300_sales_asset_human_approval_guard_v1.sql',
  ),
  'utf8',
);

test('sales asset approval requires a signed-in organization admin', () => {
  assert.match(migration, /auth\.role\(\) <> 'authenticated'/);
  assert.match(migration, /v_actor is null/);
  assert.match(migration, /not public\.can_manage_organization\(p_organization_id\)/);
  assert.match(migration, /Expired sales assets cannot be approved/);
  assert.match(
    migration,
    /revoke execute on function public\.approve_sales_asset_v1\(uuid, uuid, boolean\) from public, anon, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.approve_sales_asset_v1\(uuid, uuid, boolean\) to authenticated/,
  );
});
