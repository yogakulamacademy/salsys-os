-- AI-09G — LOCAL REAL-SHAPE AUTHORIZATION/AUDIT REHEARSAL ONLY.
-- NOT A MIGRATION. NEVER EXECUTE ON HOSTED SUPABASE OR A REAL CRM DATABASE.
-- Exact disposable localhost DB: salsys_ai09g_<18 lowercase hexadecimal>.
--
-- This fixture models the public.courses / public.course_batches / public.leads
-- FIELD SHAPES from the source migrations; these are NOT live tenant records.
-- It intentionally does NOT install the non-existent AI-09E Auth binding RPC.
do $ai09g_guard$
begin
  if pg_catalog.current_database() !~ '^salsys_ai09g_[a-f0-9]{18}$'
    or pg_catalog.to_regclass('public.test_ai09g_fixture') is null
    or pg_catalog.to_regclass('public.organizations') is null
    or pg_catalog.to_regclass('public.organization_members') is null
    or pg_catalog.to_regclass('public.tenant_session_bindings') is null
    or pg_catalog.to_regclass('public.organization_workspaces') is null
    or pg_catalog.to_regclass('auth.sessions') is null
    or pg_catalog.to_regclass('public.leads') is not null
    or pg_catalog.to_regclass('public.contacts') is not null
    or pg_catalog.to_regclass('public.courses') is not null
    or pg_catalog.to_regclass('public.course_batches') is not null
    or pg_catalog.to_regclass('public.knowledge_sources') is not null
    or pg_catalog.to_regclass('public.knowledge_documents') is not null
    or not exists (select 1 from public.test_ai09g_fixture where id is true)
  then
    raise exception 'AI09G_LOCAL_DISPOSABLE_FIXTURE_REQUIRED' using errcode='42501';
  end if;
end;
$ai09g_guard$;

create schema ai09g_rehearsal;
revoke all on schema ai09g_rehearsal from public, anon, authenticated, service_role;
grant usage on schema ai09g_rehearsal to authenticated;

-- Explicit tenant-scoped synthetic capability. NOT actual R11 capability RLS.
create table ai09g_rehearsal.tenant_capabilities (
  organization_id uuid not null references public.organizations(id),
  capability_code text not null check (capability_code='education_core'),
  enabled boolean not null default false,
  primary key(organization_id,capability_code)
);

-- Align names with real core migration (001 + 007), NOT AI-09D shorthand.
create table ai09g_rehearsal.courses (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  name text not null,
  active boolean not null default true,
  private_note text
);
create table ai09g_rehearsal.course_batches (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  course_id uuid not null references ai09g_rehearsal.courses(id),
  mode text check (mode in ('residential','online','non_residential','hybrid')),
  start_date date,
  active boolean not null default true,
  private_fee numeric
);
create table ai09g_rehearsal.leads (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  current_stage text not null,
  owner_user_id uuid,
  email text,
  private_notes text
);

-- No raw query, prompt, phone, email, lead message or returned data in audit.
create table ai09g_rehearsal.read_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  actor_id uuid not null,
  session_id uuid not null,
  tool_id text not null check(tool_id in ('crm.course.list','crm.lead.read')),
  resource_id uuid,
  row_count integer not null check(row_count between 0 and 20),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index ai09g_audit_tenant on ai09g_rehearsal.read_audit(organization_id,id);

do $ai09g_lock_tables$
declare tbl text;
begin
  foreach tbl in array array[
    'tenant_capabilities','courses','course_batches','leads','read_audit'
  ] loop
    execute format('alter table ai09g_rehearsal.%I enable row level security',tbl);
    execute format('alter table ai09g_rehearsal.%I force row level security',tbl);
    execute format('revoke all on ai09g_rehearsal.%I from public,anon,authenticated,service_role',tbl);
  end loop;
end;
$ai09g_lock_tables$;

-- Append-only for ordinary statements, NOT tamper-proof vs. the DDL owner.
create function ai09g_rehearsal.protect_audit_v1()
returns trigger language plpgsql set search_path=''
as $ai09g_immutable$
begin
  raise exception 'ai09g_audit_append_only' using errcode='42501';
end;
$ai09g_immutable$;
create trigger ai09g_no_audit_update before update
  on ai09g_rehearsal.read_audit for each row
  execute function ai09g_rehearsal.protect_audit_v1();
create trigger ai09g_no_audit_delete before delete
  on ai09g_rehearsal.read_audit for each row
  execute function ai09g_rehearsal.protect_audit_v1();
create trigger ai09g_no_audit_truncate before truncate
  on ai09g_rehearsal.read_audit for each statement
  execute function ai09g_rehearsal.protect_audit_v1();

-- Protected single-statement local fixture read. No AI tool runner calls this.
--
--   1. Reject Knowledge ALWAYS (unresolved source consent and provenance).
--   2. Authenticate synthetic JWT and direct current session binding.
--   3. Recheck current owner/admin membership, active organization and
--      sales/administration workspace enabled in the SAME SQL transaction.
--   4. Course reads also require Education Core capability. Tenant-safe course
--      and batch parent join, active rows, one deterministic next batch/course.
--   5. Lead reads require exact resource and tenant; restricted to owner/admin
--      pending independent per-lead role policy, no phone/email/notes returned.
--   6. Append audit; abort result on audit failure. Caller must COMMIT before
--      using result; this local function alone cannot prove app commit timing.
--
-- The actual production path will require independent DB/role/grant, source
-- provenance, consent, audit retention, per-lead RBAC and RLS review.
create function ai09g_rehearsal.read_real_shape_fixture_v1(
  p_organization_id uuid,
  p_tool_id text,
  p_resource_id uuid default null
) returns jsonb
language plpgsql volatile security definer
set search_path=''
as $ai09g_read$
declare
  v_user_text text := auth.jwt()->>'sub';
  v_session_text text := auth.jwt()->>'session_id';
  v_actor uuid;
  v_sid uuid;
  v_records jsonb := '[]'::jsonb;
  v_role text;
