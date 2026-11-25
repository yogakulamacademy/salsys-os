const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

function setup({ v2Missing = false } = {}) {
  const calls = [];
  const session = {
    rpc: async (name, args) => {
      calls.push({name,args});
      if (v2Missing && name === 'get_current_conversations_page_v2') {
        return { data: null, error: { code: 'PGRST202', message: 'not found' } };
      }
      return {
        data: {
          inbox: [],
          page: args.p_page,
          pageSize: args.p_page_size,
          totalMatching: 0,
          counts: {},
          owners: [],
        },
        error: null,
      };
    },
  };
  const reader = load('lib/conversations-page-data.ts', {
    'server-only': {},
    '@/lib/supabase/server': { createClient: async () => session },
    '@/lib/inbox-topics': { INBOX_TOPICS: ['fee', 'dates', 'register', 'accommodation', 'online_offline', 'location', 'certification'] },
    '@/lib/inbox-waiting': { isRecentWait: (at, now) => Boolean(at) && now - Date.parse(at) <= 7 * 86400000 },
  });
  return { reader, calls };
}

test('Inbox defaults to latest conversation activity instead of lead creation', async () => {
  // Default view is All again (25 Nov 2026): this week's waiting chats are counted
  // first (for the Waiting badge), then the All page, newest activity first.
  const {reader,calls} = setup();
  const result = await reader.getInboxPage({}, 'team');
  assert.equal(result.sort, 'activity_desc');
  assert.equal(result.filter, 'all');
  assert.equal(calls[0].name, 'get_current_conversations_page_v2');
  assert.equal(calls[0].args.p_filter, 'reply');
  const page = calls.at(-1);
  assert.equal(page.args.p_filter, 'all');
  assert.equal(page.args.p_topic, 'all');
  assert.equal(page.args.p_sort, 'activity_desc');
  assert.equal(page.args.p_page, 1);
  assert.equal(page.args.p_scope, 'team');
});

test('Inbox falls back to the v1 page reader only when v2 is not deployed', async () => {
  const {reader,calls} = setup({ v2Missing: true });
  const result = await reader.getInboxPage({ topic: 'fee' }, 'team');
  assert.deepEqual(calls.slice(0, 2).map((c) => c.name), ['get_current_conversations_page_v2', 'get_current_conversations_page_v1']);
  assert.ok(calls.slice(1).every((c) => c.name === 'get_current_conversations_page_v1' && !('p_topic' in c.args)));
  assert.equal(result.topic, 'all');
  assert.equal(result.channelCounts, null);
  assert.equal(result.topicCounts, null);
});

test('Unknown topics are ignored', async () => {
  const {reader,calls} = setup();
  await reader.getInboxPage({ topic: 'drop table' }, 'team');
  assert.ok(calls.every((c) => c.args.p_topic === 'all'));
  const before = calls.length;
  await reader.getInboxPage({ topic: 'fee' }, 'team');
  assert.ok(calls.slice(before).every((c) => c.args.p_topic === 'fee'));
});

test('Explicit created-date sort is retained and unsupported sort defaults safely', async () => {
  // On the All tab: the first call counts this week's waiting chats, the second is the page.
  const {reader,calls} = setup();
  assert.equal((await reader.getInboxPage({sort:'created_desc', filter:'all'}, 'team')).sort, 'created_desc');
  assert.equal(calls[1].args.p_sort, 'created_desc');
  assert.equal((await reader.getInboxPage({sort:'unexpected', filter:'all'}, 'team')).sort, 'activity_desc');
  assert.equal(calls[3].args.p_sort, 'activity_desc');
});

test('Sidebar treats activity-first as default and preserves user sort choice', () => {
  const sidebar = readFileSync('components/conversations-sidebar.tsx','utf8');
  const sql = readFileSync('supabase/migrations/20261104185000_inbox_paged_read_performance_v2.sql','utf8');
  assert.ok(sidebar.includes('pagination.sort !== "activity_desc"'));
  assert.ok(sidebar.includes('<option value="activity_desc">Latest conversation activity</option>'));
  assert.ok(sidebar.includes('<option value="created_desc">Newest created first</option>'));
  assert.match(sql, /when v_sort = 'activity_desc' then activity_at end desc nulls last/);
});

test('Inbox refreshes on returning to a visible tab or restoring the browser connection', () => {
  const realtime = readFileSync('components/conversations-realtime.tsx','utf8');
  assert.match(realtime, /document\.addEventListener\('visibilitychange', refreshOnVisibility\)/);
  assert.match(realtime, /document\.visibilityState === 'visible'\) refreshInbox\(\)/);
  assert.match(realtime, /window\.addEventListener\('focus', refreshInbox\)/);
  assert.match(realtime, /window\.addEventListener\('online', refreshInbox\)/);
  for (const listener of [
    "document.removeEventListener('visibilitychange', refreshOnVisibility)",
    "window.removeEventListener('focus', refreshInbox)",
    "window.removeEventListener('online', refreshInbox)",
  ]) assert.ok(realtime.includes(listener));
  assert.ok(realtime.includes(".channel('crm-conversations-live')"));
  assert.ok(realtime.includes("router.refresh()"));
  assert.ok(realtime.includes("return <InstagramOutboundBridge />;"));
  assert.doesNotMatch(realtime, /setInterval\(/);
  assert.doesNotMatch(realtime, /INSTAGRAM_OUTBOUND_ECHO_ENABLED\s*=\s*true/);
});
