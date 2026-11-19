const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('stage automation: secret-protected cron, off unless switched on', () => {
  const route = read('app/api/leads/stages/scan/route.ts');
  assert.match(route, /bearerMatchesAnySecret\(request\.headers\.get\("authorization"\), \[cronSecret\]\)/);
  assert.match(route, /if \(mode === "off"\)/);
  assert.ok(JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/leads/stages/scan'));
  assert.match(read('middleware.ts'), /"\/api\/leads\/stages\/scan"/);
});

test('stage automation: moves go through set_lead_stage with history and leave evidence', () => {
  const data = read('lib/lead-stages-data.ts');
  assert.match(data, /rpc\("set_lead_stage", \{/);
  assert.match(data, /p_changed_by_type: "ai"/);
  assert.match(data, /activity_type: "ai_stage_move"/);
  assert.match(data, /if \(mode === "live" && decision\.action === "move"\)/);
  assert.doesNotMatch(data, /closed_won"\s*\}/);
});
