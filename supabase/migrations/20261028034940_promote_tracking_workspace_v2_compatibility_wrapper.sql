create or replace function public.get_tracking_workspace()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $fn$
declare
  v_organization_id uuid;
begin
  v_organization_id := public.current_tenant_organization_id();

  if v_organization_id is null then
    raise exception 'No tenant organization is bound to the current session';
  end if;

  return public.get_tracking_workspace_v2(v_organization_id);
end;
$fn$;
