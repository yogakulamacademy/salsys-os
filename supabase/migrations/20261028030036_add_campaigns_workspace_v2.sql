begin;

create function public.get_campaigns_workspace_v2(
  p_organization_id uuid,
  p_query text default null::text,
  p_platform text default 'all'::text,
  p_outcome text default 'all'::text,
  p_sort text default 'spend_desc'::text,
  p_page integer default 1,
  p_page_size integer default 50
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

  return public.get_campaigns_workspace(
    p_organization_id,
    p_query,
    p_platform,
    p_outcome,
    p_sort,
    p_page,
    p_page_size
  );
end;
$function$;

revoke all
on function public.get_campaigns_workspace_v2(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
)
from public, anon, authenticated, service_role;

grant execute
on function public.get_campaigns_workspace_v2(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
)
to authenticated, service_role;

comment on function public.get_campaigns_workspace_v2(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
) is
  'Tenant-authorized SECURITY DEFINER Campaigns read boundary. Reuses canonical V1 business logic while avoiding repeated deep RLS authorization checks; PUBLIC/anon execute revoked.';

commit;
