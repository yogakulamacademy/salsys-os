const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('leads: extra table facts only for the page ids from the read model, in the user business', () => {
  const ev = read('lib/leads-table-evidence.ts');
  assert.match(ev, /const ids = leads\.map\(\(lead\) => lead\.id\)/);
  for (const m of ev.match(/admin\.from\("[a-z_]+"\)[\s\S]*?;/g)) {
    assert.match(m, /organization_id", organizationId\)/);
    assert.match(m, /\.in\("(lead_id|id)", ids\)/);
  }
});

test('leads: story overview and says-paid panel', () => {
  const page = read('app/leads/page.tsx');
  assert.match(page, /<LeadsOverview summary=\{workspace\.summary\} story=\{story\} \/>/);
  const ov = read('components/leads/leads-overview.tsx');
  assert.match(ov, /id="says-paid"/);
  assert.match(ov, /const ownersInUse = summary\.unassigned < summary\.all/);
});
