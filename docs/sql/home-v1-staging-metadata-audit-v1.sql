-- Home V1 staging readiness: SELECT-only, metadata-only preflight.
-- Contains no tenant/user ids, raw lead rows, credentials or mutations.
-- Does NOT certify authenticated role isolation or metric parity.
with required(function_name, signature) as (
  values
    ('get_dashboard_snapshot', 'public.get_dashboard_snapshot(uuid)'),
    ('get_home_v1_qualification_snapshot',
     'public.get_home_v1_qualification_snapshot(uuid,timestamptz,timestamptz)'),
    ('get_home_v1_pipeline_snapshot', 'public.get_home_v1_pipeline_snapshot(uuid)')
), functions as (
  select r.function_name, r.signature,
    to_regprocedure(r.signature)::oid as oid
  from required r
), checks as (
  select f.function_name,
    (f.oid is not null) as exists_in_database,
    coalesce(p.prosecdef, false) as security_definer,
    coalesce(has_function_privilege('authenticated', f.oid, 'EXECUTE'), false) as authenticated_execute,
    coalesce(has_function_privilege('anon', f.oid, 'EXECUTE'), false) as anonymous_execute,
    coalesce(position('from public.tenant_session_bindings' in
      lower(pg_get_functiondef(f.oid))) > 0, false) as explicit_session_binding,
    coalesce(position('is distinct from true' in
      lower(pg_get_functiondef(f.oid))) > 0, false) as null_safe_authorization
  from functions f
  left join pg_proc p on p.oid = f.oid
)
select function_name,
  exists_in_database,
  security_definer,
  authenticated_execute,
  anonymous_execute,
  explicit_session_binding,
  null_safe_authorization,
  (exists_in_database and security_definer and authenticated_execute
    and not anonymous_execute and explicit_session_binding
    and null_safe_authorization) as metadata_pass
from checks
order by function_name;
