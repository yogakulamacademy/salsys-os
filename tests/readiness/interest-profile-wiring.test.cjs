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
  assert.match(page, /getInterestProfile\(createAdminClient\(\), organizationId, accessibleIds\)/);
  assert.match(page, /<InterestProfileCard profile=\{interestProfile\} \/>/);
});

test('Customer 360 loads only this person\'s leads, so older contacts open too', () => {
  const page = read('app/customer-360/[personId]/page.tsx');
  assert.match(page, /getLeads\(\{ ids: linkedLeadIds \}\)/);
  assert.doesNotMatch(page, /getLeads\(\)/);
  const data = read('lib/data.ts');
  assert.match(data, /query = query\.in\("id", options\.ids\.slice\(0, 200\)\)/);
});
