const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { readFileSync } = require('node:fs');

const LEAD = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG = '33333333-3333-4333-8333-333333333333';
const CONV = '44444444-4444-4444-8444-444444444444';
const MSG = '55555555-5555-4555-8555-555555555555';
const ACT = '66666666-6666-4666-8666-666666666666';
const TASK = '77777777-7777-4777-8777-777777777777';
const STAGE = '88888888-8888-4888-8888-888888888888';
const PAYMENT = '99999999-9999-4999-8999-999999999999';

function fixture(options = {}) {
  const calls = { admin: 0, tables: [], rpc: [], workspace: 0 };
  const rows = {
    leads: {
      id: LEAD,
      organization_id: options.wrongOrganization ? OTHER_ORG : ORG,
      display_name: 'Synthetic lead',
      current_stage: 'qualified',
      intent: 'medium',
      current_contact_channel: 'instagram',
      preferred_location: 'Mysore',
      summary: 'PRIVATE SUMMARY DO NOT SEND',
      notes: 'PRIVATE STAFF NOTES DO NOT SEND',
    },
    conversations: [{ id: CONV, channel: 'instagram', last_message_at: '2026-11-04T12:00:00Z' }],
    messages: [{ id: MSG, conversation_id: CONV, direction: 'inbound', message_type: 'text', body: 'Can I book a private room?', created_at: '2026-11-04T12:00:00Z', received_at: '2026-11-04T11:59:50Z' }],
    activities: [{ id: ACT, title: 'Staff called', activity_type: 'call', details: 'Left voice message', occurred_at: '2026-11-04T10:00:00Z' }],
    tasks: [{ id: TASK, title: 'Follow-up', description: 'Check room availability', status: 'open', due_at: '2026-11-05T09:00:00Z', created_at: '2026-11-04T08:00:00Z' }],
    lead_stage_history: [{ id: STAGE, from_stage: 'engaged', to_stage: 'qualified', reason: 'Explicit interest', changed_at: '2026-11-04T07:00:00Z' }],
    payments: [{ id: PAYMENT, status: 'pending', payment_kind: 'deposit', amount: 250, currency: 'USD', paid_at: null, created_at: '2026-11-04T09:00:00Z' }],
  };

  function from(table) {
    calls.tables.push(table);
    const filters = [];
    const query = {
      select() { return query; },
      eq(column, value) { filters.push([column, value]); return query; },
      in(column, value) { filters.push([column, value]); return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle() { return Promise.resolve(response()); },
      then(resolve, reject) { return Promise.resolve(response()).then(resolve, reject); },
    };
    const response = () => {
      if (options.failedTable === table) return { data: null, error: { message: 'Synthetic outage' } };
      if (table === 'leads') {
        assert.ok(filters.some(([key, value]) => key === 'id' && value === LEAD));
        assert.ok(filters.some(([key, value]) => key === 'organization_id' && value === ORG));
      }
      if (table === 'conversations' || table === 'messages' || table === 'tasks' || table === 'payments') {
        assert.ok(filters.some(([key, value]) => key === 'organization_id' && value === ORG), table + ' tenant filter');
        assert.ok(filters.some(([key, value]) => key === 'lead_id' && value === LEAD), table + ' lead filter');
      }
      if (table === 'activities' || table === 'lead_stage_history') {
        assert.ok(filters.some(([key, value]) => key === 'lead_id' && value === LEAD), table + ' scoped to verified parent lead');
      }
      return { data: rows[table], error: null };
    };
    return query;
  }

  const session = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'test-user' } }, error: null }) },
    rpc: async (name, args) => {
      calls.rpc.push([name, args]);
      assert.equal(name, 'can_work_lead');
      assert.deepEqual(args, { p_lead_id: LEAD });
      return { data: options.deny !== true, error: null };
    },
  };
  const getLeadContextV1 = load('lib/ai/lead-context.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/workspace': { requireCurrentOrganizationId: async (_session, userId) => {
      calls.workspace += 1;
      assert.equal(userId, 'test-user');
      return ORG;
    } },
    '@/lib/supabase/admin': { createAdminClient() { calls.admin += 1; return { from }; } },
  }).getLeadContextV1;
  return { getLeadContextV1, calls };
}

test('invalid ID, no session and denied lead never access privileged tables', async () => {
  const f = fixture({ deny: true });
  assert.equal(await f.getLeadContextV1('not-a-uuid'), null);
  assert.equal(await f.getLeadContextV1(LEAD), null);
  assert.equal(f.calls.admin, 0);
  assert.equal(f.calls.rpc.length, 1);
  const noUser = fixture({ noUser: true });
  assert.equal(await noUser.getLeadContextV1(LEAD), null);
  assert.equal(noUser.calls.workspace, 0);
  assert.equal(noUser.calls.admin, 0);
});

test('wrong-tenant parent lead never loads related records', async () => {
  const f = fixture({ wrongOrganization: true });
  assert.equal(await f.getLeadContextV1(LEAD), null);
  assert.deepEqual(f.calls.tables, ['leads']);
});

test('staff snapshot includes evidence IDs and recorded-not-verified payment facts', async () => {
  const f = fixture();
  const ctx = await f.getLeadContextV1(LEAD, 'staff_insight');
  assert.equal(ctx.schemaVersion, 'lead_context_v1');
  assert.equal(ctx.lead.organizationId, ORG);
  assert.equal(ctx.conversation.messages[0].ref, 'message:' + MSG);
  assert.equal(ctx.conversation.messages[0].occurredAt, '2026-11-04T11:59:50Z');
  assert.equal(ctx.staffOnly.activities[0].ref, 'activity:' + ACT);
  assert.equal(ctx.staffOnly.tasks[0].ref, 'task:' + TASK);
  assert.equal(ctx.staffOnly.stageChanges[0].ref, 'stage_change:' + STAGE);
  assert.equal(ctx.staffOnly.paymentRecords[0].ref, 'payment:' + PAYMENT);
  assert.equal(ctx.staffOnly.paymentRecords[0].verification, 'recorded_status_only');
  assert.equal(ctx.staffOnly.privateNotes, 'PRIVATE STAFF NOTES DO NOT SEND');
  assert.match(ctx.limitations.join(' '), /not, by itself|recorded statuses/i);
});

test('customer-draft context excludes staff notes, staff activities, tasks and payment rows', async () => {
  const f = fixture();
  const ctx = await f.getLeadContextV1(LEAD, 'customer_draft');
  assert.equal(ctx.staffOnly, null);
  assert.deepEqual(f.calls.tables, ['leads', 'conversations', 'messages']);
  assert.doesNotMatch(JSON.stringify(ctx), /PRIVATE STAFF NOTES|PRIVATE SUMMARY|Check room availability|deposit/);
});

test('failed history query fails closed rather than silently returning an empty lead', async () => {
  const f = fixture({ failedTable: 'messages' });
  await assert.rejects(f.getLeadContextV1(LEAD), /messages is unavailable/);
});

test('customer reply co-pilot must not forward staff summaries or private notes to Claude', () => {
  const copilot = readFileSync('app/conversations/copilot-actions.ts', 'utf8');
  assert.doesNotMatch(copilot, /summary:\s*cleanText\(String\(lead\.summary/);
  assert.doesNotMatch(copilot, /notes:\s*cleanText\(String\(lead\.notes/);
  assert.match(copilot, /Internal lead summaries and private staff notes are deliberately excluded/);
});
