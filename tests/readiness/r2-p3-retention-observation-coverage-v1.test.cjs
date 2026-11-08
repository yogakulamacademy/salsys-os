// R2-P3 read-only audit guard: observation coverage is not verified completeness.
// This is a static/structural safety test, not production acceptance or an RPC.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const sql = fs.readFileSync(path.join(root,
  "docs/sql/r2-p3-retention-readiness-v1.sql"), "utf8");
const contract = fs.readFileSync(path.join(root,
  "docs/r2-p3-retention-cohort-contract-v1.md"), "utf8");
const active = sql.split("\n").filter((line) =>
  !line.trimStart().startsWith("--")).join("\n");

test("historical observation audit is SELECT-only and scoped to an operator-provided tenant", () => {
  assert.match(active, /with\s+params\s+as\s*\(/i);
  assert.match(active, /:'organization_id'::uuid/);
  assert.match(active, /from public\.raw_events e\s+join params p on e\.organization_id = p\.organization_id/i);
  assert.match(active, /'status','not_ready_for_retention_kpi'/);
  assert.match(active, /limit 50001/i);
  assert.doesNotMatch(active, /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b/i);
});

test("observed web-event UTC-day coverage explicitly excludes current incomplete day", () => {
  assert.equal((active.match(/count\(distinct \(e\.occurred_at at time zone 'UTC'\)::date\)/g) || []).length, 2);
  for (const days of [30, 60]) {
    assert.match(active, new RegExp(
      "count\\(distinct \\(e\\.occurred_at at time zone 'UTC'\\)::date\\)" +
      "[\\s\\S]*?p\\.today_utc - " + days +
      "[\\s\\S]*?p\\.today_utc\\)::integer\\s+as observed_closed_utc_days_last_" + days));
    assert.match(active, new RegExp(
      "'observed_closed_utc_days_last_" + days + "', h\\.observed_closed_utc_days_last_" + days));
  }
  assert.match(active, /'closed_utc_days_without_web_observations_last_60',\s+60 - h\.observed_closed_utc_days_last_60/);
  assert.match(active, /'current_utc_day_incomplete', true/);
  assert.match(active, /'history_completeness_verified', false/);
  assert.match(contract, /observed days are not proof of (source|ingestion) completeness/i);
});

test("coverage output stays privacy-bounded and cannot masquerade as D30 readiness", () => {
  const output = active.slice(active.lastIndexOf("select jsonb_build_object("));
  for (const key of ["'organization_id'", "'tracking_source_id'", "'anonymous_visitor_id'",
    "'session_key'", "'visitor_id'", "'event_id'", "'payload'", "'url'", "'path'"]) {
    assert.ok(!output.includes(key), "Sensitive field in output: " + key);
  }
  assert.match(output, /'history_completeness_verified', false/);
  assert.match(output, /'observed_metrics_are_people',false/);
  assert.match(output, /'identity_and_consent_continuity','requires_controlled_browser_validation'/);
  assert.match(contract, /16 of 60 closed UTC days/i);
});
