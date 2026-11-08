const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../docs/sql/r2-optional-consent-metadata-audit-v1.sql'), 'utf8');
const sql = source.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');

test('operator audit is SELECT-only, tenant-bound, and uses bounded UTC days', () => {
  assert.match(sql, /with params as \(/);
  assert.match(sql, /:'organization_id'::uuid/);
  assert.match(sql, /:'days'::integer/);
  assert.match(sql, /e\.organization_id\s*=\s*p\.organization_id/);
  assert.match(sql, /e\.received_at\s*>=/);
  assert.match(sql, /e\.received_at\s*</);
  assert.match(sql, /p\.days in \(7,14,30\)/);
  assert.match(sql, /limit 50001/i);
  assert.match(sql, /candidate_events>50000/);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|alter|drop|create|truncate|grant|revoke|call|copy)\b/i);
});

test('optional analytics is separated from necessary form submissions', () => {
  for (const event of [
    'web.session_started', 'web.page_viewed', 'web.form_started',
    'web.scroll_depth_reached', 'web.cta_viewed', 'web.pricing_viewed',
    'web.faq_expanded', 'web.brochure_clicked',
    'web.form_validation_failed', 'web.form_acknowledged',
  ]) assert.ok(sql.includes("'" + event + "'"), event);
  assert.match(sql, /'web\.form_submitted','service_delivery'/);
  assert.match(sql, /public\.privacy_purpose_for_event_v1\(t\.event_name\)/);
  assert.match(sql, /expected_purpose is distinct from actual_purpose/);
  assert.match(sql, /filter \(where actual_purpose='analytics'\)/);
  assert.match(sql, /filter \(where actual_purpose='service_delivery'\)/);
  assert.match(sql, /analytics_metadata_review_required/);
  assert.match(sql, /service_delivery_metadata_without_grant/);
});

test('no raw visitor, person, form, path or tenant identifiers are returned', () => {
  assert.doesNotMatch(sql, /\be\.(?:anonymous_visitor_id|session_key|tracking_source_id|person_id|lead_id|payload|context|properties)\b/i);
  assert.doesNotMatch(sql, /\b(?:jsonb_build_object|json_build_object)\s*\(\s*'(?:organization_id|visitor_id|session_key|person_id|lead_id|url|path)'/i);
  assert.match(sql, /is_consent_authority_test',false/);
  assert.match(sql, /is_live_browser_test',false/);
  assert.match(sql, /is_retention_kpi',false/);
});
