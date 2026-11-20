const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (p) => fs.readFileSync(p, 'utf8');

test('interest profile reads are scoped to the business and to visible leads', () => {
  const data = read('lib/interest-profile-data.ts');
  assert.match(data, /import "server-only"/);
  const reads = data.match(/admin\.from\("[a-z_]+"\)/g) || [];
  const scoped = data.match(/\.eq\("organization_id", organizationId\)/g) || [];
  assert.ok(reads.length > 0 && scoped.length >= reads.length, 'every admin read filters by organization_id');
  assert.doesNotMatch(data, /select\([^)]*\b(email|phone)\b/, 'never reads contact details from event payloads');
});

test('Customer 360 passes only leads the user can already see', () => {
  const page = read('app/customer-360/[personId]/page.tsx');
  assert.match(page, /getInterestProfile\(admin, organizationId, accessibleIds\)/);
  assert.match(page, /<InterestProfileCard profile=\{interestProfile\} \/>/);
});

test('Customer 360 loads only this person\'s leads, so older contacts open too', () => {
  const page = read('app/customer-360/[personId]/page.tsx');
  assert.match(page, /getLeads\(\{ ids: linkedLeadIds \}\)/);
  assert.doesNotMatch(page, /getLeads\(\)/);
  const data = read('lib/data.ts');
  assert.match(data, /query = query\.in\("id", options\.ids\.slice\(0, 200\)\)/);
});

test('person summary is read after the access check, scoped, and never fatal', () => {
  const page = read('app/customer-360/[personId]/page.tsx');
  const access = page.indexOf('if (!accessibleLeads.length) notFound();');
  const viewRead = page.indexOf('admin\n        .from("v_person_360_operational")');
  assert.ok(access > 0 && viewRead > access, 'view read happens after the access check');
  assert.match(page.slice(viewRead, viewRead + 600), /\.eq\("organization_id", organizationId\)\s*\.eq\("person_id", personId\)/);
  assert.doesNotMatch(page, /Unable to load customer relationship summary/);
});

test('Re-engaged intelligence: every admin read is scoped to the business', () => {
  for (const file of ['lib/reengaged-intelligence-data.ts', 'lib/interest-profile-data.ts']) {
    const src = read(file);
    const reads = (src.match(/admin\.from\("[a-z_]+"\)/g) || []).length;
    const scoped = (src.match(/\.eq\("organization_id", organizationId\)/g) || []).length;
    assert.ok(reads > 0 && scoped >= reads, `${file}: ${scoped} scoped of ${reads} reads`);
  }
  assert.match(read('lib/reengaged-intelligence-data.ts'), /requireCurrentOrganizationId\(supabase, user\.id\)/);
});

test('Re-engaged page shows Act now, coverage and interest, and never offers discounts itself', () => {
  const page = read('app/re-engaged/page.tsx');
  assert.match(page, /<ActNow leads=\{actNow\} \/>/);
  assert.match(page, /<TrackingCoverage /);
  assert.match(page, /<InterestBadge profile=/);
  const card = read('components/reengaged-act-now.tsx');
  assert.doesNotMatch(card, /payment link|Approve & send/i);
});
