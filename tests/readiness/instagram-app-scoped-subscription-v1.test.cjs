const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const APP = '1234567890123456';
const OTHER_APP = '9876543210987654';
const ORGANIZATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT = '17840000000000001';

const moduleUnderTest = load('lib/integrations/instagram-history-reconciliation.ts', {
  'server-only': {},
  '@/lib/supabase/admin': { createAdminClient() { throw new Error('No database read is required'); } },
  '@/lib/integrations/instagram-connection': {
    getInstagramRuntimeForOrganization: async (organizationId, accountId) => {
      assert.equal(organizationId, ORGANIZATION);
      assert.equal(accountId, ACCOUNT);
      return { organizationId, accountId, accessToken: 'synthetic-app-token' };
    },
  },
});

async function inspect(data, options = {}) {
  const previousApp = process.env.INSTAGRAM_APP_ID;
  const previousFetch = globalThis.fetch;
  let requests = 0;
  if (options.appId === null) delete process.env.INSTAGRAM_APP_ID;
  else process.env.INSTAGRAM_APP_ID = options.appId ?? APP;
  globalThis.fetch = async (url, init) => {
    requests++;
    assert.equal(url, 'https://graph.instagram.com/v26.0/me/subscribed_apps');
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-app-token');
    assert.equal(init.cache, 'no-store');
    return {
      ok: options.httpError !== true,
      status: options.httpError ? 403 : 200,
      json: async () => ({ data }),
    };
  };
  try {
    const result = await moduleUnderTest.inspectInstagramEchoSubscription(ORGANIZATION, ACCOUNT);
    return { result, requests };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApp === undefined) delete process.env.INSTAGRAM_APP_ID;
    else process.env.INSTAGRAM_APP_ID = previousApp;
  }
}

test('matching Instagram OAuth app reports its own subscription fields only', async () => {
  const { result, requests } = await inspect([
    { id: APP, subscribed_fields: ['messages', 'message_echoes', 'messages'] },
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(result, {
    subscribed: true, fields: ['message_echoes', 'messages'], customerMessageSent: false,
  });
  assert.equal(JSON.stringify(result).includes(APP), false);
});

test('supports nested application identity without returning it to staff', async () => {
  const { result } = await inspect([
    { application: { id: APP }, subscribed_fields: ['messages'] },
  ]);
  assert.deepEqual(result, {
    subscribed: false, fields: ['messages'], customerMessageSent: false,
  });
});

test('another subscribed app cannot make our app appear subscribed', async () => {
  const { result } = await inspect([
    { id: OTHER_APP, subscribed_fields: ['messages', 'message_echoes'] },
    { id: APP, subscribed_fields: ['messages'] },
  ]);
  assert.equal(result.subscribed, false);
  assert.deepEqual(result.fields, ['messages']);
});

test('other app only is unknown, never a false unsubscribed conclusion', async () => {
  await assert.rejects(
    inspect([{ id: OTHER_APP, subscribed_fields: ['message_echoes'] }]),
    /did not identify the configured Instagram app/,
  );
});

test('ambiguous or missing application identifiers are unknown', async () => {
  for (const data of [
    [{ subscribed_fields: ['message_echoes'] }],
    [{ id: APP, application: { id: OTHER_APP }, subscribed_fields: ['messages'] }],
    [{ id: 'not-an-id', subscribed_fields: ['messages'] }],
    [{ id: APP, subscribed_fields: ['messages'] }, { subscribed_fields: ['message_echoes'] }],
    [{ id: APP, subscribed_fields: ['messages'] }, { id: APP, subscribed_fields: ['messages'] }],
  ]) {
    await assert.rejects(inspect(data), /subscription|application identity|configured Instagram app|ambiguous/i);
  }
});

test('a verified empty subscription list reports no fields', async () => {
  const { result } = await inspect([]);
  assert.deepEqual(result, { subscribed: false, fields: [], customerMessageSent: false });
});

test('invalid fields or provider errors cannot produce a success status', async () => {
  await assert.rejects(inspect([{ id: APP }]), /invalid Instagram webhook subscription fields/);
  await assert.rejects(inspect([{ id: APP, subscribed_fields: ['bad field'] }]), /invalid Instagram webhook subscription fields/);
  await assert.rejects(inspect([{ id: APP, subscribed_fields: ['messages'] }], { httpError: true }), /did not provide/);
  await assert.rejects(inspect([{ id: APP, subscribed_fields: ['messages'] }], { appId: null }), /app configuration is unavailable/);
});
