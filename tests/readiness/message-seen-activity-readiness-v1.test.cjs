const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEAD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MESSAGE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MESSAGE2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ACTIVITY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const TIME = '2026-11-05T12:00:00.000Z';

function fixture(options = {}) {
  const calls = [];
  const threads = options.threads ??
    [{ id: THREAD }];
  const messages = options.messages ?? [{
    id: MESSAGE, lead_id: LEAD, conversation_id: THREAD,
    external_message_id: 'wamid.synthetic', read_at: TIME,
  }];
  const activities = options.activities ?? [{
    id: ACTIVITY, lead_id: LEAD,
    metadata: {
      message_id: MESSAGE,
      conversation_id: THREAD,
      source: 'verified_whatsapp_read_status',
      confidence: 'exact_provider_message_id',
    },
  }];
  const data = { conversations: threads, messages, activities };
  const admin = {
    from(table) {
      const filters = [];
      const query = {
        select(columns) { calls.push({ table, columns, filters }); return query; },
        eq(column, value) { filters.push(['eq', column, value]); return query; },
        in(column, value) { filters.push(['in', column, value]); return query; },
        not(column, operator, value) { filters.push(['not', column, operator, value]); return query; },
        async limit(n) {
          assert.equal(n, 251, 'Each scan is strictly bounded');
          if (options.errorTable === table) return { data: null, error: { message: 'private DB error' } };
          if (table === 'conversations') {
            assert.deepEqual(filters, [
              ['eq', 'organization_id', ORG], ['eq', 'channel', 'whatsapp'],
            ]);
          } else if (table === 'messages') {
            assert.deepEqual(filters, [
              ['eq', 'organization_id', ORG], ['eq', 'direction', 'outbound'],
              ['in', 'conversation_id', [THREAD]], ['not', 'read_at', 'is', null],
            ]);
          } else if (table === 'activities') {
            assert.deepEqual(filters, [
              ['eq', 'activity_type', 'message_seen'], ['in', 'lead_id', [LEAD]],
            ]);
          } else throw Error('Unexpected table ' + table);
          return { data: data[table], error: null };
        },
      };
      return query;
    },
  };
  const fn = load('lib/message-seen-activity-readiness.ts', { 'server-only': {} });
  return { ...fn, admin, calls };
}

test('readiness uses only tenant-scoped WhatsApp threads, outbound read messages, and matching lead activities', async () => {
  const f = fixture();
  const report = await f.readMessageSeenActivityReadiness(f.admin, ORG);
  assert.equal(report.whatsappThreadsChecked, 1);
  assert.equal(report.confirmedReadMessages, 1);
  assert.equal(report.eligibleProviderReadMessages, 1);
  assert.equal(report.activityMatchedMessages, 1);
  assert.equal(report.eligibleWithoutActivity, 0);
  assert.equal(report.readMessagesWithoutProviderId, 0);
  assert.deepEqual(f.calls.map(x => x.table), [
    'conversations', 'messages', 'activities',
  ]);
  assert.equal(Object.keys(report).some(key => /messageId|leadId|external/i.test(key)), false);
});

test('readiness counts eligible historical reads without inventing activity coverage', async () => {
  const f = fixture({ activities: [] });
  const report = await f.readMessageSeenActivityReadiness(f.admin, ORG);
  assert.equal(report.confirmedReadMessages, 1);
  assert.equal(report.eligibleWithoutActivity, 1);
  assert.equal(report.activityMatchedMessages, 0);
});

test('missing provider ID is not eligible for a message-seen activity', async () => {
  const f = fixture({ messages: [
    { id: MESSAGE, lead_id: LEAD, conversation_id: THREAD, read_at: TIME,
      external_message_id: null },
  ] });
  const report = await f.readMessageSeenActivityReadiness(f.admin, ORG);
  assert.equal(report.confirmedReadMessages, 1);
  assert.equal(report.eligibleProviderReadMessages, 0);
  assert.equal(report.readMessagesWithoutProviderId, 1);
  assert.equal(report.activityMatchedMessages, 0);
  assert.deepEqual(f.calls.map(x => x.table), ['conversations', 'messages']);
});

