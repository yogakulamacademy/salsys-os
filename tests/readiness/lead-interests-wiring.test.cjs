const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('interests: secret-protected scan every 10 minutes; team value never overwritten', () => {
  const route = read('app/api/leads/interests/scan/route.ts');
  assert.match(route, /bearerMatchesAnySecret\(request\.headers\.get\("authorization"\), \[cronSecret\]\)/);
  assert.ok(JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/leads/interests/scan'));
  assert.match(read('middleware.ts'), /"\/api\/leads\/interests\/scan"/);
  const data = read('lib/lead-interests-data.ts');
  assert.match(data, /const manualValue = lead\.potential_value != null && lead\.potential_value_source && !String\(lead\.potential_value_source\)\.startsWith\("course_price"\)/);
  const sql = read('supabase/migrations/20261119160000_lead_course_interests_and_prices_v1.sql');
  assert.match(sql, /revoke insert, update, delete on public\.lead_course_interests from anon, authenticated/);
  const action = read('app/conversations/interest-actions.ts');
  assert.match(action, /rpc\("can_work_lead", \{ p_lead_id: leadId \}\)/);
});
