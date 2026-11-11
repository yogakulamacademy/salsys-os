import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(resolve(path), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require', 'exports', 'process', compiled)(name => {
    if (!(name in imports)) throw Error('Unapproved import ' + name);
    return imports[name];
  }, exports, process);
  return exports;
}
const org = '10000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000001';
const host = 'fixture.example.com';
let authenticated, admin, calls, loginCount, rpcResponse, rpcError;
const scope = load('lib/knowledge-discovery/url-policy.ts', {
  'node:net': require('node:net'),
  'node:dns/promises': require('node:dns/promises'),
});
const domain = load('lib/knowledge-discovery/domain-verification.ts', {
  'node:crypto': require('node:crypto'),
});
const NextResponse = {
  json: (body, options = {}) => ({
    body, status: options.status ?? 200, headers: options.headers ?? {},
  }),
};
const route = load('app/api/knowledge/discovery/erasure/route.ts', {
  'next/server': { NextResponse },
  '@/lib/supabase/server': { createClient: async () => ({
    auth: { getUser: async () => {
      loginCount++;
      return { data: { user: authenticated ? { id: owner } : null }, error: null };
    } },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'can_manage_organization') return { data: admin, error: null };
      if (name === 'erase_knowledge_discovery_metadata_v1')
        return { data: rpcResponse, error: rpcError };
      throw Error('Unexpected RPC ' + name);
    },
  }) },
  '@/lib/workspace': { requireCurrentOrganizationId: async () => org },
  '@/lib/security/bounded-json-body': {
    readBoundedJson: async request => ({ ok: true, value: await request.json() }),
  },
  '@/lib/security/fetch-metadata': {
    isExplicitCrossSiteRequest: request =>
      request.headers.get('sec-fetch-site') === 'cross-site',
  },
  '@/lib/knowledge-discovery/url-policy': scope,
  '@/lib/knowledge-discovery/domain-verification': domain,
});
const key = 'KNOWLEDGE_DISCOVERY_METADATA_ERASURE_ENABLED';
const original = process.env[key];
test.after(() => original === undefined ? delete process.env[key] : process.env[key] = original);
function reset(enabled = false) {
  authenticated = true; admin = true; calls = []; loginCount = 0;
  rpcError = null;
  rpcResponse = { ok: true, status: 'discovery_metadata_erased', jobsDeleted: 2, pagesDeleted: 4 };
  enabled ? process.env[key] = 'true' : delete process.env[key];
}
function request(body, headers = {}) {
  const url = 'https://salsysos.test/api/knowledge/discovery/erasure';
  const req = new Request(url, {
    method: 'POST',
    headers: {
      origin: 'https://salsysos.test',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}
const valid = () => ({ hostname: host, expectedRevision: 2 });

test('feature defaults OFF without authenticating or touching database', async () => {
  reset();
  const result = await route.POST(request(valid()));
  assert.equal(result.status, 503);
  assert.equal(loginCount, 0);
  assert.deepEqual(calls, []);
});
test('requires an exact same-origin request and bounded exact scope', async () => {
  reset(true);
  assert.equal((await route.POST(request(valid(), {
    origin: 'https://attacker.example.net',
    'sec-fetch-site': 'cross-site',
  }))).status, 403);
  assert.equal(loginCount, 0);
  for (const invalid of [
    { hostname: host, expectedRevision: 1 },
    { hostname: host, expectedRevision: 2.5 },
    { hostname: 'https://fixture.example.com/', expectedRevision: 2 },
    { hostname: 'fixture.example.com:443', expectedRevision: 2 },
    { hostname: 'fixture.example.com.evil.net/', expectedRevision: 2 },
    { hostname: '', expectedRevision: 2 },
  ]) assert.equal((await route.POST(request(invalid))).status, 400);
  assert.equal(loginCount, 0);
});
test('caller-bound owner/admin RPC is the only write path', async () => {
  reset(true);
  const response = await route.POST(request(valid()));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true, status: 'discovery_metadata_erased', jobsDeleted: 2, pagesDeleted: 4,
  });
  assert.deepEqual(calls, [
    { name: 'can_manage_organization', args: { p_organization_id: org } },
    { name: 'erase_knowledge_discovery_metadata_v1', args: {
      p_organization_id: org, p_hostname: host, p_expected_revision: 2,
    } },
  ]);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
test('unauthenticated and employee actors never reach erasure RPC', async () => {
  reset(true);
  authenticated = false;
  assert.equal((await route.POST(request(valid()))).status, 403);
  authenticated = true; admin = false;
  assert.equal((await route.POST(request(valid()))).status, 403);
  assert.equal(calls.filter(c => c.name === 'erase_knowledge_discovery_metadata_v1').length, 0);
});
test('SQL denial, stale revision and missing draft fail closed', async () => {
  reset(true);
  rpcResponse = { ok: false, reason: 'already_erased' };
  assert.equal((await route.POST(request(valid()))).status, 409);
  rpcResponse = null; rpcError = { code: '42501' };
  assert.equal((await route.POST(request(valid()))).status, 403);
  assert.notEqual((await route.POST(request(valid()))).body.ok, true);
});
