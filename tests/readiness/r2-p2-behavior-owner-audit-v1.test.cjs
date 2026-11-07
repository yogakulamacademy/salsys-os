const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const metadata = read("docs/sql/r2-p2-behavior-metadata-audit-v1.sql");
const trends = read("docs/sql/r2-p2-behavior-trends-reconcile-v1.sql");
const runbook = read("docs/r2-p2-behavior-live-acceptance-runbook-v1.md");
const sqlWithoutComments = (value) =>
  value.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
const cannotWrite = (value) => assert.doesNotMatch(sqlWithoutComments(value),
  /\b(?:insert|update|delete|alter|drop|truncate|create|call|grant|revoke)\b/i);

test("metadata audit is non-mutating and returns only function/table security properties", () => {
  cannotWrite(metadata);
  assert.match(sqlWithoutComments(metadata), /^\s*with\s+required\(name\)/i);
  assert.match(metadata, /select jsonb_build_object\(/);
  for (const name of [
    "get_native_behavior_workspace_v1",
    "get_native_behavior_event_trends_v1",
    "get_native_behavior_page_breakdown_v1",
  ]) {
    assert.ok(metadata.includes(name), "Missing Behavior RPC: " + name);
  }
  assert.match(metadata, /has_function_privilege\('anon',oid,'EXECUTE'\)/);
  assert.match(metadata, /has_function_privilege\('authenticated',oid,'EXECUTE'\)/);
  assert.match(metadata, /has_table_privilege\('anon',c\.oid,'SELECT'\)/);
  assert.match(metadata, /has_table_privilege\('authenticated',c\.oid,'SELECT'\)/);
  assert.match(metadata, /public\.raw_events/);
  assert.match(metadata, /public\.tracking_sources/);
  assert.match(metadata, /session_is_bound_to_organization\(p_organization_id\)/);
  assert.match(metadata, /'overall_pass'/);
  assert.match(metadata, /'is_live_role_acceptance',false/);
  assert.doesNotMatch(metadata, /select\s+\*\s+from\s+public\.raw_events/i);
});

test("operator trend reconciliation is tenant-bound, bounded and aggregate only", () => {
  cannotWrite(trends);
  assert.match(trends, /:'organization_id'::uuid/);
  assert.match(trends, /:'days'::int/);
  assert.match(trends, /join params p on e\.organization_id = p\.organization_id/);
  assert.match(trends, /p\.days in \(7,14,30\)/);
  for (const event of ["web.page_viewed", "web.form_started", "web.form_submitted"]) {
    assert.ok(trends.includes(event), "Missing default event: " + event);
  }
  assert.match(trends, /and e\.received_at >=/);
  assert.match(trends, /limit 50001/i);
  assert.match(trends, /v\.candidate_events > 50000/);
  assert.match(trends, /count\(distinct \(b\.tracking_source_id,b\.anonymous_visitor_id,b\.session_key\)\)/i);
  assert.match(trends, /'last_day_incomplete',true/);
  assert.match(trends, /'is_authenticated_role_test',false/);
  assert.match(trends, /'is_funnel_or_path_reconciliation',false/);
  const output = trends.slice(trends.lastIndexOf("select jsonb_build_object("));
  for (const key of ["'anonymous_visitor_id'", "'session_key'", "'tracking_source_id'",
    "'source_id'", "'visitor_id'", "'lead_id'", "'payload'", "'pagePath'"]) {
    assert.ok(!output.includes(key), "Private output key: " + key);
  }
});

test("owner/admin release checklist is explicit about missing real-user QA and privacy", () => {
  assert.match(runbook, /Issue #523 remains OPEN/);
  assert.match(runbook, /Synthetic two-tenant tests/);
  assert.match(runbook, /session_is_bound_to_organization/);
  assert.match(runbook, /Marketing → Behavior/);
  assert.match(runbook, /R2-P1 optional collector Issue #520 remains OFF/);
  assert.match(runbook, /Draft PR #530/);
  assert.match(runbook, /No billable staging project/);
  assert.match(runbook, /Do \*\*not\*\* post organization IDs/);
  assert.match(runbook, /PASS \/ FAIL \/ BLOCKED/);
  assert.match(runbook, /intentionally nonexistent synthetic tenant ID/);
});
