const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('CRM menu: duplicates removed, Data Quality under Settings, badges admin-only', () => {
  const crm = read('components/crm/crm-navigation.tsx');
  for (const gone of ["label: 'Sales Overview'", "label: 'Today'", "label: 'Pipeline'", "label: 'Payment Pending'", "label: 'Aging Alerts'", "label: 'Data Quality'"]) {
    assert.ok(!crm.includes(gone), gone);
  }
  assert.match(crm, /label: 'Pipeline & admissions'/);
  assert.match(crm, /label: 'Say they paid'/);
  // Owner-approved mockups: tabs across the top instead of the side menu.
  assert.match(read('components/crm/crm-workspace-frame.tsx'), /<CrmTabs \/>/);
  const nav = read('lib/navigation.ts');
  assert.match(nav, /label: "Data Quality",\s*href: "\/data-quality"/);
  const route = read('app/api/crm/nav-counts/route.ts');
  assert.match(route, /if \(isAdmin !== true\) return NextResponse\.json\(\{ ok: true, counts: null \}/);
  assert.match(route, /\.eq\("organization_id", organizationId\)/);
});
