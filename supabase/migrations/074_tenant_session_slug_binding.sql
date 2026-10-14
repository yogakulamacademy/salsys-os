begin;

-- W5D Tenant Isolation: organization-specific login binds the authenticated
-- session by trusted organization slug inside the database, before ordinary
-- tenant RLS needs to expose any organization or membership rows.

create or replace function public.bind_current_tenant_session_by_slug(
  p_organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_slug text;
  v_organization_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authenticated user session required';
  end if;

  v_slug := lower(trim(coalesce(p_organization_slug, '')));

  if v_slug = '' then
    raise exception 'Organization slug is required';
  end if;

  select o.id
  into v_organization_id
  from public.organizations o
  where lower(o.slug) = v_slug
    and o.status = 'active'
  limit 1;

  if v_organization_id is null then
    raise exception 'Organization is unavailable';
  end if;

  perform public.bind_current_tenant_session(v_organization_id);

  return v_organization_id;
end;
$function$;

revoke all on function public.bind_current_tenant_session_by_slug(text)
  from public, anon;

grant execute on function public.bind_current_tenant_session_by_slug(text)
  to authenticated;

commit;
