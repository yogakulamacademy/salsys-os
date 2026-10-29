import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20261029110500_customer360_identity_integrity_health_v2.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const lower = sql.toLowerCase();

for (const required of [
  'create or replace view public.v_customer360_identity_integrity_health_v2',
  'with (security_invoker = true)',
  'from public.v_customer360_identity_integrity_health_v1 v',
  "p.metadata->>'lead_id'",
  "p.metadata->'identity_backfill'->>'lead_id'",
  'retained_deleted_lead_persons',
  'actionable_orphan_persons',
  'unclassified_leadless_persons',
  'actionable_persons_missing_complete_journey',
  'from public.v_person_journey_complete j',
  '- v.orphan_persons',
  '- v.persons_missing_complete_journey',
  '+ coalesce(lr.actionable_orphan_persons, 0)',
  '+ coalesce(aj.actionable_persons_missing_complete_journey, 0)',
  'v.open_identity_conflicts',
  "when n.integrity_issue_count = 0 then 'healthy'::text",
  'revoke all on public.v_customer360_identity_integrity_health_v2',
  'from public, anon, authenticated;',
  'grant select on public.v_customer360_identity_integrity_health_v2',
  'to service_role;',
]) {
  if (!lower.includes(required.toLowerCase())) {
    throw new Error(`Customer 360 health V2 is missing required contract: ${required}`);
  }
}

for (const forbidden of [
  'update public.persons',
  'delete from public.persons',
  'insert into public.persons',
  'update public.person_leads',
  'delete from public.person_leads',
  'update public.identity_resolution_conflicts',
  'drop view public.v_customer360_identity_integrity_health_v1',
  'create or replace view public.v_customer360_identity_integrity_health_v1',
]) {
  if (lower.includes(forbidden.toLowerCase())) {
    throw new Error(`Customer 360 health V2 must remain additive/read-only: ${forbidden}`);
  }
}

console.log('Customer 360 retained-identity health V2 contracts verified.');
