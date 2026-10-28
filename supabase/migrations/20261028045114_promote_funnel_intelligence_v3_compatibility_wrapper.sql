create or replace function public.get_funnel_intelligence_workspace_v2(p_organization_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public','auth','pg_temp'
as $fn$
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  return public.get_funnel_intelligence_workspace_v3(p_organization_id, p_days);
end;
$fn$;
