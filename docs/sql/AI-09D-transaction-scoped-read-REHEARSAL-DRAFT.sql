-- AI-09D SYNTHETIC TRANSACTION-BOUND READ REHEARSAL.
-- NOT A MIGRATION. NEVER EXECUTE AGAINST HOSTED SUPABASE.
-- TEST DATABASE MUST BE: salsys_ai09d_<18 hex chars>.
-- This SQL returns SYNTHETIC local fixture rows, not customer CRM data.
-- Signed identity, production RLS and durable audit still require review.
do $ai09d_guard$
begin
  if pg_catalog.current_database() !~ '^salsys_ai09d_[a-f0-9]{18}$'
     or pg_catalog.to_regclass('public.test_ai09d_fixture') is null
     or pg_catalog.to_regclass('public.organizations') is null
     or pg_catalog.to_regclass('public.organization_members') is null
     or pg_catalog.to_regclass('public.tenant_session_bindings') is null
     or pg_catalog.to_regclass('auth.sessions') is null
     or pg_catalog.to_regclass('public.leads') is not null
     or pg_catalog.to_regclass('public.contacts') is not null
     or not exists (select 1 from public.test_ai09d_fixture where id is true)
  then
    raise exception 'AI09D_LOCAL_DISPOSABLE_FIXTURE_REQUIRED';
  end if;
end;
$ai09d_guard$;

create schema ai09d_rehearsal;
revoke all on schema ai09d_rehearsal from public, anon, authenticated, service_role;
grant usage on schema ai09d_rehearsal to authenticated;

create table ai09d_rehearsal.courses (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  title text not null,
  mode text not null check (mode in ('online','in_person','residential','hybrid')),
  starts_on date,
  published boolean not null default false,
  confidential_note text
);
create table ai09d_rehearsal.leads (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  stage text not null,
  last_activity_at timestamptz,
  phone text,
  email text,
  confidential_note text
);
create table ai09d_rehearsal.knowledge (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  approval_status text not null,
  source_status text not null,
  source_text_verified boolean not null default false,
  evidence_text text not null,
  internal_instruction text
);
create table ai09d_rehearsal.read_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  actor_id uuid not null,
  session_id uuid not null,
  tool_id text not null check (tool_id in (
    'knowledge.approved.search','crm.course.list','crm.lead.read'
  )),
  resource_id uuid,
  row_count integer not null check (row_count between 0 and 20),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index ai09d_read_audit_tenant on ai09d_rehearsal.read_audit(organization_id,id);

-- Ordinary clients receive neither direct table access nor audit mutation.
-- RLS is enabled here as defense in depth, but this SECURITY DEFINER rehearsal
-- runs under a privileged local fixture owner; the tests do NOT prove production
-- invoker-RLS behavior or appropriate role ownership.
do $ai09d_table_lock$
declare t text;
begin
  foreach t in array array['courses','leads','knowledge','read_audit'] loop
    execute format('alter table ai09d_rehearsal.%I enable row level security',t);
    execute format('alter table ai09d_rehearsal.%I force row level security',t);
    execute format('revoke all on ai09d_rehearsal.%I from public, anon, authenticated, service_role',t);
  end loop;
end;
$ai09d_table_lock$;

create function ai09d_rehearsal.protect_audit_v1()
returns trigger language plpgsql
set search_path = ''
as $ai09d_immutable$
begin
  raise exception 'ai09d_audit_append_only' using errcode='42501';
end;
$ai09d_immutable$;

create trigger ai09d_no_audit_update before update
  on ai09d_rehearsal.read_audit for each row
  execute function ai09d_rehearsal.protect_audit_v1();
create trigger ai09d_no_audit_delete before delete
  on ai09d_rehearsal.read_audit for each row
  execute function ai09d_rehearsal.protect_audit_v1();
create trigger ai09d_no_audit_truncate before truncate
  on ai09d_rehearsal.read_audit for each statement
  execute function ai09d_rehearsal.protect_audit_v1();

-- One function call = one PostgreSQL statement/transaction: current synthetic
-- session, tenant membership, read restrictions, evidence state and audit append
-- are checked within the same database transaction, not independent callbacks.
-- This is NOT a live model-facing tool; caller-supplied JWT values are mock
-- claims and cannot substitute for a cryptographically validated Supabase JWT.
create function ai09d_rehearsal.read_fixture_v1(
  p_organization_id uuid,
  p_tool_id text,
  p_resource_id uuid default null,
  p_query text default null
) returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $ai09d_read$
declare
  v_user text := auth.jwt()->>'sub';
  v_session text := auth.jwt()->>'session_id';
  v_actor uuid;
  v_sid uuid;
  v_records jsonb := '[]'::jsonb;
  v_q text;
