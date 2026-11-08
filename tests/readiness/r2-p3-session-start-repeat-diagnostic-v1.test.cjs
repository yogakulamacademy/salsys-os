// R2-P3 operator-only SQL quality diagnostic. Structural contract tests do
// not prove live authorization or replay/retention correctness.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(path.join(root,
  'docs/sql/r2-p3-session-start-repeat-diagnostic-v1.sql'), 'utf8');
const contract = fs.readFileSync(path.join(root,
  'docs/r2-p3-retention-cohort-contract-v1.md'), 'utf8');
const active = sql.split('\n').filter(line =>
  !line.trimStart().startsWith('--')).join('\n');
const output = active.slice(active.lastIndexOf('select jsonb_build_object('));

test('same tenant, canonical session-start events and bounded UTC windows', () => {
  assert.match(active, /^\s*with params as \(/i);
  assert.match(active, /:'organization_id'::uuid/);
  assert.match(active, /:'days'::integer/);
  assert.match(active, /join params p on e\.organization_id = p\.organization_id/);
  assert.match(active, /p\.days in \(7,14,30\)/);
  assert.match(active, /e\.event_family = 'web'/);
  assert.match(active, /e\.source_event_type = 'web\.session_started'/);
  assert.match(active, /e\.received_at <= p\.captured_at/);
  assert.match(active, /order by e\.occurred_at, e\.id/);
  assert.match(active, /limit 50001/);
  assert.match(active, /when v\.candidate_events > 50000 then 'volume_limit'/);
  assert.match(active, /when v\.candidate_events = 0 then 'no_observations'/);
  assert.match(active, /when p\.days not in \(7,14,30\) or p\.days is null then 'invalid_window'/);
  assert.match(active, /else '\{\}'::jsonb end/);
});

test('repeat starts are classified within complete source-scoped session identities', () => {
  assert.match(active, /group by tracking_source_id, anonymous_visitor_id, session_key/);
  assert.match(active, /nullif\(btrim\(anonymous_visitor_id\),''\) is not null/);
  assert.match(active, /nullif\(btrim\(session_key\),''\) is not null/);
  assert.match(active, /count\(distinct source_event_id\)/);
  assert.match(active, /count\(distinct event_day_utc\)/);
  assert.match(active, /observed_starts>1 and distinct_source_event_ids=1/);
  assert.match(active, /observed_starts>1 and distinct_source_event_ids>1/);
  assert.match(active, /observed_starts>1 and distinct_event_days>1/);
  assert.match(active, /coalesce\(sum\(greatest\(observed_starts-1,0\)\),0\)/);
  assert.match(active, /repeated_keys_with_missing_event_id/);
  assert.match(active, /maximum_repeat_receipt_span_minutes/);
});

test('report exports only aggregate quality counts and rejects false retention readiness', () => {
  assert.ok(output.startsWith('select jsonb_build_object('));
  assert.doesNotMatch(active, /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b/i);
  for (const forbidden of [
    "'organization_id'", "'tracking_source_id'", "'anonymous_visitor_id'",
    "'session_key'", "'source_event_id'", "'visitor_id'", "'payload'",
    "'event_id'", "'url'", "'lead_id'", "'page_path'",
  ]) assert.ok(!output.includes(forbidden), 'Raw identifier in output: ' + forbidden);
  for (const boundary of [
    "'is_retention_kpi',false",
    "'proves_history_completeness',false",
    "'proves_retry_root_cause',false",
    "'is_authenticated_role_test',false",
  ]) assert.ok(output.includes(boundary), 'Missing evidence boundary: ' + boundary);
  assert.match(sql, /operator-only/i);
  assert.match(sql, /not retention/i);
  assert.match(contract, /repeat-session-start diagnostic/i);
});
