const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync('supabase/migrations/20261116120000_session_binding_policy_execute_fix_v1.sql', 'utf8');
const code = sql.replace(/--.*$/gm, '');

test('policies use the executable member helper, not the revoked internal helper', () => {
  for (const policy of [
    'organization_capabilities_member_select',
    'system_intelligence_learning_profiles_select',
    'system_intelligence_outcome_runs_select',
    'system_intelligence_recommendation_events_select',
    'system_intelligence_recommendation_signal_state_select',
    'system_intelligence_recommendations_select',
    'lead_objection_signals_read_v1',
    'lead_objection_signals_insert_v1',
    'lead_objection_signals_update_v1',
  ]) {
    assert.match(code, new RegExp(`alter policy ${policy}\\b`), policy);
  }
  // The only remaining mention is inside the guard's LIKE pattern.
  assert.equal((code.match(/session_is_bound_to_organization\(/g) || []).length, 0);
  assert.ok(!/grant\s+execute[^;]*session_is_bound_to_organization/i.test(code), 'must not re-grant the internal helper');
});

test('objection signal writes compare the lead to the row tenant, not to itself', () => {
  assert.ok(!code.includes('l.organization_id = l.organization_id'));
  assert.equal((code.match(/l\.organization_id = lead_objection_signals\.organization_id/g) || []).length, 2);
});

test('migration fails if any public policy still calls the revoked helper', () => {
  assert.ok(code.includes("raise exception 'Policies still call session_is_bound_to_organization directly: %'"));
});
