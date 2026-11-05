const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT = '17840000000000001';
const CUSTOMER = '998800001111222';
const CONVERSATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TIME = '2026-11-05T09:00:00Z';
const OUT_1 = 'mid-provider-out-1';
const OUT_2 = 'mid-provider-out-2';

function providerMessage(id, sender, to) {
  return {
    id, from: { id: sender }, to: { data: [{ id: to }] },
    created_time: TIME, message: 'CONFIDENTIAL synthetic content - never return',
  };
}

async function runPreview(options = {}) {
  const calls = { fetches: [], dbTables: [], dbFilters: [], writes: 0 };
  const messages = options.messages ?? [
    providerMessage(OUT_1, ACCOUNT, CUSTOMER),
    providerMessage(OUT_2, ACCOUNT, CUSTOMER),
    providerMessage(OUT_2, ACCOUNT, CUSTOMER), // repeated provider MID: count once
    providerMessage('mid-provider-in-1', CUSTOMER, ACCOUNT),
    providerMessage('mid-bad-recipient', ACCOUNT, '9999990000'),
    providerMessage('', ACCOUNT, CUSTOMER),
  ];
  const admin = {
    from(table) {
      calls.dbTables.push(table);
      if (table === 'instagram_history_sync_cursor_v1') {
        const q = {
          select(columns) {
            assert.equal(columns, 'next_cursor,completed_cycles,conversations_scanned,messages_imported,messages_already_present');
            return q;
          },
          eq(key, value) {
            calls.dbFilters.push([table, key, value]);
            return q;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return q;
      }
      if (table === 'conversations') {
        const q = {
          select(columns) { assert.equal(columns, 'id,lead_id'); return q; },
          eq(key, value) {
            calls.dbFilters.push([table, key, value]);
            return q;
          },
          limit: async n => {
            assert.equal(n, 2);
            return { data: options.noCrmThread ? [] :
              [{ id: CONVERSATION, lead_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }], error: null };
          },
        };
        return q;
      }
      if (table === 'messages') {
        const q = {
          select(columns) { assert.equal(columns, 'external_message_id'); return q; },
          eq(key, value) {
            calls.dbFilters.push([table, key, value]);
            return q;
          },
          in(key, values) {
            assert.equal(key, 'external_message_id');
            assert.deepEqual(values, [OUT_1, OUT_2]);
            return q;
          },
          limit: async n => {
            assert.equal(n, 401);
            return { data: options.lookupError ? null :
              [{ external_message_id: OUT_1 }], error: options.lookupError ? { message: 'private error' } : null };
          },
        };
        return q;
      }
      throw Error('Unexpected database table ' + table);
    },
    rpc() { calls.writes++; throw Error('Read-only path cannot call RPC'); },
  };
  const worker = load('lib/integrations/instagram-history-reconciliation.ts', {
    'server-only': {},
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/integrations/instagram-connection': {
      getInstagramRuntimeForOrganization: async (org, account) => {
        assert.equal(org, ORG);
        assert.equal(account, ACCOUNT);
        return { accessToken: 'synthetic-access-token' };
      },
    },
  });
  const oldFetch = global.fetch;
  global.fetch = async (url, params) => {
    const u = new URL(url);
    calls.fetches.push(u.pathname);
    assert.equal(u.origin, 'https://graph.instagram.com');
    assert.equal(params.headers.Authorization, 'Bearer synthetic-access-token');
    assert.equal(params.cache, 'no-store');
    if (u.pathname.endsWith('/conversations')) {
      assert.equal(u.searchParams.get('limit'), '1');
      return { ok: true, status: 200, json: async () => ({ data: [
        { id: 'thread_synthetic_1', participants: { data: [
          { id: ACCOUNT }, { id: CUSTOMER },
        ] } },
      ] }) };
    }
    if (u.pathname.endsWith('/messages')) {
      assert.equal(u.searchParams.get('limit'), '20');
      return { ok: true, status: 200, json: async () => ({ data: messages }) };
    }
    throw Error('Unexpected Graph endpoint');
  };
  try {
    const report = await worker.reconcileInstagramMessageHistory({
      organizationId: ORG, accountId: ACCOUNT, apply: false,
    });
    return { report, calls };
  } finally {
    global.fetch = oldFetch;
  }
}

test('preview counts distinct native-app outbound provider MIDs matched in tenant thread only', async () => {
  const { report, calls } = await runPreview();
  assert.equal(report.dryRun, true);
  assert.equal(report.customerMessageSent, false);
  assert.equal(report.conversationsScanned, 1);
  assert.equal(report.conversationsMatched, 1);
  assert.equal(report.messagesSeen, 6);
  assert.equal(report.messagesSkipped, 2);
  assert.equal(report.outboundMessagesSeen, 2);
  assert.equal(report.outboundMessagesMatched, 1);
  assert.equal(report.outboundMessagesNotInCrm, 1);
  assert.equal(report.messagesImported, 0);
  assert.equal(report.messagesAlreadyPresent, 0);
  assert.deepEqual(calls.dbTables, ['instagram_history_sync_cursor_v1', 'conversations', 'messages']);
  for (const required of [
    ['messages','organization_id',ORG],
    ['messages','conversation_id',CONVERSATION],
    ['messages','direction','outbound'],
  ]) assert.ok(calls.dbFilters.some(entry => JSON.stringify(entry) === JSON.stringify(required)));
  assert.equal(calls.fetches.length, 2);
  assert.equal(calls.writes, 0);
  const rendered = JSON.stringify(report);
  for (const privateValue of [OUT_1,OUT_2,ACCOUNT,CUSTOMER,'CONFIDENTIAL','synthetic-access-token']) {
    assert.equal(rendered.includes(privateValue), false, 'Preview returns only counts');
  }
});

test('unmatched provider conversation never queries or creates a CRM message', async () => {
  const { report, calls } = await runPreview({ noCrmThread: true });
  assert.equal(report.conversationsMatched, 0);
  assert.equal(report.outboundMessagesSeen, 0);
  assert.equal(report.outboundMessagesNotInCrm, 0);
  assert.deepEqual(calls.dbTables, ['instagram_history_sync_cursor_v1','conversations']);
  assert.equal(calls.fetches.length, 1);
  assert.equal(calls.writes, 0);
});

test('failed CRM lookup and over-limit provider page do not invent zero missing matches', async () => {
  await assert.rejects(runPreview({ lookupError: true }), /CRM evidence unavailable/);
  const oversized = Array.from({ length: 21 }, (_, i) =>
    providerMessage('mid-many-' + i, ACCOUNT, CUSTOMER));
  await assert.rejects(runPreview({ messages: oversized }), /exceeded its message limit/);
});
