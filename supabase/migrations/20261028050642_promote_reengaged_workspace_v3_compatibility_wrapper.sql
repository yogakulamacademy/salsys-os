create or replace function public.get_reengaged_workspace_v2()
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public','auth','pg_temp'
as $fn$
declare
  v_org uuid;
begin
  if auth.role() = 'service_role' then
    return public.get_reengaged_workspace_legacy_v2();
  end if;

  v_org := public.current_tenant_organization_id();

  if v_org is null then
    return public.get_reengaged_workspace_legacy_v2();
  end if;

  return public.get_reengaged_workspace_v3(v_org);
end;
$fn$;