test('unrelated, cross-message, and hand-entered activities cannot count as verified coverage', async () => {
  const f = fixture({ activities: [
    { id: ACTIVITY, lead_id: LEAD,
      metadata: { source: 'manual', message_id: MESSAGE, conversation_id: THREAD,
        confidence: 'exact_provider_message_id' } },
    { id: '00000000-0000-4000-8000-000000000001', lead_id: LEAD,
      metadata: { source: 'verified_whatsapp_read_status', message_id: MESSAGE2,
        conversation_id: THREAD, confidence: 'exact_provider_message_id' } },
    { id: '00000000-0000-4000-8000-000000000002', lead_id: LEAD,
      metadata: { source: 'verified_whatsapp_read_status', message_id: MESSAGE,
        conversation_id: '00000000-0000-4000-8000-000000000003',
        confidence: 'exact_provider_message_id' } },
    { id: '00000000-0000-4000-8000-000000000004',
      lead_id: '00000000-0000-4000-8000-000000000005',
      metadata: { source: 'verified_whatsapp_read_status', message_id: MESSAGE,
        conversation_id: THREAD, confidence: 'exact_provider_message_id' } },
  ] });
  const report = await f.readMessageSeenActivityReadiness(f.admin, ORG);
  assert.equal(report.activityMatchedMessages, 0);
  assert.equal(report.eligibleWithoutActivity, 1);
});

test('preview does not query other data when there are no WhatsApp conversations', async () => {
  const f = fixture({ threads: [] });
  const report = await f.readMessageSeenActivityReadiness(f.admin, ORG);
  assert.equal(report.whatsappThreadsChecked, 0);
  assert.equal(report.confirmedReadMessages, 0);
  assert.deepEqual(f.calls.map(x => x.table), ['conversations']);
});

test('failed, malformed or truncated data fails closed instead of displaying a misleading zero', async () => {
  const tests = [
    { errorTable: 'conversations' },
    { errorTable: 'messages' },
    { errorTable: 'activities' },
    { threads: [{ id: 'not-a-uuid' }] },
    { messages: [{ id: MESSAGE, lead_id: LEAD,
      conversation_id: '00000000-0000-4000-8000-000000000003',
      read_at: TIME, external_message_id: 'wamid.synthetic' }] },
    { activities: new Array(251).fill({
      id: ACTIVITY, lead_id: LEAD, metadata: {},
    }) },
  ];
  for (const options of tests) {
    const f = fixture(options);
    await assert.rejects(
      f.readMessageSeenActivityReadiness(f.admin, ORG),
      /unavailable|invalid|bounded|identities/i,
    );
  }
});

test('owner/admin only reporting integration and visible, non-mutating summary', () => {
  const audit = readFileSync('lib/message-sync-audit.ts', 'utf8');
  const page = readFileSync('app/system-health/message-sync/page.tsx', 'utf8');
  assert.ok(audit.indexOf("!['owner', 'admin'].includes(active.role)") <
    audit.indexOf('readMessageSeenActivityReadiness('));
  assert.match(audit, /active\.organizationId/);
  for (const expected of [
    'messageSeenActivityReadiness',
    'whatsappSeenActivityEnabled',
    'instagramReadActivityEnabled',
    "WHATSAPP_MESSAGE_SEEN_ACTIVITY_ENABLED === 'true'",
    "INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED === 'true'",
  ]) assert.ok(audit.includes(expected), expected);
  for (const expected of [
    'Message seen · Activity readiness',
    'WhatsApp reads recorded',
    'Eligible with provider ID',
    'Matching seen activities',
    'Eligible without activity',
    'Message-seen reconciliation unavailable',
  ]) assert.ok(page.includes(expected), expected);
  assert.doesNotMatch(page, /enableMessageSeen|backfillMessageSeen|applyMessageSeen/);
});
