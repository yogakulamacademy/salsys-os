const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(path.join(root, 'docs/sql/r2-consent-receipt-continuity-audit-v1.sql'), 'utf8');
const active = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
const output = active.slice(active.lastIndexOf('select jsonb_build_object('));

test('audit is restricted to operator-supplied organization and one active site source', () => {
  assert.match(active, /:'organization_id'::uuid/);
  assert.match(active, /:'hostname'/);
  assert.match(active, /:'hours'::integer/);
  assert.match(active, /os\.organization_id=p\.organization_id/);
  assert.match(active, /t\.organization_site_id=os\.id/);
  assert.match(active, /t\.organization_id=os\.organization_id/);
  assert.match(active, /os\.status='active'/);
  assert.match(active, /t\.status='active'/);
  assert.match(active, /where \(select n=1 from source_count\)/);
  assert.match(active, /when c\.n<>1 then 'invalid_source_scope'/);
  assert.match(active, /when p\.hours not between 1 and 72 then 'invalid_window'/);
});

test('bounded session-start evidence and fail-closed volume report', () => {
  for (const rule of [
    /e\.event_family='web'/,
    /e\.source_event_type='web\.session_started'/,
    /e\.received_at>=p\.captured_at-\(p\.hours\*interval '1 hour'\)/,
    /e\.received_at<=p\.captured_at/,
    /order by e\.received_at,e\.id/,
    /limit 50001/,
    /when v\.candidate_events>50000 then 'volume_limit'/,
  ]) assert.match(active, rule);
  assert.match(active, /when v\.candidate_events=0 then 'no_observations'/);
});

test('prior consent decision is same tenant/browser and predates both event clocks', () => {
  assert.match(active, /public\.privacy_consent_receipts r/);
  assert.match(active, /r\.organization_id=s\.organization_id/);
  assert.match(active, /r\.anonymous_visitor_id=s\.anonymous_visitor_id/);
  assert.match(active, /r\.purpose_key='analytics'/);
  assert.match(active, /r\.occurred_at<=s\.occurred_at/);
  assert.match(active, /r\.received_at<=s\.received_at/);
  assert.match(active, /order by r\.occurred_at desc,r\.received_at desc,r\.id desc/);
  assert.match(active, /count\(\*\) filter\(where prior_decision='denied'\)/);
  assert.match(active, /count\(\*\) filter\(where prior_decision is null\)/);
  assert.match(active, /prior_source='browser_sdk_v1'/);
  assert.ok(active.includes("nullif(btrim(prior_notice_version),'')"));
});

test('no write/identity export and no false assertion of CMP acceptance', () => {
  assert.match(active, /^\s*with params as \(/);
  assert.doesNotMatch(active, /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b/i);
  assert.ok(output.startsWith('select jsonb_build_object('));
  for (const forbidden of [
    "'organization_id'", "'anonymous_visitor_id'", "'tracking_source_id'",
    "'session_key'", "'receipt_id'", "'lead_id'", "'source_hostname'",
    "'visitor_id'", "'page_path'", "'payload'", "'url'",
  ]) assert.ok(!output.includes(forbidden), 'Raw identifier/event output: '+forbidden);
  for (const gate of [
    "'verifies_cmp_user_choice',false",
    "'verifies_third_party_suppression',false",
    "'verifies_staging_consent_acceptance',false",
    "'is_authenticated_role_test',false",
  ]) assert.ok(output.includes(gate));
});
