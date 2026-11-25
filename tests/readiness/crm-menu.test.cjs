const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('CRM menu: duplicates removed, Data quality a CRM tab for admins only, badges admin-only', () => {
  const crm = read('components/crm/crm-navigation.tsx');
  for (const gone of ["label: 'Sales Overview'", "label: 'Today'", "label: 'Pipeline'", "label: 'Payment Pending'", "label: 'Aging Alerts'", "label: 'Data Quality'"]) {
    assert.ok(!crm.includes(gone), gone);
  }
  assert.match(crm, /label: 'Pipeline & admissions'/);
  assert.match(crm, /label: 'Say they paid'/);
  // Owner-approved mockups: tabs across the top instead of the side menu.
  assert.match(read('components/crm/crm-workspace-frame.tsx'), /<CrmTabs \/>/);
  // Data quality: a CRM tab for admins only (25 Nov 2026), no longer in Settings.
  assert.match(crm, /href: '\/data-quality', label: 'Data quality', icon: ShieldCheck, adminOnly: true/);
  const nav = read('lib/navigation.ts');
  assert.doesNotMatch(nav, /label: "Data Quality"/);
  assert.match(nav, /label: "Data quality",\s*href: "\/data-quality"/);
  assert.match(read('app/data-quality/layout.tsx'), /can_manage_organization[\s\S]*redirect\('\/leads'\)[\s\S]*<CrmWorkspaceFrame>/);
  const route = read('app/api/crm/nav-counts/route.ts');
  assert.match(route, /if \(isAdmin !== true\) return NextResponse\.json\(\{ ok: true, counts: null, isAdmin: false \}/);
  assert.match(route, /\.eq\("organization_id", organizationId\)/);
});
