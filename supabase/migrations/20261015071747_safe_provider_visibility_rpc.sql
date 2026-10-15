create or replace function public.get_provider_visibility(
  p_organization_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_organization_id uuid;
begin
  v_organization_id := coalesce(
    p_organization_id,
    public.current_tenant_organization_id()
  );

  if v_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(v_organization_id) then
    raise exception 'Not authorized for organization %', v_organization_id;
  end if;

  return jsonb_build_object(
    'organization_id', v_organization_id,
    'google_connected', exists (
      select 1
      from public.integration_connections c
      where c.organization_id = v_organization_id
        and c.provider = 'google'
        and c.status = 'connected'
    ),
    'meta_connected', exists (
      select 1
      from public.integration_connections c
      where c.organization_id = v_organization_id
        and c.provider = 'meta'
        and c.status = 'connected'
    )
  );
end;
$function$;

revoke all on function public.get_provider_visibility(uuid) from public, anon;
grant execute on function public.get_provider_visibility(uuid) to authenticated, service_role;

comment on function public.get_provider_visibility(uuid) is
'Safely exposes tenant-scoped provider connection booleans without granting authenticated users direct SELECT access to integration_connections or secret-bearing integration rows.';
