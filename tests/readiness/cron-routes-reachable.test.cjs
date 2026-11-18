const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

// Vercel cron requests carry no user session: the middleware must let these
// through, and each route must check CRON_SECRET itself.
test('Sales AI and Instagram history cron routes are reachable and secret-protected', () => {
  const middleware = read('middleware.ts');
  const crons = JSON.parse(read('vercel.json')).crons.map((c) => c.path);
  for (const route of ['/api/ai/followup-detection', '/api/ai/knowledge-proposals', '/api/ai/autopilot', '/api/instagram/history-sync']) {
    assert.ok(crons.includes(route), route + ' scheduled');
    assert.ok(middleware.includes(`"${route}"`), route + ' public in middleware');
    const file = read('app' + route + '/route.ts');
    assert.match(file, /CRON_SECRET/, route + ' checks CRON_SECRET');
    assert.match(file, /bearerMatchesAnySecret/, route + ' uses bearer secret check');
  }
});
