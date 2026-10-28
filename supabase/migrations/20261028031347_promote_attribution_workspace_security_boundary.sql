begin;

alter function public.get_attribution_workspace(uuid,text,text,text,text,text)
rename to get_attribution_workspace_internal_v1;

revoke all on function public.get_attribution_workspace_internal_v1(uuid,text,text,text,text,text)
from public, anon, authenticated, service_role;

create function public.get_attribution_workspace(
  p_organization_id uuid,
  p_query text default null::text,
  p_course text default null::text,
  p_location text default null::text,
  p_country text default null::text,
  p_stage text default null::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  return public.get_attribution_workspace_internal_v1(
    p_organization_id,
    p_query,
    p_course,
    p_location,
    p_country,
    p_stage
  );
end;
$function$;

revoke all on function public.get_attribution_workspace(uuid,text,text,text,text,text)
from public, anon, authenticated, service_role;

grant execute on function public.get_attribution_workspace(uuid,text,text,text,text,text)
to authenticated, service_role;

comment on function public.get_attribution_workspace(uuid,text,text,text,text,text) is
  'Tenant-authorized SECURITY DEFINER Attribution read boundary. Validates the caller bound organization before invoking the owner-only canonical V1 aggregation implementation.';

comment on function public.get_attribution_workspace_internal_v1(uuid,text,text,text,text,text) is
  'Internal owner-only canonical Attribution aggregation implementation. Direct API execution is revoked; use get_attribution_workspace instead.';

drop function if exists public.get_attribution_workspace_v2(uuid,text,text,text,text,text);

commit;
