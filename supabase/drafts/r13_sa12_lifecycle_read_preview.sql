-- DESIGN REHEARSAL ONLY. Private read capability, no API grants or seeds.
-- Requires lifecycle authority and transitions. Reading does not imply mutation.
create table saas_lifecycle.readers (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  platform_organization_id uuid not null references public.organizations(id) on delete restrict,
  active boolean not null default false
);
alter table saas_lifecycle.readers enable row level security;
revoke all on saas_lifecycle.readers from public,anon,authenticated,service_role;

create function saas_lifecycle.require_reader(p_platform uuid)
returns uuid language plpgsql security invoker set search_path=pg_catalog as $fn$
declare v_actor uuid; v_session uuid; v_claims jsonb;
begin
  v_claims:=auth.jwt();
  begin
    v_actor:=auth.uid();
    v_session:=nullif(v_claims->>'session_id','')::uuid;
  exception when invalid_text_representation then
    raise exception 'Lifecycle read not authorized' using errcode='42501';
  end;
  if v_claims->>'role' is distinct from 'authenticated'
     or v_actor is null or v_session is null or p_platform is null then
    raise exception 'Lifecycle read not authorized' using errcode='42501';
  end if;
  if not exists(
    select 1 from saas_lifecycle.readers r
    join public.organizations o on o.id=r.platform_organization_id and o.slug='salsysos' and o.status='active'
    join public.profiles p on p.id=r.user_id and p.active
    join public.organization_members m on m.organization_id=o.id and m.user_id=r.user_id and m.active and m.role in ('owner','admin')
    join auth.users u on u.id=r.user_id and u.email_confirmed_at is not null and u.is_anonymous is false
    join auth.sessions s on s.id=v_session and s.user_id=u.id and (s.not_after is null or s.not_after>clock_timestamp())
    join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=u.id and b.organization_id=o.id
    where r.user_id=v_actor and r.platform_organization_id=p_platform and r.active
  ) then raise exception 'Lifecycle read not authorized' using errcode='42501'; end if;
  return v_actor;
end;
$fn$;
revoke all on function saas_lifecycle.require_reader(uuid) from public,anon,authenticated,service_role;

create function saas_lifecycle.read_preview(p_platform uuid,p_target uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare
  v_actor uuid; v_status text; v_slug text; v_revision bigint; v_events jsonb;
  v_may_suspend boolean:=false; v_may_restore boolean:=false;
begin
  v_actor:=saas_lifecycle.require_reader(p_platform);
  if p_target is null or p_target=p_platform then return jsonb_build_object('state','unavailable'); end if;
  -- Hold the target row while projecting status and history. Governed transitions
  -- lock the same row. Direct privileged status writes still require review.
  select status,slug into v_status,v_slug from public.organizations where id=p_target for share;
  if not found or v_slug='salsysos' or v_status not in ('active','suspended','archived') then
    return jsonb_build_object('state','unavailable');
  end if;
  select coalesce(max(revision),0) into v_revision from saas_lifecycle.events where organization_id=p_target;
  if v_revision>9007199254740991 then return jsonb_build_object('state','unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'action',e.action,
    'previous_status',e.previous_status,'new_status',e.new_status,'reason',e.reason,
    'occurred_at',e.occurred_at) order by e.revision desc),'[]'::jsonb)
  into v_events from (select revision,action,previous_status,new_status,reason,occurred_at
    from saas_lifecycle.events where organization_id=p_target order by revision desc limit 20) e;
  if jsonb_array_length(v_events)<>least(v_revision,20)
    or (v_revision>0 and (v_events->0->>'new_status' is distinct from v_status))
    or exists(select 1 from jsonb_array_elements(v_events) with ordinality a(event,n)
      where (a.event->>'revision')::bigint<>v_revision-a.n+1
        or (a.n>1 and a.event->>'new_status' is distinct from (v_events->((a.n-2)::integer)->>'previous_status')))
  then return jsonb_build_object('state','unavailable'); end if;
  -- The existing mutation authorization is authoritative; a read grant cannot
  -- create a write grant. These flags are advisory and must be rechecked on use.
  if v_status='active' then
    begin perform saas_lifecycle.require_operator(p_platform,p_target,'suspend'); v_may_suspend:=true;
    exception when insufficient_privilege then v_may_suspend:=false; end;
  elsif v_status='suspended' then
    begin perform saas_lifecycle.require_operator(p_platform,p_target,'restore'); v_may_restore:=true;
    exception when insufficient_privilege then v_may_restore:=false; end;
  end if;
  if saas_lifecycle.require_reader(p_platform) is distinct from v_actor then
    raise exception 'Lifecycle read not authorized' using errcode='42501';
  end if;
  return jsonb_build_object('state','available','organization_id',p_target,'status',v_status,
    'revision',v_revision,'may_suspend',v_may_suspend,'may_restore',v_may_restore,'events',v_events);
end;
$fn$;
revoke all on function saas_lifecycle.read_preview(uuid,uuid) from public,anon,authenticated,service_role;
