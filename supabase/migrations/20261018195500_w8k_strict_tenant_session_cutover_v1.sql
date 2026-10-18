begin;

-- W8K strict tenant-session cutover.
-- Fail closed if production state is not safe for strict binding.
do $guard$
begin
  if exists (
    select 1
    from public.organization_members om
    join public.organizations o on o.id=om.organization_id and o.status='active'
    where om.active=true
    group by om.user_id
    having count(distinct om.organization_id)>1
  ) then
    raise exception 'W8K_BLOCKED_MULTI_ORG_ACTIVE_MEMBERSHIP';
  end if;

  if exists (
    select 1
    from auth.sessions s
    join public.organization_members om on om.user_id=s.user_id and om.active=true
    join public.organizations o on o.id=om.organization_id and o.status='active'
    left join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id and b.organization_id=om.organization_id
    where (s.not_after is null or s.not_after>now())
      and b.session_id is null
  ) then
    raise exception 'W8K_BLOCKED_UNBOUND_ACTIVE_SESSION';
  end if;
end
$guard$;

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
    where b.session_id=nullif(auth.jwt()->>'session_id','')::uuid
      and b.user_id=auth.uid()
    limit 1
  ),
  sole_membership as (
    select min(om.organization_id::text)::uuid as organization_id
    from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.user_id=auth.uid()
      and om.active=true
      and o.status='active'
    having count(distinct om.organization_id)=1
  )
  select case
    when auth.role()='service_role' then null::uuid
    when auth.role()<>'authenticated' then null::uuid
    when public.tenant_session_enforcement_enabled()
      then (select organization_id from bound)
    else coalesce((select organization_id from bound),(select organization_id from sole_membership))
  end;
$function$;

revoke all on function public.current_tenant_organization_id() from public, anon;
grant execute on function public.current_tenant_organization_id() to authenticated, service_role;

update public.tenant_security_config
set enforce_session_tenant=true,
    updated_at=now()
where singleton=true;

commit;
