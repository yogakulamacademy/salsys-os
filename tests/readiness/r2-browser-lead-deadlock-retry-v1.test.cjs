const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const helperSource = fs.readFileSync(path.join(root, 'lib/website-leads/deadlock-retry.ts'), 'utf8');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, setTimeout }, { filename: 'deadlock-retry.js' });
const { retryWebsiteLeadIngestDeadlock } = exportsObject;

const deadlock = { data: null, error: { code: '40P01', message: 'deadlock detected' } };
const success = { data: { lead_id: 'synthetic-lead' }, error: null };

test('returns a successful first RPC without retry or sleep', async () => {
  let calls = 0; const sleeps = [];
  const got = await retryWebsiteLeadIngestDeadlock(async () => { calls++; return success; },
    async (ms) => sleeps.push(ms));
  assert.equal(got, success); assert.equal(calls, 1); assert.deepEqual(sleeps, []);
});

test('retries exactly once on PostgreSQL 40P01, preserving invocation closure', async () => {
  const attempts = []; const sleeps = [];
  const sameEventId = 'synthetic-event-123';
  const got = await retryWebsiteLeadIngestDeadlock(async () => {
    attempts.push(sameEventId);
    return attempts.length === 1 ? deadlock : success;
  }, async (ms) => sleeps.push(ms));
  assert.equal(got, success); assert.deepEqual(attempts, [sameEventId, sameEventId]);
  assert.deepEqual(sleeps, [35]);
});

test('exhausted deadlock returns second error without an unbounded loop', async () => {
  let calls = 0;
  const got = await retryWebsiteLeadIngestDeadlock(async () => { calls++; return deadlock; }, async () => {});
  assert.equal(got, deadlock); assert.equal(calls, 2);
});

test('other SQL errors and network failures are never retried', async () => {
  for (const code of ['23505', '42501', '57014', 'PGRST116', undefined]) {
    let calls = 0;
    const rejected = { data: null, error: { code, message: 'other failure' } };
    const got = await retryWebsiteLeadIngestDeadlock(async () => { calls++; return rejected; },
      async () => { throw Error('no delay expected'); });
    assert.equal(got, rejected); assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(() => retryWebsiteLeadIngestDeadlock(async () => {
    calls++; throw Error('transport failure');
  }, async () => {}), /transport failure/);
  assert.equal(calls, 1);
});

test('the browser route scopes retries strictly to the ingest RPC', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/leads/browser/v1/route.ts'), 'utf8');
  assert.match(route, /retryWebsiteLeadIngestDeadlock\(\(\)\s*=>\s*admin\.rpc\(\s*'ingest_website_lead_for_organization'/);
  assert.match(route, /p_external_event_id:\s*payload\.externalEventId/);
  assert.match(route, /if \(error\) throw new Error\(error\.message\)/);
  assert.equal((route.match(/retryWebsiteLeadIngestDeadlock\(/g) || []).length, 1);
});