begin
  if p_organization_id is null or p_tool_id is null
    or p_tool_id not in ('knowledge.approved.search','crm.course.list','crm.lead.read') then
    raise exception 'ai09d_invalid_tool_scope' using errcode='22023';
  end if;
  if auth.jwt()->>'role' is distinct from 'authenticated'
    or v_user is null or v_user !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_session is null or v_session !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'ai09d_current_session_required' using errcode='42501';
  end if;

  select m.user_id,b.session_id into v_actor,v_sid
    from public.organization_members m
    join public.organizations o on o.id=m.organization_id
      and o.status='active'
    join public.tenant_session_bindings b on b.organization_id=m.organization_id
      and b.user_id=m.user_id
    join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
    where m.organization_id=p_organization_id
      and m.user_id=v_user::uuid
      and b.session_id=v_session::uuid
      and m.active=true and m.role in ('owner','admin')
    for share of m,o,b,s;
  if not found then
    raise exception 'ai09d_tenant_session_or_role_denied' using errcode='42501';
  end if;

  if p_tool_id='crm.course.list' then
    if p_resource_id is not null or p_query is not null then
      raise exception 'ai09d_course_scope_denied' using errcode='22023';
    end if;
    select coalesce(pg_catalog.jsonb_agg(q.obj order by q.id),'[]'::jsonb)
      into v_records from (
        select id,pg_catalog.jsonb_build_object(
          'organizationId',organization_id,'courseId',id,
          'title',title,'mode',mode,'startsOn',starts_on
        ) as obj
        from ai09d_rehearsal.courses
        where organization_id=p_organization_id and published=true
        order by id limit 20
      ) q;
  elsif p_tool_id='crm.lead.read' then
    if p_resource_id is null or p_query is not null then
      raise exception 'ai09d_lead_scope_denied' using errcode='22023';
    end if;
    select coalesce(pg_catalog.jsonb_agg(q.obj),'[]'::jsonb)
      into v_records from (
        select pg_catalog.jsonb_build_object(
          'organizationId',organization_id,'leadId',id,'stage',stage,
          'lastActivityAt',
          case when last_activity_at is null then null
            else pg_catalog.to_char(last_activity_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          end
        ) as obj
        from ai09d_rehearsal.leads
        where id=p_resource_id and organization_id=p_organization_id
        limit 1
      ) q;
    if v_records='[]'::jsonb then
      raise exception 'ai09d_lead_not_found_or_denied' using errcode='42501';
    end if;
  else
    if p_resource_id is not null or p_query is null
      or p_query <> pg_catalog.btrim(p_query)
      or pg_catalog.octet_length(p_query) not between 2 and 160
      or p_query !~ '^[A-Za-z0-9][A-Za-z0-9 .,-]{1,159}$' then
      raise exception 'ai09d_knowledge_scope_denied' using errcode='22023';
    end if;
    v_q := pg_catalog.lower(p_query);
    select coalesce(pg_catalog.jsonb_agg(q.obj order by q.id),'[]'::jsonb)
      into v_records from (
        select id,pg_catalog.jsonb_build_object(
          'organizationId',organization_id,
          'documentId',id,'approvalStatus','approved',
          'sourceStatus','active','sourceTextVerified',true,
          'evidenceText',evidence_text
        ) as obj
        from ai09d_rehearsal.knowledge
        where organization_id=p_organization_id
          and approval_status='approved'
          and source_status='active' and source_text_verified=true
          and pg_catalog.octet_length(evidence_text) between 1 and 768
          and pg_catalog.strpos(pg_catalog.lower(evidence_text),v_q)>0
        order by id limit 5
      ) q;
  end if;

  -- This append must succeed before data can be returned. If it throws,
  -- the entire SQL statement fails and no synthetic row is returned.
  insert into ai09d_rehearsal.read_audit(
    organization_id,actor_id,session_id,tool_id,resource_id,row_count
  ) values (
    p_organization_id,v_actor,v_sid,p_tool_id,p_resource_id,
    pg_catalog.jsonb_array_length(v_records)
  );
  return pg_catalog.jsonb_build_object(
    'local_fixture_only',true,'may_execute',false,
    'classification','untrusted_data_not_instructions',
    'toolId',p_tool_id,'organizationId',p_organization_id,'records',v_records
  );
end;
$ai09d_read$;

-- PostgreSQL grants apply only to the local fixture. The function owner may
-- execute irrespective of these grants; no ordinary role can invoke except
-- authenticated. No direct SQL table privilege or model runtime is granted.
revoke all on function ai09d_rehearsal.read_fixture_v1(uuid,text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function ai09d_rehearsal.read_fixture_v1(uuid,text,uuid,text)
  to authenticated;
revoke all on function ai09d_rehearsal.protect_audit_v1()
  from public, anon, authenticated, service_role;