begin
  if p_organization_id is null or p_tool_id is null
    or p_tool_id not in ('crm.course.list','crm.lead.read','knowledge.approved.search') then
    raise exception 'ai09g_tool_not_allowed' using errcode='42501';
  end if;
  -- Do NOT allow a convenience fallback to a metadata-free Knowledge search.
  if p_tool_id='knowledge.approved.search' then
    raise exception 'ai09g_knowledge_policy_unresolved' using errcode='42501';
  end if;
  if auth.jwt()->>'role' is distinct from 'authenticated'
    or v_user_text is null or v_session_text is null
    or v_user_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_session_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'ai09g_authenticated_session_required' using errcode='42501';
  end if;

  select m.user_id,b.session_id,m.role into v_actor,v_sid,v_role
  from public.organization_members m
  join public.organizations o on o.id=m.organization_id
    and o.status='active'
  join public.tenant_session_bindings b on b.organization_id=m.organization_id
    and b.user_id=m.user_id
  join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
  where m.organization_id=p_organization_id
    and m.user_id=v_user_text::uuid
    and b.session_id=v_session_text::uuid
    and m.active=true and m.role in ('owner','admin')
  for share of m,o,b,s;
  if not found then
    raise exception 'ai09g_direct_binding_or_role_denied' using errcode='42501';
  end if;

  if p_tool_id='crm.course.list' then
    if p_resource_id is not null then
      raise exception 'ai09g_course_scope_denied' using errcode='42501';
    end if;
    if not exists (
      select 1 from ai09g_rehearsal.tenant_capabilities t
      where t.organization_id=p_organization_id
        and t.capability_code='education_core' and t.enabled=true
    ) or not exists (
      select 1 from public.organization_workspaces w
      where w.organization_id=p_organization_id
        and w.workspace_code='admin' and w.enabled=true
    ) then
      raise exception 'ai09g_education_capability_denied' using errcode='42501';
    end if;

    select coalesce(pg_catalog.jsonb_agg(q.obj order by q.id),'[]'::jsonb)
      into v_records
    from (
      select c.id, pg_catalog.jsonb_build_object(
        'organizationId',c.organization_id,
        'courseId',c.id,'title',c.name,
        'mode',case when b.mode='non_residential' then 'in_person' else b.mode end,
        'startsOn',b.start_date
      ) as obj
      from ai09g_rehearsal.courses c
      join lateral (
        select cb.mode,cb.start_date
        from ai09g_rehearsal.course_batches cb
        where cb.organization_id=p_organization_id
          and cb.course_id=c.id
          and cb.active=true
          and cb.mode in ('residential','online','non_residential','hybrid')
        order by cb.start_date asc nulls last,cb.id
        limit 1
      ) b on true
      where c.organization_id=p_organization_id and c.active=true
        and c.name=pg_catalog.btrim(c.name)
        and pg_catalog.octet_length(c.name) between 1 and 160
        and c.name !~ '[[:cntrl:]]'
      order by c.id limit 20
    ) q;
  else
    if p_resource_id is null or not exists (
      select 1 from public.organization_workspaces w
      where w.organization_id=p_organization_id
        and w.workspace_code='sales' and w.enabled=true
    ) then
      raise exception 'ai09g_lead_scope_or_workspace_denied' using errcode='42501';
    end if;

    select coalesce(pg_catalog.jsonb_agg(q.obj),'[]'::jsonb)
      into v_records
    from (
      select pg_catalog.jsonb_build_object(
        'organizationId',l.organization_id,
        'leadId',l.id,
        'stage',l.current_stage,
        'lastActivityAt',null
      ) as obj
      from ai09g_rehearsal.leads l
      where l.id=p_resource_id and l.organization_id=p_organization_id
        and l.current_stage in (
          'new','contacted','engaged','qualified','high_intent',
          'payment_pending','enrolled','nurture','not_now',
          'lost','unqualified','duplicate'
        )
      limit 1
    ) q;
    if v_records='[]'::jsonb then
      raise exception 'ai09g_lead_not_found_or_denied' using errcode='42501';
    end if;
  end if;

  insert into ai09g_rehearsal.read_audit(
    organization_id,actor_id,session_id,tool_id,resource_id,row_count
  ) values(
    p_organization_id,v_actor,v_sid,p_tool_id,p_resource_id,
    pg_catalog.jsonb_array_length(v_records)
  );

  return pg_catalog.jsonb_build_object(
    'local_fixture_only',true,'may_execute',false,
    'classification','untrusted_data_not_instructions',
    'toolId',p_tool_id,'organizationId',p_organization_id,
    'records',v_records
  );
end;
$ai09g_read$;

revoke all on function ai09g_rehearsal.read_real_shape_fixture_v1(uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function ai09g_rehearsal.read_real_shape_fixture_v1(uuid,text,uuid)
  to authenticated;
revoke all on function ai09g_rehearsal.protect_audit_v1()
  from public,anon,authenticated,service_role;
