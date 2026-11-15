-- Home V1 production RPC readiness, read-only.
-- Run with an approved privileged SQL console after confirming the target project.
-- This query never creates functions, changes grants, or reads business rows.
-- Before the migration, new RPCs are EXPECTED to be missing.
-- After the migration, all three must be present with the stated guards.
with required_rpc(label, signature) as (
  values
    ('dashboard_snapshot', 'public.get_dashboard_snapshot(uuid)'),
    ('historical_qualification', 'public.get_home_v1_qualification_snapshot(uuid,timestamptz,timestamptz)'),
    ('open_pipeline', 'public.get_home_v1_pipeline_snapshot(uuid)')
),
rpc as (
  select r.label, r.signature, to_regprocedure(r.signature)::oid as function_oid
  from required_rpc r
),
rpc_status as (
  select
    r.label,
    r.signature,
    r.function_oid is not null as installed,
    coalesce(p.prosecdef, false) as security_definer,
    coalesce(has_function_privilege('authenticated', r.function_oid, 'EXECUTE'), false) as authenticated_can_execute,
    coalesce(has_function_privilege('anon', r.function_oid, 'EXECUTE'), false) as anonymous_can_execute,
    coalesce(
      position('tenant_session_bindings' in lower(pg_get_functiondef(r.function_oid))) > 0,
      false
    ) as explicit_session_guard_present,
    coalesce(
      position('is distinct from true' in lower(pg_get_functiondef(r.function_oid))) > 0,
      false
    ) as null_safe_authorization_present
  from rpc r
  left join pg_proc p on p.oid = r.function_oid
)
select
  label, signature, installed, security_definer,
  authenticated_can_execute, anonymous_can_execute,
  explicit_session_guard_present, null_safe_authorization_present,
  (
    installed
    and security_definer
    and authenticated_can_execute
    and not anonymous_can_execute
    and explicit_session_guard_present
    and null_safe_authorization_present
  ) as metadata_pass
from rpc_status
order by label;

-- Presence-only dependency check; actual authorization tests are separate.
select 'tenant_session_bindings' as dependency,
  to_regclass('public.tenant_session_bindings') is not null as present
union all
select 'organizations',
  to_regclass('public.organizations') is not null
union all
select 'leads',
  to_regclass('public.leads') is not null
union all
select 'lead_stage_history',
  to_regclass('public.lead_stage_history') is not null
union all
select 'snapshot_internal_function',
  to_regprocedure('public.get_dashboard_snapshot_internal_v1(uuid)') is not null
union all
select 'organization_role_check',
  to_regprocedure('public.has_organization_role(uuid,text[])') is not null
union all
select 'session_binding_check',
  to_regprocedure('public.session_is_bound_to_organization(uuid)') is not null
order by dependency;
