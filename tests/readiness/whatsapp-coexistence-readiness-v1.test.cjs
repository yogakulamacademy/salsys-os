const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function harness(options = {}) {
  const calls = { admin: 0, queries: [] };
  const role = options.role ?? 'admin';
  const session = {
    auth: { getUser: async () => ({
      data: { user: options.anonymous ? null : { id: 'synthetic-owner' } },
      error: null,
    }) },
    from(table) {
      assert.equal(table, 'profiles');
      const q = {
        select(column) { assert.equal(column, 'active'); return q; },
        eq(column, value) {
          assert.equal(column, 'id');
          assert.equal(value, 'synthetic-owner');
          return q;
        },
        maybeSingle: async () => ({
          data: { active: !options.inactive }, error: null,
        }),
      };
      return q;
    },
  };
  const workspace = {
    activeWorkspace: options.noWorkspace ? null : { organizationId: ORG, role },
    activeOrganizationId: options.wrongWorkspace ? 'other-org' : ORG,
    memberships: options.noMembership ? [] : [{
      organizationId: ORG,
      role: options.badMembershipRole ? 'viewer' : role,
    }],
  };
  const admin = {
    from(table) {
      assert.ok(['integration_connections', 'whatsapp_accounts', 'whatsapp_webhook_events'].includes(table));
      const query = { table, filters: [], projected: null, head: false };
      const chain = {
        select(columns, config = {}) {
          query.projected = columns;
          query.head = config.head === true;
          if (table === 'whatsapp_webhook_events') {
            assert.equal(columns, 'id');
            assert.deepEqual(config, { count: 'exact', head: true });
          }
          return chain;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return chain;
        },
        like(column, value) {
          query.filters.push(['like:' + column, value]);
          return chain;
        },
        limit(value) {
          assert.equal(value, table === 'integration_connections' ? 10 : 50);
          calls.queries.push(query);
          if (table === 'integration_connections') {
            assert.deepEqual(query.filters, [
              ['organization_id', ORG], ['provider', 'whatsapp'], ['status', 'connected'],
            ]);
            return Promise.resolve({
              data: options.connections ?? [
                { id: A, provider_metadata: { onboarding_mode: 'cloud_api' } },
                { id: B, provider_metadata: {} },
              ],
              error: options.connectionsError ? { message: 'private data' } : null,
            });
          }
          assert.equal(table, 'whatsapp_accounts');
          assert.deepEqual(query.filters, [['organization_id', ORG], ['active', true]]);
          return Promise.resolve({
            data: options.senders ?? [
              { connection_id: A }, { connection_id: B }, { connection_id: 'unlinked' },
            ],
            error: options.senderError ? { message: 'private data' } : null,
          });
        },
        then(resolve) {
          assert.equal(table, 'whatsapp_webhook_events');
          calls.queries.push(query);
          assert.deepEqual(query.filters[0], ['organization_id', ORG]);
          assert.equal(query.head, true);
          let count;
          if (query.filters.some(([k, v]) => k === 'event_type' && v === 'smb_message_echoes')) {
            count = 0;
          } else if (query.filters.some(([k, v]) => k === 'like:event_type' && v === 'echo:%')) {
            count = 0;
          } else if (query.filters.some(([k, v]) => k === 'processing_status' && v === 'failed')) {
            count = 8;
          } else if (query.filters.some(([k, v]) => k === 'processing_status' && v === 'dead_letter')) {
            count = 3;
          } else throw new Error('Unexpected status count');
          if (options.badCount) count = -1;
          return Promise.resolve(resolve({
            count,
            error: options.countError ? { message: 'sensitive provider data' } : null,
          }));
        },
      };
      return chain;
    },
  };
  const module = load('lib/whatsapp-coexistence-readiness.ts', {
    'server-only': {},
    '@/lib/supabase/admin': { createAdminClient: () => { calls.admin++; return admin; } },
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/workspace': { getWorkspaceContextForUser: async () => workspace },
    '@/lib/data': { isMockMode: () => Boolean(options.mock) },
  });
  return { module, calls };
}

