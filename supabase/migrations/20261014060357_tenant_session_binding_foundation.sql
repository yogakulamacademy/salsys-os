begin;

-- W5D Tenant Isolation: bind each authenticated Supabase session to exactly
-- one organization. The JWT session_id is stable across token refreshes, so it
-- provides a server-verifiable tenant context independent of browser-supplied
-- organization IDs.

create table if not exists public.tenant_session_bindings (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_tenant_session_bindings_user
  on public.tenant_session_bindings (user_id, last_seen_at desc);

create index if not exists idx_tenant_session_bindings_org
  on public.tenant_session_bindings (organization_id, last_seen_at desc);

alter table public.tenant_session_bindings enable row level security;

revoke all on table public.tenant_session_bindings
  from public, anon, authenticated;

grant all on table public.tenant_session_bindings
  to service_role;

create or replace function public.bind_current_tenant_session(
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_user_id uuid;
  v_session_id uuid;
  v_existing_organization_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authenticated user session required';
  end if;

  v_user_id := auth.uid();

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception
    when invalid_text_representation then
      v_session_id := null;
  end;

  if v_user_id is null or v_session_id is null then
    raise exception 'Authenticated session identity is incomplete';
  end if;

  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not exists (
    select 1
    from public.organizations o
    join public.organization_members om
      on om.organization_id = o.id
    where o.id = p_organization_id
      and o.status = 'active'
      and om.user_id = v_user_id
      and om.active = true
  ) then
    raise exception 'Session cannot be bound to this organization';
  end if;

  select b.organization_id
  into v_existing_organization_id
  from public.tenant_session_bindings b
  where b.session_id = v_session_id
  for update;

  if found and v_existing_organization_id <> p_organization_id then
    raise exception 'Authenticated session is already bound to another organization';
  end if;

  insert into public.tenant_session_bindings (
    session_id,
    user_id,
    organization_id,
    bound_at,
    last_seen_at
  ) values (
    v_session_id,
    v_user_id,
    p_organization_id,
    now(),
    now()
  )
  on conflict (session_id)
  do update set
    last_seen_at = now()
  where public.tenant_session_bindings.user_id = excluded.user_id
    and public.tenant_session_bindings.organization_id = excluded.organization_id;

  return p_organization_id;
end;
$function$;

create or replace function public.current_tenant_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select case
    when auth.role() = 'service_role' then null::uuid
    else (
      select b.organization_id
      from public.tenant_session_bindings b
      where b.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and b.user_id = auth.uid()
      limit 1
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

revoke all on function public.bind_current_tenant_session(uuid)
  from public, anon;
revoke all on function public.current_tenant_organization_id()
  from public, anon;
revoke all on function public.session_is_bound_to_organization(uuid)
  from public, anon;

grant execute on function public.bind_current_tenant_session(uuid)
  to authenticated;
grant execute on function public.current_tenant_organization_id()
  to authenticated, service_role;
grant execute on function public.session_is_bound_to_organization(uuid)
  to authenticated, service_role;

commit;
