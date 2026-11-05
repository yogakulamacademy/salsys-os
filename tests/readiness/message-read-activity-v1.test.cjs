const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THREAD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MESSAGE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROVIDER_MID = 'wamid.synthetic-001';
const ACCOUNT = 'synthetic-instagram-account';
const CUSTOMER = 'synthetic-instagram-customer';
const TIME = '2026-11-05T10:01:00.000Z';

function harness(options = {}) {
  const calls = { selects: [], inserts: [] };
  const admin = {
    from(table) {
      const filters = [];
      const q = {
        select(columns) { calls.selects.push({ table, columns, filters }); return q; },
        eq(key, value) { filters.push([key, value]); return q; },
        async limit(n) {
          assert.equal(n, 2);
          if (options.errorTable === table) return { data: null, error: { message: 'private error' } };
          if (table === 'messages') {
            assert.deepEqual(filters, [
              ['organization_id', ORG],
              ['external_message_id', PROVIDER_MID],
              ['direction', 'outbound'],
            ]);
            return { data: options.ambiguousMessage ? [
              { id: MESSAGE, lead_id: LEAD, conversation_id: THREAD, read_at: TIME },
              { id: MESSAGE, lead_id: LEAD, conversation_id: THREAD, read_at: TIME },
            ] : [
              { id: MESSAGE, lead_id: LEAD, conversation_id: THREAD,
                read_at: options.unread ? null : TIME },
            ], error: null };
          }
          if (table === 'integration_connections') {
            assert.deepEqual(filters, [
              ['provider', 'instagram'],
              ['status', 'connected'],
              ['external_account_id', ACCOUNT],
            ]);
            return { data: options.ambiguousAccount ? [
              { organization_id: ORG }, { organization_id: ORG },
            ] : options.unmappedAccount ? [] : [{ organization_id: ORG }], error: null };
          }
          if (table === 'conversations') {
            if (options.channel === 'instagram') {
              assert.deepEqual(filters, [
                ['organization_id', ORG],
                ['channel', 'instagram'],
                ['external_account_id', ACCOUNT],
                ['external_conversation_id', ACCOUNT + ':' + CUSTOMER],
              ]);
              return { data: options.unmappedThread ? [] :
                [{ id: THREAD, lead_id: LEAD }], error: null };
            }
            assert.deepEqual(filters, [
              ['id', THREAD],
              ['organization_id', ORG],
              ['lead_id', LEAD],
              ['channel', 'whatsapp'],
            ]);
            return { data: [{ id: THREAD }], error: null };
          }
          throw Error('Unexpected table ' + table);
        },
        async upsert(activity, config) {
          assert.equal(table, 'activities');
          assert.deepEqual(config, { onConflict: 'id', ignoreDuplicates: true });
          calls.inserts.push(activity);
          if (options.insertError) return { error: { message: 'private write error' } };
          return { error: null };
        },
      };
      return q;
    },
  };
  const fn = load('lib/integrations/message-read-activity.ts', {
    crypto: { default: crypto },
  });
  return { calls, admin, ...fn };
}

test('exact WhatsApp read status records one provider-confirmed activity with a stable dedup key', async () => {
  const f = harness();
  await f.recordWhatsappMessageSeenActivity(f.admin, {
    organizationId: ORG, providerMessageId: PROVIDER_MID,
  });
  await f.recordWhatsappMessageSeenActivity(f.admin, {
    organizationId: ORG, providerMessageId: PROVIDER_MID,
  });
  assert.equal(f.calls.inserts.length, 2);
  const [first, duplicate] = f.calls.inserts;
  assert.equal(first.id, duplicate.id);
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.lead_id, LEAD);
  assert.equal(first.activity_type, 'message_seen');
  assert.equal(first.channel, 'whatsapp');
  assert.equal(first.actor_type, 'system');
  assert.equal(first.occurred_at, TIME);
  assert.equal(first.metadata.message_id, MESSAGE);
  assert.equal(first.metadata.conversation_id, THREAD);
  assert.equal(first.metadata.confidence, 'exact_provider_message_id');
  assert.doesNotMatch(JSON.stringify(first), /wamid\.synthetic|CONFIDENTIAL/);
});

