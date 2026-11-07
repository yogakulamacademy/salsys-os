import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, imports = {}) {
  const output = {};
  const compiled = ts.transpileModule(readFileSync(resolve(path), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require','exports','process',compiled)((name) => {
    if (!(name in imports)) throw Error('Unapproved dependency: ' + name);
    return imports[name];
  }, output, process);
  return output;
}
const org = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const text = 'SYNTHETIC TEST ONLY. This notice is not legally approved and does not permit any website crawl.';
const sha = createHash('sha256').update(text, 'utf8').digest('hex');
const doc = {
  ok: true, policyVersion: 'synthetic-review-v1',
  policySha256: sha, policyText: text,
  sourceReference: 'fixture:operator-review', recordedAt: '2026-11-07T01:00:00.000Z',
  registryRecordedAt: '2026-11-07T02:00:00.000Z',
};
let loggedIn = true, admin = true, data = doc, rpcError = null;
let calls = [];
const client = () => ({
  auth: {
    getUser: async () => ({ data: { user: loggedIn ? { id: owner } : null }, error: null }),
  },
  rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'can_manage_organization') return { data: admin, error: null };
    if (name === 'get_knowledge_discovery_policy_preview_v1')
      return { data, error: rpcError };
    throw Error('Unexpected RPC ' + name);
  },
});
const NextResponse = { json: (body, options = {}) => ({
  body, status: options.status ?? 200, headers: options.headers ?? {},
}) };
const routes = load('app/api/knowledge/discovery/policy/route.ts', {
  'node:crypto': { createHash },
  'next/server': { NextResponse },
  '@/lib/supabase/server': { createClient: async () => client() },
  '@/lib/workspace': { requireCurrentOrganizationId: async () => org },
});
const key = 'KNOWLEDGE_DISCOVERY_POLICY_REVIEW_ENABLED';
const saved = process.env[key];
test.after(() => { saved === undefined ? delete process.env[key] : process.env[key] = saved; });
function reset() {
  delete process.env[key];
  loggedIn = true; admin = true; data = doc; rpcError = null; calls = [];
}

test('KB-06E: defaults OFF without calling unapplied preview RPC', async () => {
  reset();
  const result = await routes.GET();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, reviewEnabled: false, available: false });
  assert.deepEqual(calls.map(x => x.name), ['can_manage_organization']);
  assert.equal(result.headers['Cache-Control'], 'no-store');
});
test('KB-06E: unauthenticated and non-admin denied even when flag is OFF', async () => {
  reset(); loggedIn = false;
  assert.equal((await routes.GET()).status, 403);
  assert.deepEqual(calls, []);
  loggedIn = true; admin = false;
  assert.equal((await routes.GET()).status, 403);
  assert.equal(calls.length, 1);
});
test('KB-06E: separate read flag cannot activate consent grant or mutation', async () => {
  reset(); process.env[key] = 'true';
  const res = await routes.GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.available, true);
  assert.equal(res.body.reviewEnabled, true);
  assert.equal(res.body.policyText, text);
  assert.equal(res.body.policySha256, sha);
  assert.deepEqual(calls, [
    { name: 'can_manage_organization', args: { p_organization_id: org } },
    { name: 'get_knowledge_discovery_policy_preview_v1', args: { p_organization_id: org } },
  ]);
  assert.equal(routes.POST, undefined, 'No grant or approval endpoint exists');
  assert.equal(routes.DELETE, undefined, 'No policy deletion endpoint exists');
});
test('KB-06E: missing registered policy never renders an empty approval', async () => {
  reset(); process.env[key] = 'true';
  data = { ok: false, reason: 'policy_not_registered_or_mismatch' };
  const r = await routes.GET();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, reviewEnabled: true, available: false });
});
test('KB-06E: incorrect digest, unbounded payload, missing provenance or bad date fail closed', async () => {
  reset(); process.env[key] = 'true';
  const bad = [
    { ...doc, policySha256: '0'.repeat(64) },
    { ...doc, policyText: 'short' },
    { ...doc, policyText: text.repeat(200) },
    { ...doc, sourceReference: '' },
    { ...doc, policyVersion: '' },
    { ...doc, recordedAt: 'invalid' },
    { ...doc, policySha256: 'not a digest' },
  ];
  for (const value of bad) {
    data = value;
    const result = await routes.GET();
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    assert.equal('policyText' in result.body, false);
  }
});
test('KB-06E: database/session rejection cannot become an approved policy preview', async () => {
  reset(); process.env[key] = 'true';
  rpcError = { code: '42501' };
  const r = await routes.GET();
  assert.equal(r.status, 403);
  assert.equal(r.body.ok, false);
  assert.equal('policyText' in r.body, false);
});
