import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261029112500_system_integrity_health_v1.sql',
  'utf8',
);

function requireText(needle, label) {
  if (!migration.includes(needle)) {
    throw new Error(`System integrity health V1 verification failed: missing ${label} (${needle})`);
  }
}

for (const [needle, label] of [
  ['v_system_integrity_health_v1', 'normalized integrity health view'],
  ['security_invoker = true', 'security invoker mode'],
  ['v_crm_core_integrity_health_v2', 'CRM Core V2 source'],
  ['v_customer360_identity_integrity_health_v2', 'Customer 360 V2 source'],
  ["'crm_core'::text as integrity_key", 'CRM Core normalized key'],
  ["'customer360'::text as integrity_key", 'Customer 360 normalized key'],
  ["when v.health_status = 'healthy' then 'healthy'::text", 'healthy normalization'],
  ["else 'warning'::text", 'degraded-to-warning normalization'],
  ['v.integrity_issue_count::bigint as issue_count', 'source issue count preservation'],
  ["'retained_deleted_lead_persons'", 'retained identity detail'],
  ["'open_identity_conflicts'", 'identity conflict detail'],
  ['revoke all on public.v_system_integrity_health_v1', 'public read revocation'],
  ['from public, anon, authenticated', 'anon/authenticated read revocation'],
  ['grant select on public.v_system_integrity_health_v1', 'service-role grant'],
  ['to service_role', 'service-role-only reader'],
]) {
  requireText(needle, label);
}

const lower = migration.toLowerCase();
for (const forbidden of [
  'drop view',
  'drop table',
  'delete from',
  'update public.',
  'insert into public.',
  'alter table',
]) {
  if (lower.includes(forbidden)) {
    throw new Error(`System integrity health V1 must remain additive/read-only: ${forbidden}`);
  }
}

const crmKeys = (migration.match(/'crm_core'::text as integrity_key/g) ?? []).length;
const customerKeys = (migration.match(/'customer360'::text as integrity_key/g) ?? []).length;
if (crmKeys !== 1 || customerKeys !== 1) {
  throw new Error('System integrity health V1 must define exactly one CRM Core row and one Customer 360 row per source organization.');
}

console.log('System integrity health V1 contracts verified.');
