const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

function setup() {
  const calls = [];
  const session = {
    rpc: async (name, args) => {
      calls.push({name,args});
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
  });
  return { reader, calls };
}

test('Inbox defaults to latest conversation activity instead of lead creation', async () => {
  const {reader,calls} = setup();
  const result = await reader.getInboxPage({}, 'team');
  assert.equal(result.sort, 'activity_desc');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'get_current_conversations_page_v1');
  assert.equal(calls[0].args.p_sort, 'activity_desc');
  assert.equal(calls[0].args.p_page, 1);
  assert.equal(calls[0].args.p_scope, 'team');
});

test('Explicit created-date sort is retained and unsupported sort defaults safely', async () => {
  const {reader,calls} = setup();
  assert.equal((await reader.getInboxPage({sort:'created_desc'}, 'team')).sort, 'created_desc');
  assert.equal(calls[0].args.p_sort, 'created_desc');
  assert.equal((await reader.getInboxPage({sort:'unexpected'}, 'team')).sort, 'activity_desc');
  assert.equal(calls[1].args.p_sort, 'activity_desc');
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
