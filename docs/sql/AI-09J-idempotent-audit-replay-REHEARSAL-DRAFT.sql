-- AI-09J LOCAL IDEMPOTENCY / AUDIT REPLAY REHEARSAL.
-- NOT A MIGRATION. NEVER RUN ON HOSTED SUPABASE / REAL CRM.
-- Only a freshly generated disposable DB salsys_ai09j_<18 lower hex>.
--
-- Critical: the request_id here is *server-generated test input*, never
-- chosen by a browser, model, webhook, or external request. The function
-- models audit idempotency, NOT actual CRM reads or AI tool authorization.
do $ai09j_guard$
begin
  if pg_catalog.current_database() !~ '^salsys_ai09j_[a-f0-9]{18}$'
    or pg_catalog.to_regclass('public.test_ai09j_fixture') is null
    or pg_catalog.to_regclass('public.organizations') is null
    or pg_catalog.to_regclass('public.organization_members') is null
    or pg_catalog.to_regclass('public.tenant_session_bindings') is null
    or pg_catalog.to_regclass('auth.sessions') is null
    or pg_catalog.to_regclass('public.leads') is not null
    or pg_catalog.to_regclass('public.contacts') is not null
    or pg_catalog.to_regclass('public.courses') is not null
    or pg_catalog.to_regclass('public.course_batches') is not null
    or pg_catalog.to_regclass('public.knowledge_sources') is not null
    or not exists (select 1 from public.test_ai09j_fixture where id=true)
  then
    raise exception 'AI09J_LOCAL_DISPOSABLE_FIXTURE_REQUIRED' using errcode='42501';
  end if;
end;
$ai09j_guard$;

create schema ai09j_rehearsal;
revoke all on schema ai09j_rehearsal from public,anon,authenticated,service_role;
grant usage on schema ai09j_rehearsal to authenticated;

-- The primary key is globally unique, not per tenant, to reject accidentally
-- recycling a request ID across tenants. The ledgers are synthetic metadata;
-- review of actual retention and legal purpose remains pending.
create table ai09j_rehearsal.read_request_audit (
  request_id uuid primary key,
  organization_id uuid not null,
  actor_id uuid not null,
  session_id uuid not null,
  tool_id text not null check (tool_id in ('crm.course.list','crm.lead.read')),
  resource_id uuid,
  row_count integer not null check (row_count between 0 and 20),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index ai09j_tenant_audit_idx on ai09j_rehearsal.read_request_audit(organization_id,created_at);
alter table ai09j_rehearsal.read_request_audit enable row level security;
alter table ai09j_rehearsal.read_request_audit force row level security;
revoke all on ai09j_rehearsal.read_request_audit from public,anon,authenticated,service_role;

create function ai09j_rehearsal.reject_audit_changes_v1()
returns trigger language plpgsql set search_path=''
as $ai09j_protect$
begin
  raise exception 'ai09j_audit_append_only' using errcode='42501';
end;
$ai09j_protect$;
create trigger ai09j_no_update before update on ai09j_rehearsal.read_request_audit
  for each row execute function ai09j_rehearsal.reject_audit_changes_v1();
create trigger ai09j_no_delete before delete on ai09j_rehearsal.read_request_audit
  for each row execute function ai09j_rehearsal.reject_audit_changes_v1();
create trigger ai09j_no_truncate before truncate on ai09j_rehearsal.read_request_audit
  for each statement execute function ai09j_rehearsal.reject_audit_changes_v1();

-- This is an isolated privileged local fixture. It is deliberately NOT an
-- invoker-RLS proof or a proposed hosted migration. A real read must combine
-- current per-resource authorization, consent and audit in one DB transaction.
create function ai09j_rehearsal.record_once_fixture_v1(
  p_request_id uuid,
  p_organization_id uuid,
  p_tool_id text,
  p_resource_id uuid,
  p_row_count integer
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $ai09j_once$
declare
  v_user_text text := auth.jwt()->>'sub';
  v_sid_text text := auth.jwt()->>'session_id';
  v_actor uuid;
  v_session uuid;
  v_inserted uuid;
  v_existing ai09j_rehearsal.read_request_audit%rowtype;
begin
  if p_request_id is null or p_organization_id is null
     or p_tool_id not in ('crm.course.list','crm.lead.read')
     or p_tool_id is null
     or p_row_count is null or p_row_count<0 or p_row_count>20
     or (p_tool_id='crm.course.list' and p_resource_id is not null)
     or (p_tool_id='crm.lead.read' and (p_resource_id is null or p_row_count<>1))
  then
    raise exception 'ai09j_invalid_read_scope' using errcode='42501';
  end if;
  if auth.jwt()->>'role' is distinct from 'authenticated'
     or v_user_text is null or v_sid_text is null
     or v_user_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_sid_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception 'ai09j_current_session_required' using errcode='42501';
  end if;

  select m.user_id,b.session_id into v_actor,v_session
  from public.organization_members m
  join public.organizations o on o.id=m.organization_id and o.status='active'
  join public.tenant_session_bindings b
    on b.organization_id=m.organization_id and b.user_id=m.user_id
  join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
  where m.organization_id=p_organization_id
    and m.user_id=v_user_text::uuid
    and b.session_id=v_sid_text::uuid
    and m.active=true and m.role in ('owner','admin')
  for share of m,o,b,s;
  if not found then
    raise exception 'ai09j_live_binding_denied' using errcode='42501';
  end if;

  -- PostgreSQL UNIQUE conflict handling serializes concurrent inserts of the
  -- same request_id: one transaction can insert, the other cannot bypass the
  -- first transaction's COMMIT/ROLLBACK outcome.
  insert into ai09j_rehearsal.read_request_audit(
    request_id,organization_id,actor_id,session_id,
    tool_id,resource_id,row_count
  ) values(
    p_request_id,p_organization_id,v_actor,v_session,
    p_tool_id,p_resource_id,p_row_count
  )
  on conflict(request_id) do nothing
  returning request_id into v_inserted;

  select * into v_existing
  from ai09j_rehearsal.read_request_audit
  where request_id=p_request_id
  for share;
  if not found or v_existing.organization_id<>p_organization_id
     or v_existing.actor_id<>v_actor
     or v_existing.session_id<>v_session
     or v_existing.tool_id<>p_tool_id
     or v_existing.resource_id is distinct from p_resource_id
     or v_existing.row_count<>p_row_count
  then
    -- An ID collision across tenants, sessions or different resource scopes
    -- must never return the prior request's data, status or audit details.
    raise exception 'ai09j_request_scope_collision' using errcode='42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'local_fixture_only',true,'may_execute',false,
    'replay_state',case when v_inserted is not null
       then 'inserted_pending_commit' else 'already_present_no_result' end,
    'request_id',p_request_id,
    'records',pg_catalog.jsonb_build_array()
  );
end;
$ai09j_once$;

revoke all on function ai09j_rehearsal.record_once_fixture_v1(uuid,uuid,text,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function ai09j_rehearsal.record_once_fixture_v1(uuid,uuid,text,uuid,integer)
  to authenticated;
revoke all on function ai09j_rehearsal.reject_audit_changes_v1()
  from public,anon,authenticated,service_role;
