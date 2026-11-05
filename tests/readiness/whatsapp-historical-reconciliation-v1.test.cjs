const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const sql = readFileSync('docs/sql/whatsapp-historical-failure-reconciliation-readonly-v1.sql', 'utf8');
const trigger = readFileSync('supabase/migrations/20261027090000_db_incident_hardening_v2.sql', 'utf8');
const creator = readFileSync('supabase/migrations/20261027143000_create_crm_lead_explicit_attribution_tenant_v1.sql', 'utf8');
const audit = readFileSync('docs/phase-b-whatsapp-historical-failure-reconciliation-v1.md', 'utf8');

test('historical reconciliation SQL emits only numeric/timestamp aggregates and never mutates records', () => {
  assert.match(sql, /This file NEVER updates records/);
  const executable = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(executable,
    /\b(?:insert\s+into|update\s+|delete\s+from|alter\s+|drop\s+|create\s+|truncate\s+|grant\s+|revoke\s+|call\s+|perform\s+)\b/i);
  assert.doesNotMatch(executable, /(?:select\s+.*\bpayload\b|select\s+.*\bprocessing_error\b|select\s+\*)/i);
  for (const table of [
    'public.whatsapp_webhook_events',
    'public.raw_events',
    'public.whatsapp_crm_message_links',
    'public.messages',
    'public.lead_contacts',
    'public.conversations',
  ]) assert.ok(executable.includes(table), table);
  assert.match(executable, /count\(\*\)/);
  assert.match(executable, /organization_id=f.organization_id/);
  assert.match(executable, /organization_id=p.organization_id/);
  assert.match(executable, /historical_attribution_tenant_errors/);
  assert.match(executable, /processed_without_exact_message/);
  assert.match(executable, /active_attribution_guard_triggers/);
  assert.doesNotMatch(executable, /\b(?:phone_number_id|contact_wa_id|external_message_id)\s+as\s+\w+/i);
});

test('source migrations explicitly fill attribution tenant and block mismatches', () => {
  assert.match(trigger, /if new.organization_id is null then[\s\S]*new.organization_id := v_lead_organization_id/);
  assert.match(trigger, /elsif new.organization_id <> v_lead_organization_id then/);
  assert.match(trigger, /before insert or update of lead_id, organization_id/);
  assert.match(trigger, /trg_lead_attribution_enforce_organization_v1/);
  assert.match(trigger, /raise exception 'lead_attribution requires an existing lead'/);
  assert.match(creator, /v_new_full_values text := 'values\([\s\S]*v_lead.id,p_organization_id/);
  assert.match(creator, /v_new_minimal text := 'insert into public.lead_attribution\(lead_id,organization_id\)/);
  assert.match(creator, /v_updated := replace\(v_definition, v_old_full, v_new_full\)/);
  assert.match(creator, /if position\(v_old_full in v_definition\) = 0/);
});

test('runbook distinguishes old raw evidence, CRM matching and safe-to-recover judgment', () => {
  assert.match(audit, /5 of 6/);
  assert.match(audit, /6 older processed/);
  assert.match(audit, /no automatic replay/i);
  assert.match(audit, /provider message ID/i);
  assert.match(audit, /no message bodies/i);
  assert.match(audit, /lead_attribution/);
  assert.match(audit, /separate approval/i);
  assert.doesNotMatch(audit, /replay.*automatically/i);
});
