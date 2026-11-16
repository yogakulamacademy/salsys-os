const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const read = (p) => readFileSync(path.join(__dirname, '../..', p), 'utf8');

const sql = read('supabase/migrations/20261116180000_inbox_list_topics_v2.sql');
const v1 = read('supabase/migrations/20261104185000_inbox_paged_read_performance_v2.sql');

test('v2 is additive and keeps every v1 authorization check', () => {
  assert.doesNotMatch(sql, /get_current_conversations_page_engine_v1\(/);
  assert.doesNotMatch(sql, /function public\.get_current_conversations_page_v1/);
  for (const guard of [
    "auth.role() <> 'authenticated' or auth.uid() is null",
    'public.current_tenant_organization_id()',
    "? 'sales'",
    'public.can_access_lead(o.id)',
    'm.organization_id = v_organization_id',
  ]) {
    assert.ok(sql.includes(guard), `missing guard: ${guard}`);
    assert.ok(v1.includes(guard), `v1 baseline changed: ${guard}`);
  }
  assert.match(sql, /revoke all on function public\.get_current_conversations_page_v2[\s\S]*from public, anon/);
  assert.match(sql, /security definer/);
});

test('topic filter only accepts known topics and is applied with the other filters', () => {
  assert.match(sql, /v_topic text := case when p_topic in \('fee', 'dates', 'register', 'accommodation', 'online_offline', 'location', 'certification', 'other'\) then p_topic else 'all' end/);
  assert.match(sql, /and \(v_topic = 'all' or s\.topic = v_topic\)/);
  assert.match(sql, /'topics', coalesce/);
  assert.match(sql, /'channels', \(select jsonb_build_object/);
});

test('loader falls back to v1 only when v2 is not deployed', () => {
  const data = read('lib/conversations-page-data.ts');
  assert.match(data, /get_current_conversations_page_v2/);
  assert.match(data, /error\.code === "PGRST202" \|\| error\.code === "42883"\)\)\s*\{\s*usedV2 = false/);
  assert.match(data, /get_current_conversations_page_v1", args/);
});

test('client sidebar imports topic constants from a shared module, not server-only code', () => {
  const sidebar = read('components/conversations-sidebar.tsx');
  assert.match(sidebar, /from "@\/lib\/inbox-topics"/);
  assert.doesNotMatch(sidebar, /import \{[^}]*\} from "@\/lib\/conversations-page-data"/);
  assert.doesNotMatch(read('lib/inbox-topics.ts'), /server-only/);
});

test('topic is part of queue navigation and reset', () => {
  const nav = read('lib/inbox-query-navigation.ts');
  assert.match(nav, /"channel", "topic"\]/);
  assert.match(nav, /"priority", "channel", "topic",\n/);
});
