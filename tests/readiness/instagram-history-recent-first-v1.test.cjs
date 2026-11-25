const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT = '17840000000000001';
const LAST_SCAN = '2026-11-25T02:00:00Z';

function thread(id, customer, updated) {
  return { id, updated_time: updated, participants: { data: [{ id: ACCOUNT }, { id: customer }] } };
}

async function runApply(state) {
  const seen = { messageThreads: [], upserts: [], conversationParams: [] };
  const admin = {
    from(table) {
      if (table === 'instagram_history_sync_cursor_v1') {
        const q = {
          select() { return q; },
          eq() { return q; },
          maybeSingle: async () => ({ data: state, error: null }),
          upsert: async row => { seen.upserts.push(row); return { error: null }; },
        };
        return q;
      }
      if (table === 'conversations') {
        const q = {
          select() { return q; },
          eq() { return q; },
          limit: async () => ({ data: [{ id: 'conv', lead_id: 'lead' }], error: null }),
        };
        return q;
      }
      throw Error('Unexpected table ' + table);
    },
    rpc: async name => name === 'ingest_raw_event'
      ? { data: { event_id: 'raw-1' }, error: null }
      : { data: { ok: true, imported: true }, error: null },
  };
  const worker = load('lib/integrations/instagram-history-reconciliation.ts', {
    'server-only': {},
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/integrations/instagram-connection': {
      getInstagramRuntimeForOrganization: async () => ({ accessToken: 'synthetic' }),
    },
  });
  const oldFetch = global.fetch;
  global.fetch = async url => {
    const u = new URL(url);
    if (u.pathname.endsWith('/conversations')) {
      seen.conversationParams.push(Object.fromEntries(u.searchParams));
      const data = u.searchParams.get('after')
        ? [thread('thread_old_backfill', '5550000000003', '2026-10-01T00:00:00Z')]
        : [
          thread('thread_new_reply', '5550000000001', '2026-11-25T03:00:00Z'),
          thread('thread_stale', '5550000000002', '2026-11-20T00:00:00Z'),
        ];
      return { ok: true, status: 200, json: async () => ({
        data, paging: { next: 'n', cursors: { after: 'cursor-next' } },
      }) };
    }
    if (u.pathname.endsWith('/messages')) {
      seen.messageThreads.push(u.pathname.split('/').slice(-2)[0]);
      return { ok: true, status: 200, json: async () => ({ data: [{
        id: 'mid-' + seen.messageThreads.length, created_time: '2026-11-25T03:00:00Z',
        from: { id: ACCOUNT }, to: { data: [{ id: '5550000000001' }] }, message: 'synthetic',
      }] }) };
    }
    throw Error('Unexpected Graph endpoint');
  };
  try {
    const report = await worker.reconcileInstagramMessageHistory({ organizationId: ORG, accountId: ACCOUNT, apply: true });
    return { report, seen };
  } finally {
    global.fetch = oldFetch;
  }
}

test('each pass rechecks conversations updated since the last scan before the deep backfill', async () => {
  const { report, seen } = await runApply({
    next_cursor: 'cursor-deep', completed_cycles: 0, conversations_scanned: 10,
    messages_imported: 0, messages_already_present: 0, last_scanned_at: LAST_SCAN,
  });
  // Newest page has no cursor; the backfill page keeps walking from its cursor.
  assert.equal(seen.conversationParams.length, 2);
  assert.equal(seen.conversationParams.some(p => !p.after), true);
  assert.equal(seen.conversationParams.some(p => p.after === 'cursor-deep'), true);
  // The recent reply thread and the backfill thread are read; the stale one is not.
  assert.deepEqual(seen.messageThreads, ['thread_new_reply', 'thread_old_backfill']);
  assert.equal(report.recentConversationsChecked, 1);
  assert.equal(seen.upserts[0].next_cursor, 'cursor-next');
  assert.equal(report.customerMessageSent, false);
});

test('first run without a cursor does not double-read the newest page', async () => {
  const { seen } = await runApply(null);
  assert.equal(seen.conversationParams.length, 1);
});
