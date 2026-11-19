const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('location scan: secret-protected cron, registered, never fed to the AI reply prompt', () => {
  const route = read('app/api/leads/location/scan/route.ts');
  assert.match(route, /bearerMatchesAnySecret\(request\.headers\.get\("authorization"\), \[cronSecret\]\)/);
  assert.ok(JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/leads/location/scan'));
  assert.match(read('middleware.ts'), /"\/api\/leads\/location\/scan"/);
  for (const f of ['lib/copilot-core.ts', 'lib/ai-autopilot-runner.ts']) {
    if (fs.existsSync(path.join(__dirname, '..', '..', f))) assert.doesNotMatch(read(f), /lead-location/);
  }
});