test('owner/admin receive scoped, aggregate-only WhatsApp readiness', async () => {
  for (const role of ['owner', 'admin']) {
    const { module, calls } = harness({ role });
    const actual = await module.getCurrentWhatsAppCoexistenceReadiness();
    assert.equal(actual.connectedAccounts, 2);
    assert.equal(actual.recordedCoexistenceAccounts, 0);
    assert.equal(actual.recordedCloudApiAccounts, 1);
    assert.equal(actual.unknownOnboardingAccounts, 1);
    assert.equal(actual.linkedActiveSenders, 2);
    assert.equal(actual.signedBusinessAppEchoWebhooks, 0);
    assert.equal(actual.signedBusinessAppEchoChildren, 0);
    assert.equal(actual.failedWebhookEvents, 8);
    assert.equal(actual.deadLetterWebhookEvents, 3);
    assert.ok(!Number.isNaN(Date.parse(actual.checkedAt)));
    assert.equal(calls.admin, 1);
    assert.equal(calls.queries.length, 6);
    assert.ok(!JSON.stringify(actual).includes(A));
    assert.ok(!JSON.stringify(actual).includes(B));
    for (const query of calls.queries.filter(q => q.table === 'whatsapp_webhook_events')) {
      assert.equal(query.filters[0][0], 'organization_id');
      assert.equal(query.filters[0][1], ORG);
      assert.equal(query.projected, 'id');
      assert.equal(query.head, true);
    }
  }
});

test('signed Business-app echo counts require signature_valid', async () => {
  const { module, calls } = harness();
  await module.getCurrentWhatsAppCoexistenceReadiness();
  const echo = calls.queries.filter(q => q.table === 'whatsapp_webhook_events' &&
    (q.filters.some(([k]) => k === 'event_type') || q.filters.some(([k]) => k === 'like:event_type')));
  assert.equal(echo.length, 2);
  for (const query of echo) assert.ok(query.filters.some(([k, v]) => k === 'signature_valid' && v === true));
});

test('anonymous, inactive, disabled, mismatched role or workspace refuse admin reads', async () => {
  for (const opts of [
    { anonymous: true }, { inactive: true }, { role: 'viewer' },
    { wrongWorkspace: true }, { noMembership: true },
    { badMembershipRole: true }, { noWorkspace: true }, { mock: true },
  ]) {
    const { module, calls } = harness(opts);
    assert.equal(await module.getCurrentWhatsAppCoexistenceReadiness(), null);
    assert.equal(calls.admin, 0);
  }
});

test('provider errors and malformed counts are unavailable, never false zero', async () => {
  for (const opts of [
    { connectionsError: true }, { senderError: true },
    { countError: true }, { badCount: true },
    { connections: [{ id: 'invalid', provider_metadata: {} }] },
    { senders: Array.from({ length: 50 }, () => ({ connection_id: A })) },
  ]) {
    const { module } = harness(opts);
    await assert.rejects(module.getCurrentWhatsAppCoexistenceReadiness(), /unavailable|invalid connections/);
  }
});

test('empty tenant inventory produces zero evidence, never a coexistence claim', async () => {
  const { module } = harness({ connections: [], senders: [] });
  const result = await module.getCurrentWhatsAppCoexistenceReadiness();
  assert.equal(result.connectedAccounts, 0);
  assert.equal(result.recordedCoexistenceAccounts, 0);
  assert.equal(result.linkedActiveSenders, 0);
});

test('System Health has no WhatsApp send, provider fetch, webhook replay or mutation path', () => {
  const source = readFileSync('lib/whatsapp-coexistence-readiness.ts', 'utf8');
  const ui = readFileSync('app/system-health/message-sync/page.tsx', 'utf8');
  assert.match(ui, /getCurrentWhatsAppCoexistenceReadiness/);
  assert.match(ui, /WhatsApp Business-app coexistence/);
  assert.match(ui, /Zero echo records means none observed/);
  assert.match(source, /workspace.activeOrganizationId !== active.organizationId/);
  assert.match(source, /linkedActiveSenders/);
  assert.match(source, /count: 'exact', head: true/);
  assert.match(source, /\.eq\('signature_valid', true\)/);
  assert.doesNotMatch(source, /fetch\(|sendMessage|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
});
