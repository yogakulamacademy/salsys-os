const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const read = (file) => readFileSync(file, "utf8");

test("Inbox full-dataset RPC stays tenant and lead scoped", () => {
  const sql = read("supabase/migrations/20261104160000_inbox_full_dataset_page_v1.sql");
  for (const phrase of [
    "security invoker",
    "public.get_current_workspace_context_v1()",
    "public.has_workspace_access(v_organization_id, 'sales')",
    "public.can_access_lead(o.id)",
    "o.organization_id = v_organization_id",
    "p_page_size integer default 50",
    "limit v_page_size",
    "offset ((v_page::bigint - 1) * v_page_size)",
    "'totalMatching', (select count(*) from matched)",
    "created_at desc, id desc",
    "to authenticated;",
  ]) assert.ok(sql.includes(phrase), `Missing pagination/security guarantee: ${phrase}`);
  assert.doesNotMatch(sql, /security definer/i, "The new query must not bypass RLS");
});

test("UI uses the paged result and retains URL query context", () => {
  const data = read("lib/conversations-data.ts");
  const core = read("lib/conversations-data-core.ts");
  const page = read("app/conversations/page.tsx");
  const sidebar = read("components/conversations-sidebar.tsx");
  for (const phrase of [
    "getInboxPage(",
    "pagination,",
    "fullPage?.rows",
  ]) assert.ok(data.includes(phrase), phrase);
  assert.ok(core.includes("p_limit: paginatedInbox ? 1 : 300"));
  assert.ok(page.includes("getConversationsWorkspace(query.lead, query)"));
  assert.ok(sidebar.includes('Next inbox page'));
  assert.ok(sidebar.includes('Latest conversation activity'));
  assert.ok(sidebar.includes('setInboxParam("q", search.trim())'));
  assert.ok(sidebar.includes('params.set("lead", id)'));
});

test("page reader does not accept a client-supplied organization id", () => {
  const reader = read("lib/conversations-page-data.ts");
  assert.ok(reader.includes('"get_current_conversations_page_v1"'));
  assert.ok(reader.includes("p_page_size: 50"));
  assert.ok(reader.includes("totalMatching:"));
  assert.doesNotMatch(reader, /p_organization_id:/);
});
