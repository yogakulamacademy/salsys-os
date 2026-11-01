-- Settings final closeout v1
--
-- Extend the existing tenant-scoped provider visibility read model with the
-- messaging providers already implemented by SalsysOS. No credentials, asset
-- identifiers, scopes or provider secrets are returned.

begin;

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
    ),
    'instagram_connected', exists (
      select 1
      from public.integration_connections c
      where c.organization_id = v_organization_id
        and c.provider = 'instagram'
        and c.status = 'connected'
    ),
    'whatsapp_connected', exists (
      select 1
      from public.integration_connections c
      where c.organization_id = v_organization_id
        and c.provider = 'whatsapp'
        and c.status = 'connected'
    )
  );
end;
$function$;

revoke all on function public.get_provider_visibility(uuid) from public, anon;
grant execute on function public.get_provider_visibility(uuid) to authenticated, service_role;

comment on function public.get_provider_visibility(uuid) is
  'Tenant-scoped provider connectivity summary. Returns booleans only for Google, Meta, Instagram and WhatsApp; never returns credentials, scopes, tokens or provider secrets.';

commit;
