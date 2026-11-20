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
  // Owner-approved Leads mockup: story sentence, four action cards, stage strip.
  assert.match(page, /<LeadsOverview summary=\{workspace\.summary\} story=\{story\} stages=\{stages\} activeStage=\{filters\.stage\} \/>/);
  assert.match(page, /<LeadsSaysPaid story=\{story\} \/>/);
  assert.match(page, /leadsStory\(\{/);
  const ov = read('components/leads/leads-overview.tsx');
  assert.match(ov, /id="says-paid"/);
  assert.match(ov, /aria-label="Do this now"/);
  assert.match(ov, /Where your \{fmt\(open\)\} open leads are/);
});

test('leads: stage counts use the user\'s own client, scoped to their business', () => {
  const src = read('lib/leads-stage-counts.ts');
  assert.match(src, /const supabase = await createClient\(\)/);
  assert.match(src, /\.eq\("organization_id", organizationId\)/);
  assert.doesNotMatch(src, /createAdminClient/);
});

test('leads: new views exist in the list function and the app', () => {
  const sql = read('supabase/migrations/20261120233000_leads_views_qualified_set_aside_v1.sql');
  assert.match(sql, /qualified_up/);
  assert.match(sql, /set_aside/);
  const data = read('lib/leads-data.ts');
  assert.match(data, /"qualified_up",\s*"set_aside",/);
  const table = read('components/leads-clean-table.tsx');
  assert.match(table, /\{ key: "qualified_up", label: "Qualified & up"/);
  assert.match(table, /\{ key: "set_aside", label: "Not now \/ Lost"/);
  assert.match(table, /href: "\/conversations\?filter=waiting"/);
});
