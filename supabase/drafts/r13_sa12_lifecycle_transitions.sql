-- DESIGN REHEARSAL ONLY. Requires r13_sa12_lifecycle_authority.sql.
-- No API grants, deployment migration, operator seed or live status changes.
create table saas_lifecycle.events (
  request_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  platform_organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  revision bigint not null check(revision>0),
  action text not null,
  previous_status text not null,
  new_status text not null,
  reason text not null check(char_length(btrim(reason)) between 10 and 512),
  occurred_at timestamptz not null default clock_timestamp(),
  unique(organization_id,revision),
  check(organization_id<>platform_organization_id),
  check((action='suspend' and previous_status='active' and new_status='suspended')
     or (action='restore' and previous_status='suspended' and new_status='active'))
);
alter table saas_lifecycle.events enable row level security;
revoke all on saas_lifecycle.events from public,anon,authenticated,service_role;

create function saas_lifecycle.reject_event_mutation()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $fn$
begin
  raise exception 'Lifecycle events are append-only' using errcode='55000';
end;
$fn$;
revoke all on function saas_lifecycle.reject_event_mutation() from public,anon,authenticated,service_role;
create trigger lifecycle_event_no_update_delete before update or delete on saas_lifecycle.events
for each row execute function saas_lifecycle.reject_event_mutation();
create trigger lifecycle_event_no_truncate before truncate on saas_lifecycle.events
for each statement execute function saas_lifecycle.reject_event_mutation();

create function saas_lifecycle.transition(p_platform uuid,p_target uuid,p_action text,
  p_expected_status text,p_expected_revision bigint,p_request uuid,p_reason text,p_confirmation text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
declare
  v_actor uuid;
  v_status text;
  v_next text;
  v_revision bigint;
  v_reason text;
  v_event saas_lifecycle.events%rowtype;
begin
  v_actor:=saas_lifecycle.require_operator(p_platform,p_target,p_action);
  v_reason:=btrim(p_reason);
  if p_request is null or p_expected_revision is null or p_expected_revision<0
    or p_expected_revision>=9223372036854775807
    or v_reason is null or char_length(v_reason) not between 10 and 512
    or p_confirmation is distinct from (p_action||':'||p_target::text)
    or p_expected_status is distinct from (case p_action when 'suspend' then 'active' when 'restore' then 'suspended' end)
  then raise exception 'Invalid lifecycle request' using errcode='22023'; end if;
  v_next:=case p_action when 'suspend' then 'suspended' else 'active' end;
  -- Serialize globally reused request IDs and same-tenant transition requests.
  perform pg_advisory_xact_lock(hashtextextended('saas_lifecycle_request:'||p_request::text,0));
  select status into v_status from public.organizations where id=p_target for update;
  if not found then raise exception 'Lifecycle operation not authorized' using errcode='42501'; end if;
  -- Serialize against concurrent updates/deletions of the authorization rows.
  -- Private rehearsal only; external writers and lock ordering need full review.
  perform 1
    from saas_lifecycle.operators l
    join public.organizations o on o.id=l.platform_organization_id
    join public.profiles p on p.id=l.user_id
    join public.organization_members m on m.organization_id=o.id and m.user_id=l.user_id
    join auth.users u on u.id=l.user_id
    join auth.sessions s on s.user_id=u.id and s.id=(auth.jwt()->>'session_id')::uuid
    join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=u.id and b.organization_id=o.id
    where l.user_id=v_actor and l.platform_organization_id=p_platform
    for share of l,o,p,m,u,s,b;
  if not found then raise exception 'Lifecycle operation not authorized' using errcode='42501'; end if;
  -- Recheck identity, session, permission and protected target after lock waits.
  v_actor:=saas_lifecycle.require_operator(p_platform,p_target,p_action);
  select * into v_event from saas_lifecycle.events where request_id=p_request;
  if found then
    if v_event.organization_id is distinct from p_target or v_event.platform_organization_id is distinct from p_platform
      or v_event.actor_user_id is distinct from v_actor or v_event.action is distinct from p_action
      or v_event.previous_status is distinct from p_expected_status
      or v_event.revision is distinct from (p_expected_revision+1)
      or v_event.reason is distinct from v_reason
    then raise exception 'Lifecycle request identifier conflict' using errcode='23505'; end if;
    return jsonb_build_object('request_id',v_event.request_id,'revision',v_event.revision,
      'previous_status',v_event.previous_status,'new_status',v_event.new_status,'replayed',true);
  end if;
  select coalesce(max(revision),0) into v_revision from saas_lifecycle.events where organization_id=p_target;
  if v_status is distinct from p_expected_status or v_revision is distinct from p_expected_revision
  then raise exception 'Lifecycle state changed' using errcode='40001'; end if;
  -- Same transaction: a failed audit insert rolls back the status write.
  update public.organizations set status=v_next where id=p_target and status=p_expected_status;
  if not found then raise exception 'Lifecycle state changed' using errcode='40001'; end if;
  insert into saas_lifecycle.events(request_id,organization_id,platform_organization_id,actor_user_id,
    revision,action,previous_status,new_status,reason)
  values(p_request,p_target,p_platform,v_actor,v_revision+1,p_action,v_status,v_next,v_reason)
  returning * into v_event;
  return jsonb_build_object('request_id',v_event.request_id,'revision',v_event.revision,
    'previous_status',v_event.previous_status,'new_status',v_event.new_status,'replayed',false);
end;
$fn$;
revoke all on function saas_lifecycle.transition(uuid,uuid,text,text,bigint,uuid,text,text)
from public,anon,authenticated,service_role;