test('WhatsApp unread, ambiguous or failed evidence must fail closed with no activity', async () => {
  for (const options of [
    { unread: true },
    { ambiguousMessage: true },
    { errorTable: 'messages' },
    { errorTable: 'conversations' },
    { insertError: true },
  ]) {
    const f = harness(options);
    await assert.rejects(f.recordWhatsappMessageSeenActivity(f.admin, {
      organizationId: ORG, providerMessageId: PROVIDER_MID,
    }));
    if (!options.insertError) assert.equal(f.calls.inserts.length, 0);
  }
});

test('Instagram signed conversation watermark records an idempotent thread-level signal, not message-seen', async () => {
  const f = harness({ channel: 'instagram' });
  const input = { accountId: ACCOUNT, customerId: CUSTOMER, occurredAt: TIME };
  await f.recordInstagramConversationReadActivity(f.admin, input);
  await f.recordInstagramConversationReadActivity(f.admin, input);
  assert.equal(f.calls.inserts.length, 2);
  assert.equal(f.calls.inserts[0].id, f.calls.inserts[1].id);
  const a = f.calls.inserts[0];
  assert.equal(a.activity_type, 'conversation_read_observed');
  assert.equal(a.channel, 'instagram');
  assert.equal(a.lead_id, LEAD);
  assert.equal(a.metadata.confidence, 'conversation_watermark_only');
  assert.match(a.details, /specific message view or reply is not verified/);
  assert.doesNotMatch(JSON.stringify(a), /synthetic-instagram-account|synthetic-instagram-customer/);
});

test('Instagram unknown or ambiguous identities and malformed evidence never create activity', async () => {
  for (const options of [
    { channel: 'instagram', unmappedAccount: true },
    { channel: 'instagram', ambiguousAccount: true },
    { channel: 'instagram', unmappedThread: true },
    { channel: 'instagram', errorTable: 'integration_connections' },
    { channel: 'instagram', errorTable: 'conversations' },
  ]) {
    const f = harness(options);
    const run = f.recordInstagramConversationReadActivity(f.admin, {
      accountId: ACCOUNT, customerId: CUSTOMER, occurredAt: TIME,
    });
    if (options.errorTable) await assert.rejects(run);
    else assert.equal((await run).acknowledged, false);
    assert.equal(f.calls.inserts.length, 0);
  }
  const f = harness({ channel: 'instagram' });
  assert.equal((await f.recordInstagramConversationReadActivity(f.admin, {
    accountId: ACCOUNT, customerId: ACCOUNT, occurredAt: TIME,
  })).acknowledged, false);
  assert.equal(f.calls.inserts.length, 0);
});

test('existing staff AI context reads activities, but customer-draft context does not expose them', () => {
  const ctx = readFileSync('lib/ai/lead-context.ts', 'utf8');
  assert.match(ctx, /if \(audience === 'staff_insight'\)/);
  assert.match(ctx, /admin\.from\('activities'\)/);
  assert.match(ctx, /title: bounded\(a\.title, 240\)/);
  assert.match(ctx, /detail: bounded\(a\.details, 1200\)/);
  const wa = readFileSync('app/api/whatsapp/webhook/route.ts', 'utf8');
  assert.match(wa, /statusName === 'read' && process\.env\.WHATSAPP_MESSAGE_SEEN_ACTIVITY_ENABLED === 'true'/);
  const ig = readFileSync('app/api/instagram/webhook/route.ts', 'utf8');
  assert.match(ig, /process\.env\.INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED === 'true'/);
  assert.match(ig, /recordInstagramConversationReadActivity\(supabase, read\)/);
});
