const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('home story: team members only see their own leads; Home keeps every existing panel', () => {
  const data = read('lib/home-story-data.ts');
  assert.match(data, /if \(isAdmin !== true\) q = q\.eq\("owner_user_id", auth\.user\.id\)/);
  assert.match(data, /requireCurrentOrganizationId\(supabase, auth\.user\.id\)/);
  const home = read('app/home/page.tsx');
  for (const panel of ['<LocationsPanel', '<SourceQualityPanel', '<PipelineHealthPanel', 'title="Action queue"', 'id="home-money"', '<HomeTodayStrip', '<GoingColdPanel', '<WinBackPanel', '<MessageHoursPanel']) {
    assert.ok(home.includes(panel), panel);
  }
});
