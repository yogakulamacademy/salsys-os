const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const file = (filename) => fs.readFileSync(path.join(root, filename), "utf8");
const funnel = file("docs/sql/r2-p2-behavior-funnel-reconcile-v1.sql");
const pages = file("docs/sql/r2-p2-behavior-page-reconcile-v1.sql");
const runbook = file("docs/r2-p2-behavior-live-acceptance-runbook-v1.md");
const activeSql = (sql) => sql.split("\n")
  .filter((line) => !line.trimStart().startsWith("--")).join("\n");

function noWritesOrIdentifierOutput(sql) {
  const query = activeSql(sql);
  assert.match(query, /^\s*with\s+params\s+as\s*\(/i);
  assert.doesNotMatch(query, /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b/i);
  assert.match(query, /:'organization_id'::uuid/);
  assert.match(query, /:'days'::integer/);
  assert.match(query, /join params p on e\.organization_id = p\.organization_id/);
  assert.match(query, /p\.days in \(7,14,30\)/);
  assert.match(query, /limit 50001/i);
  assert.match(query, /v\.candidate_events > 50000/);
  assert.match(query, /'is_authenticated_role_test',false/);

  const exported = query.slice(query.lastIndexOf("select jsonb_build_object("));
  for (const exposed of ["'anonymous_visitor_id'", "'session_key'",
    "'tracking_source_id'", "'visitor_id'", "'source_id'", "'lead_id'",
    "'payload'", "'pagePath'", "'organization_id'"]) {
    assert.ok(!exported.includes(exposed), "Output contains raw identifier key: " + exposed);
  }
}

test("funnel comparator is source-scoped, ordered, tenant-bound and never writes", () => {
  noWritesOrIdentifierOutput(funnel);
  assert.match(funnel, /array\['web\.page_viewed','web\.form_started','web\.form_submitted'\]::text\[\]/);
  assert.match(funnel, /e\.received_at >= p\.captured_at - make_interval\(days => p\.days\) - interval '1 day'/);
  assert.match(funnel, /e\.occurred_at between p\.captured_at - make_interval\(days => p\.days\)/);
  assert.match(funnel, /p\.captured_at \+ interval '5 minutes'/);
  assert.match(funnel, /e\.tracking_source_id is not null/);
  assert.match(funnel, /nullif\(e\.session_key,''\) is not null/);
  assert.match(funnel, /nullif\(e\.anonymous_visitor_id,''\) is not null/);
  assert.match(funnel, /array_agg\(b\.source_event_type order by b\.occurred_at,b\.id\)/);
  assert.doesNotMatch(funnel, /public\.native_funnel_depth_v1\(/);
  assert.match(funnel, /unnest\(s\.ordered_events\) with ordinality/);
  assert.match(funnel, /e\.event_name = 'web\.form_started' and e\.ord > first_step\.ord/);
  assert.match(funnel, /e\.event_name = 'web\.form_submitted' and e\.ord > second_step\.ord/);
  assert.match(funnel, /generate_subscripts\(p\.steps,1\)/);
  assert.match(funnel, /'uses_independent_ordering_check',true/);
  assert.match(funnel, /'is_path_edge_reconciliation',false/);
});

test("page comparator is bounded, k-suppressed, safe-path and summary-only", () => {
  noWritesOrIdentifierOutput(pages);
  assert.match(pages, /:'event'::text/);
  assert.match(pages, /public\.tracking_event_contracts/);
  assert.match(pages, /c\.status = 'active'/);
  assert.match(pages, /public\.native_safe_behavior_breakdown_page_v1\(e\.payload ->> 'pagePath'\)/);
  assert.match(pages, /e\.received_at >= \(p\.today_utc - p\.days\)::timestamp at time zone 'UTC'/);
  assert.match(pages, /count\(distinct \(tracking_source_id,anonymous_visitor_id\)\)/);
  assert.match(pages, /nullif\(anonymous_visitor_id,''\) is not null\) >= 3/);
  assert.match(pages, /limit 10/);
  assert.match(pages, /'hidden_or_other_events',t\.total_events-d\.displayed_events/);
  assert.match(pages, /'returns_page_paths',false/);
  assert.match(pages, /'uses_live_safe_path_helper',true/);
  assert.match(pages, /'is_authenticated_role_test',false/);
  assert.match(pages, /'unregistered_event'/);
});

test("runbook distinguishes sample comparison from real authorized tenant acceptance", () => {
  assert.match(runbook, /r2-p2-behavior-funnel-reconcile-v1\.sql/);
  assert.match(runbook, /r2-p2-behavior-page-reconcile-v1\.sql/);
  assert.match(runbook, /distinct funnel session counts/i);
  assert.match(runbook, /page summary/i);
  assert.match(runbook, /does not prove actual owner\/admin permissions/i);
  assert.match(runbook, /Issue #523 remains OPEN/);
  assert.match(runbook, /No billable staging project/);
});
