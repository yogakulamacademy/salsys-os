const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('started batches are closed daily, logged, and never deleted', () => {
  const route = read('app/api/course-batches/close-started/route.ts');
  assert.match(route, /bearerMatchesAnySecret\(request\.headers\.get\("authorization"\), \[cronSecret\]\)/);
  assert.match(route, /update\(\{ local_enabled: false, metadata \}\)/);
  assert.match(route, /action: "batch_auto_closed_started"/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.ok(JSON.parse(read('vercel.json')).crons.some((c) => c.path === '/api/course-batches/close-started' && c.schedule === '40 18 * * *'));
  assert.match(read('middleware.ts'), /"\/api\/course-batches\/close-started"/);
});
