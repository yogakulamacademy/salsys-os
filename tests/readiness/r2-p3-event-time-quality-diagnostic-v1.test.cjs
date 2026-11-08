// R2-P3 operator-only SQL diagnostic review. Tests textual boundaries, not
// live data authorization or evidence that retention/cohort completeness passed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const sql = fs.readFileSync(path.join(repoRoot,
  "docs/sql/r2-p3-event-time-quality-diagnostic-v1.sql"), "utf8");
const contract = fs.readFileSync(path.join(repoRoot,
  "docs/r2-p3-retention-cohort-contract-v1.md"), "utf8");
const active = sql.split("\n").filter((line) =>
  !line.trimStart().startsWith("--")).join("\n");

test("receipt-time diagnostic remains tenant-scoped, operator-only and SELECT-only", () => {
  assert.match(active, /^\s*with params as \(/i);
  assert.match(active, /:'organization_id'::uuid/);
  assert.match(active, /:'days'::integer/);
  assert.match(active, /join params p on e\.organization_id = p\.organization_id/);
  assert.match(active, /p\.days in \(7,14,30\)/);
  assert.match(active, /e\.event_family = 'web'/);
  assert.match(active, /e\.source_event_type = 'web\.session_started'/);
  assert.match(active, /e\.received_at <= p\.captured_at/);
  assert.match(active, /limit 50001/i);
  assert.match(active, /v\.candidate_events > 50000/);
  assert.doesNotMatch(active, /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b/i);
});

test("returned JSON is bounded aggregate-only and cannot claim retention acceptance", () => {
  const output = active.slice(active.lastIndexOf("select jsonb_build_object("));
  assert.ok(output.startsWith("select jsonb_build_object("));
  for (const field of ["'organization_id'", "'tracking_source_id'",
    "'anonymous_visitor_id'", "'session_key'", "'visitor_id'",
    "'raw_event'", "'payload'", "'pagePath'", "'url'"]) {
    assert.ok(!output.includes(field), "Identifier/key accidentally exported: " + field);
  }
  assert.match(output, /'is_retention_kpi',false/);
  assert.match(output, /'proves_history_completeness',false/);
  assert.match(output, /'is_authenticated_role_test',false/);
  assert.match(output, /'thresholds_are_approved_sla',false/);
  assert.match(output, /else '\{\}'::jsonb/);
  assert.match(output, /'status',case[\s\S]*'invalid_window'[\s\S]*'volume_limit'/);
});

test("lag buckets include negative skew, early receipts, and >24h delays", () => {
  for (const bucket of [
    "negative_beyond_5m", "negative_up_to_5m", "positive_up_to_5m",
    "positive_5m_to_1h", "positive_1h_to_24h",
    "positive_24h_to_48h", "positive_beyond_48h",
    "client_event_time_after_snapshot",
    "client_granted_snapshot", "client_missing_or_other_snapshot",
  ]) {
    assert.match(sql, new RegExp("as " + bucket + "\\b"),
      "Missing aggregated lag or quality bucket: " + bucket);
  }
  assert.match(sql, /lag_seconds < -300/);
  assert.match(sql, /lag_seconds >= -300 and lag_seconds < 0/);
  assert.match(sql, /lag_seconds >= 0 and lag_seconds <= 300/);
  assert.match(sql, /lag_seconds > 86400 and lag_seconds <= 172800/);
  assert.match(sql, /lag_seconds > 172800/);
  assert.match(contract, /24.hour.*(unapproved|not an approved)|24-hour.*not.*approved/i);
  assert.match(contract, /Additional timestamp-quality evidence/);
});

test("no public surface or KPI is introduced by the diagnostic", () => {
  assert.doesNotMatch(active, /create\s+(or\s+replace\s+)?(?:function|view|table)|security\s+definer/i);
  assert.match(sql, /operator-only/i);
  assert.match(sql, /NOT a retention KPI/i);
});
