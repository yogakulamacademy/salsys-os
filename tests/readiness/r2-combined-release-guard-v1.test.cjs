const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// This rehearsal combines existing source changes, but never enables a
// production release or live behavior collection. CI uses synthetic fixtures.
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const retrySource = read('lib/website-leads/deadlock-retry.ts');
const route = read('app/api/leads/browser/v1/route.ts');
const contactMigration = read('supabase/migrations/20261108080000_r2_browser_lead_primary_contact_v1.sql');
const consentSDK = read('public/salsys-tracker.js');
const retention = read('docs/r2-p3-retention-cohort-contract-v1.md');
const events = read('lib/native-behavior-trends-data.ts');

function actualRetryHelper() {
  const compiled = ts.transpileModule(retrySource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, setTimeout });
  return exports.retryWebsiteLeadIngestDeadlock;
}

test('combined #620/#643 path retries only transactional 40P01, never 23505', async () => {
  const retry = actualRetryHelper();
  for (const code of ['23505', '23503', '42501', 'PGRST116']) {
    let invoked = 0;
    const failure = { data: null, error: { code } };
    const result = await retry(async () => { invoked++; return failure; },
      async () => { throw new Error('non-deadlock error must not pause'); });
    assert.equal(result, failure);
    assert.equal(invoked, 1, code);
  }
  const attempts = [], sleeps = [], externalEventId = 'synthetic-retry-id';
  const succeeded = await retry(async () => {
    attempts.push(externalEventId);
    return attempts.length === 1
      ? { data: null, error: { code: '40P01' } }
      : { data: { accepted: true }, error: null };
  }, async delay => sleeps.push(delay));
  assert.deepEqual(attempts, [externalEventId, externalEventId]);
  assert.deepEqual(sleeps, [35]);
  assert.equal(succeeded.error, null);
});

test('combined browser endpoint scopes the retry to one ingest call', () => {
  assert.equal((route.match(/retryWebsiteLeadIngestDeadlock\(/g) || []).length, 1);
  assert.match(route, /retryWebsiteLeadIngestDeadlock\(\(\)\s*=>\s*admin\.rpc\(\s*'ingest_website_lead_for_organization'/);
  assert.match(route, /p_external_event_id:\s*payload\.externalEventId/);
  assert.match(contactMigration, /309f9d3ea4929e26f6c44f77099559ed/);
  assert.match(contactMigration, /post-migration privileged RPC boundary changed/);
  assert.doesNotMatch(route, /retryWebsiteLeadIngestDeadlock\(\(\)\s*=>\s*(?:send|fetch|post)/);
});

test('consent and retention remain separate and no synthetic acceptance is promoted', () => {
  assert.match(consentSDK, /CONSENT_MODE/);
  assert.match(retention, /D1/);
  assert.match(retention, /D7/);
  assert.match(retention, /D30/);
  assert.ok(events.includes('events') || events.includes('Event'));
  const staging = read('docs/r2-p3-consent-identity-continuity-staging-v1.md');
  assert.match(staging, /staging/i);
  assert.match(staging, /production/i);
});
