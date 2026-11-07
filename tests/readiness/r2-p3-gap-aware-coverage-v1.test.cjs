// Guard an operator-only, bounded research diagnostic from becoming a live KPI.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sql = fs.readFileSync(path.join(__dirname,
  "../../docs/sql/r2-p3-gap-aware-coverage-v1.sql"), "utf8");
const active = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

test("retention coverage query is SELECT-only and requires a tenant and bounded windows", () => {
  assert.match(active, /:'organization_id'::uuid/);
  assert.match(active, /e\.organization_id\s*=\s*b\.organization_id/);
  assert.match(active, /e\.event_family\s*=\s*'web'/);
  assert.match(active, /e\.source_event_type\s*=\s*'web\.session_started'/);
  assert.match(active, /window_days in \(7,14,30\)/);
  assert.match(active, /return_day in \(1,7,30\)/);
  assert.match(active, /limit 50001/i);
  assert.match(active, /volume_limit/);
  assert.doesNotMatch(active, /\b(?:insert|update|delete|truncate|create|drop|alter|grant|revoke|copy|execute)\b/i);
});
test("coverage observation is never treated as verified ingestion or a KPI", () => {
  for (const marker of [
    "days_without_observed_session_starts", "last_closed_day_ingestion_attested",
    "source_coverage_attested", "identity_and_consent_continuity_verified",
    "'is_retention_kpi',false", "'is_authenticated_role_test',false",
    "'coverage_observation_only'", "'candidate_session_start_receipts'",
  ]) assert.ok(active.includes(marker), marker);
  assert.match(sql, /zero starts does NOT prove an ingest outage/i);
});
test("query returns aggregates only and fails closed when capped", () => {
  assert.match(active, /v\.candidate_events > 50000 then 'volume_limit'/);
  assert.match(active, /case when v\.candidate_events <= 50000/);
  assert.match(active, /'candidate_receipt_limit_exceeded',v\.candidate_events > 50000/);
  assert.match(active, /'candidate_session_start_receipts',case when v\.candidate_events <= 50000/);
  assert.doesNotMatch(active, /\b(e\.|b\.)?(anonymous_visitor_id|session_key|tracking_source_id|payload|email|phone|full_name)\b/i);
  assert.doesNotMatch(active, /\bretention_(?:rate|percent)|\bcohort_(?:returns|denominator)\b/i);
});
