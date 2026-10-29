import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = path.join(
  root,
  'supabase/migrations/20261029104500_crm_core_integrity_health_v2.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const lower = sql.toLowerCase();

for (const required of [
  'create or replace view public.v_crm_core_integrity_health_v2',
  'with (security_invoker = true)',
  'from public.v_crm_core_integrity_health_v1 v',
  "l.current_stage = 'closed_won'::public.lead_stage",
  "l.status::text not in ('won', 'archived')",
  "l.current_stage = 'enrolled'::public.lead_stage",
  "l.status::text <> 'won'",
  "'lost'::public.lead_stage",
  "'unqualified'::public.lead_stage",
  "'duplicate'::public.lead_stage",
  "l.status::text <> 'lost'",
  "l.status::text <> 'open'",
  'v.integrity_issue_count',
  '- v.stage_status_mismatch',
  '+ coalesce(c.stage_status_mismatch, 0)',
  "when n.integrity_issue_count = 0 then 'healthy'::text",
  'revoke all on public.v_crm_core_integrity_health_v2 from public, anon, authenticated',
  'grant select on public.v_crm_core_integrity_health_v2 to service_role',
]) {
  if (!lower.includes(required.toLowerCase())) {
    throw new Error(`CRM Core health V2 is missing required contract: ${required}`);
  }
}

for (const forbidden of [
  'update public.leads',
  'delete from public.leads',
  'insert into public.leads',
  'drop view public.v_crm_core_integrity_health_v1',
  'create or replace view public.v_crm_core_integrity_health_v1',
]) {
  if (lower.includes(forbidden.toLowerCase())) {
    throw new Error(`CRM Core health compatibility migration must remain additive: ${forbidden}`);
  }
}

console.log('CRM Core health V2 closed-won compatibility contracts verified.');
