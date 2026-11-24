-- DESIGN REHEARSAL ONLY. Not a deployable migration.
-- Private, ungranted authorization primitive; no status writes or operator seeds.
create schema saas_lifecycle;
revoke all on schema saas_lifecycle from public,anon,authenticated,service_role;
create table saas_lifecycle.operators (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  platform_organization_id uuid not null references public.organizations(id) on delete restrict,
  active boolean not null default false,
  may_suspend boolean not null default false,
  may_restore boolean not null default false
);
alter table saas_lifecycle.operators enable row level security;
revoke all on table saas_lifecycle.operators from public,anon,authenticated,service_role;

-- Invoker by design: only the database owner can exercise this rehearsal.
-- Any future public wrapper requires separate review of auth, transaction locks,
-- idempotency, audit, capability activation and authenticated endpoint grants.
create function saas_lifecycle.require_operator(p_platform uuid,p_target uuid,p_action text)
returns uuid language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_actor uuid; v_session uuid; v_claims jsonb;
begin
  v_claims:=auth.jwt();
  v_actor:=auth.uid();
  begin
    v_session:=nullif(v_claims->>'session_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'Lifecycle operation not authorized' using errcode='42501';
  end;
  if v_claims->>'role' is distinct from 'authenticated'
    or v_actor is null or v_session is null or p_platform is null or p_target is null
    or p_target=p_platform or p_action is null or p_action not in ('suspend','restore')
    or not exists(
      select 1 from saas_lifecycle.operators l
      join public.organizations o on o.id=l.platform_organization_id and o.status='active' and o.slug='salsysos'
      join public.profiles p on p.id=l.user_id and p.active
      join public.organization_members m on m.organization_id=o.id and m.user_id=l.user_id and m.active and m.role in ('owner','admin')
      join auth.users u on u.id=l.user_id and u.email_confirmed_at is not null and u.is_anonymous is false
      join auth.sessions s on s.user_id=u.id and s.id=v_session and (s.not_after is null or s.not_after>clock_timestamp())
      join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=u.id and b.organization_id=o.id
      where l.user_id=v_actor and l.platform_organization_id=p_platform and l.active
        and case p_action when 'suspend' then l.may_suspend when 'restore' then l.may_restore else false end
    )
    or not exists(select 1 from public.organizations t where t.id=p_target and t.slug<>'salsysos' and t.status in ('active','suspended'))
  then raise exception 'Lifecycle operation not authorized' using errcode='42501'; end if;
  return v_actor;
end;
$fn$;
revoke all on function saas_lifecycle.require_operator(uuid,uuid,text) from public,anon,authenticated,service_role;
