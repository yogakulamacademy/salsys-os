const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

test('worker dispatch requires its own bearer and exposes only a bounded result', async () => {
  const env = ['KNOWLEDGE_IMPORT_ENABLED', 'KNOWLEDGE_IMPORT_WORKER_SECRET', 'CRON_SECRET'];
  const saved = env.map((key) => process.env[key]);
  const secret = 'dedicated-worker-fixture-secret-longer-than-32';
  const url = 'https://fixture.example/api/knowledge-import-worker';
  const request = (token, body, search = '') => new Request(url + search, {
    method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body, duplex: 'half',
  });
  let calls = 0;
  let result = { stop: 'complete', reports: [{ scope: 'private-workspace', draft: 'private-draft' }] };
  const bearer = load('lib/security/machine-bearer-auth.ts', { 'server-only': {}, 'node:crypto': require('node:crypto') });
  const route = load('app/api/knowledge-import-worker/route.ts', {
    '@/lib/knowledge-import-worker-server': { runKnowledgeImportWorker: async () => {
      calls++;
      if (result instanceof Error) throw result;
      return result;
    } },
    '@/lib/security/machine-bearer-auth': bearer,
  });
  try {
    process.env.CRON_SECRET = 'fixture-shared-cron-secret';
    process.env.KNOWLEDGE_IMPORT_WORKER_SECRET = secret;
    process.env.KNOWLEDGE_IMPORT_ENABLED = '0';
    assert.equal((await route.POST(request(secret))).status, 404);
    process.env.KNOWLEDGE_IMPORT_ENABLED = '1';
    delete process.env.KNOWLEDGE_IMPORT_WORKER_SECRET;
    assert.equal((await route.POST(request(secret))).status, 503);
    process.env.KNOWLEDGE_IMPORT_WORKER_SECRET = secret;
    assert.equal((await route.POST(request())).status, 401);
    assert.equal((await route.POST(request(process.env.CRON_SECRET))).status, 401);
    assert.equal((await route.POST(request(secret, '{}'))).status, 400);
    assert.equal((await route.POST(request(secret, undefined, '?job=untrusted'))).status, 400);
    assert.equal(calls, 0);
    const response = await route.POST(request(secret));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { state: 'complete', jobs: 1 });
    const emptyStream = new ReadableStream({ start: (controller) => controller.close() });
    assert.equal((await route.POST(request(secret, emptyStream))).status, 200);
    assert.equal(calls, 2);
    result = { stop: 'blocked', reports: [] };
    assert.equal((await route.POST(request(secret))).status, 503);
    result = new Error('sensitive storage credential');
    assert.deepEqual(await (await route.POST(request(secret))).json(), { error: 'worker_unavailable' });
    assert.equal(route.GET, undefined);
  } finally {
    env.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});

test('worker Storage signer accepts only the configured role on the expected project origin', () => {
  let clients = 0;
  let url = 'https://abcdefghijklmnopqrst.supabase.co';
  const useStorage = load('lib/knowledge-import-storage-runtime.ts', {
    'server-only': {},
    '@/lib/config': { getSupabasePublicConfig: () => ({ url, key: 'public-test-key', configured: true }) },
    '@supabase/supabase-js': { createClient: () => { clients++; return { storage: {} }; } },
  }).getKnowledgeImportStorage;
  const token = (role, exp = Math.floor(Date.now() / 1000) + 60) =>
    `fixture.${Buffer.from(JSON.stringify({ role, exp })).toString('base64url')}.sig`;
  const role = 'knowledge_import_worker_storage';
  for (const bad of [undefined, '', 'incomplete', token('service_role'), token('knowledge_import_gateway_storage'), token(role, 1)]) {
    assert.throws(() => useStorage(bad, role));
  }
  assert.equal(clients, 0);
  assert.equal(useStorage(token(role), role).provider.origin, url);
  url += '/unexpected';
  assert.throws(() => useStorage(token(role), role), /Storage origin/);
  assert.equal(clients, 1);
});

test('hosted database connection is bound to the Storage project', () => {
  const { createKnowledgePostgresConnector } = load('lib/knowledge-import-postgres.ts', {
    'server-only': {}, pg: { Client: class {} },
  });
  const projectRef = 'abcdefghijklmnopqrst';
  const other = 'aaaaaaaaaaaaaaaaaaaa';
  const options = { mode: 'hosted', login: 'worker', projectRef };
  const direct = (project) => `postgresql://worker:fixture@db.${project}.supabase.co/postgres`;
  const pooled = (project) => `postgresql://worker.${project}:fixture@fixture.pooler.supabase.com/postgres`;
  for (const url of [direct(projectRef), pooled(projectRef)]) {
    assert.equal(typeof createKnowledgePostgresConnector({ ...options, connectionUrl: url }), 'function');
  }
  for (const url of [direct(other), pooled(other)]) {
    assert.throws(() => createKnowledgePostgresConnector({ ...options, connectionUrl: url }), /configuration/);
  }
});
