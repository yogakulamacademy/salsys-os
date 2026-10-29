import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20261029112500_system_health_v2_normalized.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const lower = sql.toLowerCase();

for (const required of [
  'create or replace view public.v_system_health_v2',
  'with (security_invoker = true)',
  'from public.v_system_health h',
  'from public.v_crm_core_integrity_health_v2 c',
  'from public.v_customer360_identity_integrity_health_v2 c',
  'from public.v_tracking_live_closeout_health_v1 t',
  'from public.v_privacy_compliance_health p',
  'from public.v_search_index_health_v1 s',
  "when not s.indexing_enabled then 'inactive'",
  "when t.backend_status = 'degraded' then 'critical'",
  "when t.backend_status in ('misconfigured', 'not_live') then 'warning'",
  "when p.overdue_subject_requests > 0 then 'critical'",
  "when p.active_sources_not_honoring_gpc > 0 then 'warning'",
  "case when c.health_status = 'healthy' then 'healthy' else 'warning' end",
  'create or replace view public.v_system_health_summary_v2',
  "count(*) filter (where h.health_status = 'inactive')::bigint as inactive_systems",
  'revoke all on public.v_system_health_v2 from public, anon, authenticated',
  'grant select on public.v_system_health_v2 to service_role',
  'revoke all on public.v_system_health_summary_v2 from public, anon, authenticated',
  'grant select on public.v_system_health_summary_v2 to service_role',
]) {
  if (!lower.includes(required.toLowerCase())) {
    throw new Error(`System Health V2 is missing required contract: ${required}`);
  }
}

for (const forbidden of [
  'create or replace view public.v_system_health\n',
  'create or replace view public.v_system_health_summary\n',
  'drop view public.v_system_health',
  'drop view public.v_system_health_summary',
  'update public.',
  'delete from public.',
  'insert into public.',
]) {
  if (lower.includes(forbidden.toLowerCase())) {
    throw new Error(`System Health V2 migration must remain additive/read-only: ${forbidden}`);
  }
}

const systemKeys = [
  'crm_core_integrity',
  'customer360_integrity',
  'tracking_live',
  'privacy_compliance',
  'search_index',
];
for (const key of systemKeys) {
  if (!lower.includes(`'${key}'::text as system_key`)) {
    throw new Error(`System Health V2 is missing normalized system key: ${key}`);
  }
}

console.log('Normalized System Health V2 contracts verified.');
