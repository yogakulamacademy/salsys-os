const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const sql = fs.readFileSync(path.join(root,
  "docs/sql/r2-p2-repeat-public-pageview-diagnostic-v1.sql"), "utf8");
const statements = sql.split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

test("Repeat-pageview diagnostic stays SELECT-only and tenant scoped", () => {
  assert.match(statements, /with params as\s*\(/i);
  assert.match(statements, /:'organization_id'::uuid/);
  assert.match(statements, /:'days'::integer/);
  assert.match(statements, /e\.organization_id = p\.organization_id/);
  assert.match(statements, /e\.source_event_type = 'web\.page_viewed'/);
  assert.match(statements, /e\.occurred_at >=/);
  assert.match(statements, /e\.occurred_at </);
  assert.match(statements, /e\.received_at >=/);
  assert.doesNotMatch(statements,
    /\b(?:insert\s+into|update\s+\w|delete\s+from|truncate|drop\s+table|create\s+table|alter\s+table|grant\s+|revoke\s+|perform\s+)\b/i);
});

test("Public-path normalization and reporting volume limits remain in place", () => {
  assert.match(statements, /native_safe_behavior_breakdown_page_v1/);
  assert.match(statements, /safe_path <> '\/other'/);
  assert.match(statements, /limit 50001/i);
  assert.match(statements, /candidate_events > 50000/);
  assert.match(statements, /'volume_limit'/);
  assert.match(statements, /p\.days in \(7,14,30\)/);
  assert.match(statements, /limit 10/i);
});

test("Only cohort-level review candidates with multiple distinct visitors are returned", () => {
  assert.match(statements, /s\.distinct_visitors >= 3/);
  assert.match(statements, /s\.identified_sessions >= 5/);
  assert.match(statements, /p\.all_views >= 50/);
  assert.match(statements, /views_in_session >= 10/g);
  assert.match(statements, /s\.identified_views::numeric \/ nullif\(s\.identified_sessions,0\) >= 10/);
  assert.match(statements, /s\.views_in_ten_plus_sessions::numeric\s*\/\s*nullif\(s\.identified_views,0\) >= 0\.70/);
  assert.match(statements, /'review_reason','high_repeat_page_views'/);
});

test("No raw visitor/source/session identifiers, bot claims or automatic exclusions in output", () => {
  const resultSection = statements.slice(statements.indexOf("report_rows as ("));
  assert.ok(resultSection.length > 0, "JSON output section must be found");
  assert.doesNotMatch(resultSection, /anonymous_visitor_id|session_key|tracking_source_id/);
  assert.match(resultSection, /'automatic_exclusion',false/);
  assert.match(resultSection, /'bot_or_fraud_determination',false/);
  assert.match(resultSection, /'raw_identifiers_returned',false/);
  assert.match(resultSection, /'status',case/);
});
