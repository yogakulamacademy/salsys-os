-- W8 post-cutover hardening:
-- 1) a persisted session binding is authoritative only while the user still has
--    an active membership in an active organization;
-- 2) disabling an Admissions employee also disables their Sales workspace
--    membership and removes tenant bindings for that organization.

create or replace function public.current_tenant_organization_id()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  with bound as (
    select b.organization_id
    from public.tenant_session_bindings b
    join public.organization_members om
      on om.organization_id = b.organization_id
     and om.user_id = b.user_id
     and om.active = true
    join public.organizations o
      on o.id = b.organization_id
     and o.status = 'active'
    where b.session_id = nullif(auth.jwt()->>'session_id','')::uuid
      and b.user_id = auth.uid()
    limit 1
  ),
  sole_membership as (
    select min(om.organization_id::text)::uuid as organization_id
    from public.organization_members om
    join public.organizations o
      on o.id = om.organization_id
     and o.status = 'active'
    where om.user_id = auth.uid()
      and om.active = true
    having count(distinct om.organization_id) = 1
  )
  select case
    when auth.role() = 'service_role' then null::uuid
    when auth.role() <> 'authenticated' then null::uuid
    when public.tenant_session_enforcement_enabled()
      then (select organization_id from bound)
    else coalesce(
      (select organization_id from bound),
      (select organization_id from sole_membership)
    )
  end;
$function$;

revoke all on function public.current_tenant_organization_id() from public;
revoke execute on function public.current_tenant_organization_id() from anon;
grant execute on function public.current_tenant_organization_id() to authenticated;
grant execute on function public.current_tenant_organization_id() to service_role;

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
  else
    update public.workspace_memberships
    set active = false,
        updated_at = now()
    where organization_id = p_organization_id
      and workspace_code = 'sales'
      and user_id = p_user_id;

    delete from public.tenant_session_bindings
    where organization_id = p_organization_id
      and user_id = p_user_id;
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

revoke all on function public.set_tenant_employee_active(uuid,uuid,boolean) from public;
revoke execute on function public.set_tenant_employee_active(uuid,uuid,boolean) from anon;
revoke execute on function public.set_tenant_employee_active(uuid,uuid,boolean) from authenticated;
grant execute on function public.set_tenant_employee_active(uuid,uuid,boolean) to service_role;
