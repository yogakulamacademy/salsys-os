const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('revenue cash panel: user client (RLS) scoped to the business, shown on Revenue', () => {
  const data = read('lib/revenue-cash-data.ts');
  assert.match(data, /\.eq\("organization_id", organizationId\)/);
  assert.doesNotMatch(data, /createAdminClient/);
  const page = read('app/revenue/page.tsx');
  assert.match(page, /<RevenueCashPanel summary=\{cash\} \/>/);
  assert.match(page, /requireCurrentOrganizationId\(supabase, user\.id\)/);
});
