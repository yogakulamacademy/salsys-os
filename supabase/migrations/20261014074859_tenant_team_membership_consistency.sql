begin;

-- W8H: keep functional workspace memberships consistent with the tenant
-- membership that authorizes them.
update public.workspace_memberships wm
set active = false,
    updated_at = now()
from public.organization_members om
where om.organization_id = wm.organization_id
  and om.user_id = wm.user_id
  and om.active = false
  and wm.active = true;

create or replace function public.sync_workspace_memberships_on_org_member_status()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.active is distinct from new.active and new.active = false then
    update public.workspace_memberships
    set active = false,
        updated_at = now()
    where organization_id = new.organization_id
      and user_id = new.user_id
      and active = true;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_workspace_memberships_on_org_member_status()
  from public, anon, authenticated;
grant execute on function public.sync_workspace_memberships_on_org_member_status()
  to service_role;

drop trigger if exists organization_members_sync_workspace_status
  on public.organization_members;
create trigger organization_members_sync_workspace_status
after update of active on public.organization_members
for each row
execute function public.sync_workspace_memberships_on_org_member_status();

-- Trusted server action used after Supabase Auth creates the employee identity.
-- This keeps profile + tenant membership + Sales workspace provisioning in one
-- database transaction and is intentionally service-role only.
create or replace function public.provision_tenant_employee(
  p_user_id uuid,
  p_organization_id uuid,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_user_id is null then
    raise exception 'User ID is required';
  end if;

  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if v_name is null then
    raise exception 'Employee name is required';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status = 'active'
  ) then
    raise exception 'Organization is unavailable';
  end if;

  if not exists (
    select 1
    from public.organization_workspaces ow
    where ow.organization_id = p_organization_id
      and ow.workspace_code = 'sales'
      and ow.enabled = true
  ) then
    raise exception 'Sales workspace is unavailable for this organization';
  end if;

  insert into public.profiles (
    id,
    full_name,
    role,
    active
  )
  values (
    p_user_id,
    v_name,
    'admissions',
    true
  )
  on conflict (id)
  do update set
    full_name = excluded.full_name,
    role = 'admissions',
    active = true,
    updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    active
  )
  values (
    p_organization_id,
    p_user_id,
    'admissions',
    true
  )
  on conflict (organization_id, user_id)
  do update set
    role = 'admissions',
    active = true,
    updated_at = now();

  insert into public.workspace_memberships (
    organization_id,
    workspace_code,
    user_id,
    role,
    active
  )
  values (
    p_organization_id,
    'sales',
    p_user_id,
    'member',
    true
  )
  on conflict (organization_id, workspace_code, user_id)
  do update set
    role = 'member',
    active = true,
    updated_at = now();

  return p_user_id;
end;
$function$;

revoke all on function public.provision_tenant_employee(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.provision_tenant_employee(uuid, uuid, text)
  to service_role;

-- Trusted tenant-scoped employee activation/deactivation. The caller supplies
-- the tenant resolved from the authenticated session, never a browser-selected
-- organization id.
create or replace function public.set_tenant_employee_active(
  p_organization_id uuid,
  p_user_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_organization_id is null or p_user_id is null then
    raise exception 'Organization and user are required';
  end if;

  if not exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = p_user_id
      and om.role = 'admissions'
  ) then
    raise exception 'Employee was not found in this organization';
  end if;

  update public.organization_members
  set active = coalesce(p_active, false),
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_user_id
    and role = 'admissions';

  if coalesce(p_active, false) then
    if not exists (
      select 1
      from public.organization_workspaces ow
      where ow.organization_id = p_organization_id
        and ow.workspace_code = 'sales'
        and ow.enabled = true
    ) then
      raise exception 'Sales workspace is unavailable for this organization';
    end if;

    insert into public.workspace_memberships (
      organization_id,
      workspace_code,
      user_id,
      role,
      active
    )
    values (
      p_organization_id,
      'sales',
      p_user_id,
      'member',
      true
    )
    on conflict (organization_id, workspace_code, user_id)
    do update set
      role = 'member',
      active = true,
      updated_at = now();
  end if;

  update public.profiles p
  set active = (
        coalesce(p_active, false)
        or exists (
          select 1
          from public.organization_members other_om
          where other_om.user_id = p_user_id
            and other_om.organization_id <> p_organization_id
            and other_om.active = true
        )
      ),
      updated_at = now()
  where p.id = p_user_id;
end;
$function$;

revoke all on function public.set_tenant_employee_active(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_tenant_employee_active(uuid, uuid, boolean)
  to service_role;

commit;
