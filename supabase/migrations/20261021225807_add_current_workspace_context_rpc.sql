create or replace function public.get_current_workspace_context_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid;
  v_session_id uuid;
  v_organization_id uuid;
  v_role text;
  v_organization_name text;
  v_organization_slug text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authenticated user session required';
  end if;

  v_user_id := auth.uid();

  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  if v_user_id is null or v_session_id is null then
    raise exception 'Authenticated session identity is incomplete';
  end if;

  select b.organization_id
  into v_organization_id
  from public.tenant_session_bindings b
  where b.session_id = v_session_id
    and b.user_id = v_user_id;

  if v_organization_id is null then
    v_organization_id := public.bind_current_tenant_session_for_current_user();
  else
    update public.tenant_session_bindings
    set last_seen_at = now()
    where session_id = v_session_id
      and user_id = v_user_id
      and organization_id = v_organization_id;
  end if;

  select
    om.role::text,
    o.name,
    o.slug
  into
    v_role,
    v_organization_name,
    v_organization_slug
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
  where om.user_id = v_user_id
    and om.organization_id = v_organization_id
    and om.active = true
    and o.status = 'active'
  limit 1;

  if v_role is null then
    raise exception 'Workspace access denied';
  end if;

  return jsonb_build_object(
    'organization_id', v_organization_id,
    'active_organization_id', v_organization_id,
    'organization_name', v_organization_name,
    'organization_slug', v_organization_slug,
    'role', v_role
  );
end;
$$;

revoke all on function public.get_current_workspace_context_v1() from public, anon;
grant execute on function public.get_current_workspace_context_v1() to authenticated, service_role;
