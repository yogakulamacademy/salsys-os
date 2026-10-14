begin;

-- W5D Tenant Isolation: install session-aware authorization helpers behind a
-- controlled rollout flag. While enforcement=false the helpers preserve the
-- existing membership behavior, so production can receive this migration before
-- the tenant-bound application cutover. A later cutover migration flips the flag
-- only after tenant-specific login/session binding is live.

create table if not exists public.tenant_security_config (
  singleton boolean primary key default true check (singleton = true),
  enforce_session_tenant boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.tenant_security_config (
  singleton,
  enforce_session_tenant
)
values (true, false)
on conflict (singleton) do nothing;

alter table public.tenant_security_config enable row level security;
revoke all on table public.tenant_security_config from public, anon, authenticated;
grant all on table public.tenant_security_config to service_role;

create or replace function public.tenant_session_enforcement_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select coalesce(
    (
      select c.enforce_session_tenant
      from public.tenant_security_config c
      where c.singleton = true
      limit 1
    ),
    false
  );
$function$;

create or replace function public.current_tenant_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  with bound as (
    select b.organization_id
    from public.tenant_session_bindings b
    where b.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and b.user_id = auth.uid()
    limit 1
  ),
  sole_membership as (
    select min(om.organization_id::text)::uuid as organization_id
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.active = true
    having count(distinct om.organization_id) = 1
  )
  select case
    when auth.role() = 'service_role' then null::uuid
    else coalesce(
      (select organization_id from bound),
      (select organization_id from sole_membership)
    )
  end;
$function$;

create or replace function public.session_is_bound_to_organization(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or (
      p_organization_id is not null
      and public.current_tenant_organization_id() = p_organization_id
    );
$function$;

create or replace function public.is_organization_member(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or (
      exists (
        select 1
        from public.organization_members om
        where om.organization_id = p_organization_id
          and om.user_id = auth.uid()
          and om.active = true
      )
      and (
        not public.tenant_session_enforcement_enabled()
        or public.session_is_bound_to_organization(p_organization_id)
      )
    );
$function$;

create or replace function public.has_organization_role(
  p_organization_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or (
      exists (
        select 1
        from public.organization_members om
        where om.organization_id = p_organization_id
          and om.user_id = auth.uid()
          and om.active = true
          and om.role = any(p_roles)
      )
      and (
        not public.tenant_session_enforcement_enabled()
        or public.session_is_bound_to_organization(p_organization_id)
      )
    );
$function$;

create or replace function public.organization_role(
  p_organization_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select case
    when auth.role() = 'service_role' then 'service_role'::text
    when public.tenant_session_enforcement_enabled()
         and not public.session_is_bound_to_organization(p_organization_id)
      then null::text
    else (
      select om.role
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.active = true
      limit 1
    )
  end;
$function$;

create or replace function public.can_manage_organization(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select public.has_organization_role(
    p_organization_id,
    array['owner','admin']::text[]
  );
$function$;

create or replace function public.has_workspace_access(
  p_organization_id uuid,
  p_workspace_code text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or (
      (
        not public.tenant_session_enforcement_enabled()
        or public.session_is_bound_to_organization(p_organization_id)
      )
      and exists (
        select 1
        from public.organization_workspaces ow
        join public.organizations o
          on o.id = ow.organization_id
        where ow.organization_id = p_organization_id
          and ow.workspace_code = lower(trim(p_workspace_code))
          and ow.enabled = true
          and o.status = 'active'
          and (
            public.can_manage_organization(p_organization_id)
            or (
              ow.workspace_code <> 'admin'
              and exists (
                select 1
                from public.workspace_memberships wm
                join public.organization_members om
                  on om.organization_id = wm.organization_id
                 and om.user_id = wm.user_id
                where wm.organization_id = p_organization_id
                  and wm.workspace_code = ow.workspace_code
                  and wm.user_id = auth.uid()
                  and wm.active = true
                  and om.active = true
              )
            )
          )
      )
    );
$function$;

revoke all on function public.tenant_session_enforcement_enabled()
  from public, anon;
revoke all on function public.current_tenant_organization_id()
  from public, anon;
revoke all on function public.session_is_bound_to_organization(uuid)
  from public, anon;
revoke all on function public.is_organization_member(uuid)
  from public, anon;
revoke all on function public.has_organization_role(uuid, text[])
  from public, anon;
revoke all on function public.organization_role(uuid)
  from public, anon;
revoke all on function public.can_manage_organization(uuid)
  from public, anon;
revoke all on function public.has_workspace_access(uuid, text)
  from public, anon;

grant execute on function public.tenant_session_enforcement_enabled()
  to authenticated, service_role;
grant execute on function public.current_tenant_organization_id()
  to authenticated, service_role;
grant execute on function public.session_is_bound_to_organization(uuid)
  to authenticated, service_role;
grant execute on function public.is_organization_member(uuid)
  to authenticated, service_role;
grant execute on function public.has_organization_role(uuid, text[])
  to authenticated, service_role;
grant execute on function public.organization_role(uuid)
  to authenticated, service_role;
grant execute on function public.can_manage_organization(uuid)
  to authenticated, service_role;
grant execute on function public.has_workspace_access(uuid, text)
  to authenticated, service_role;

commit;
