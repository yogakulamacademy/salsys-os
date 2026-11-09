-- AI-03A REVIEW-ONLY prompt version + independent approval ledger.
-- NOT A MIGRATION. NEVER EXECUTE ON HOSTED SUPABASE OR PRODUCTION.
-- Only disposable, localhost PostgreSQL named salsys_ai03a_<18 hexadecimal>.
-- The data and functions in this file are NOT connected to runtime Co-Pilot.
--
-- Only synthetic table names are accepted to make accidental execution
-- against a real CRM database fail. Independent DBA/security/legal review
-- is required before considering any separate installable migration.
do $ai03a_guard$
begin
  if pg_catalog.current_database() !~ '^salsys_ai03a_[a-f0-9]{18}$'
     or pg_catalog.to_regclass('public.test_ai03a_fixture') is null
     or pg_catalog.to_regclass('public.organizations') is null
     or pg_catalog.to_regclass('public.organization_members') is null
     or pg_catalog.to_regclass('public.tenant_session_bindings') is null
     or pg_catalog.to_regclass('auth.sessions') is null
     or pg_catalog.to_regclass('public.leads') is not null
     or pg_catalog.to_regclass('public.contacts') is not null then
    raise exception 'AI03A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED';
  end if;
end;
$ai03a_guard$;

create schema ai03a_rehearsal;
revoke all on schema ai03a_rehearsal from public, anon, authenticated, service_role;
grant usage on schema ai03a_rehearsal to authenticated;

-- A version's body and SHA-256 digest are write-once. Changing the approval
-- status never changes the body and never activates an AI model.
create table ai03a_rehearsal.prompt_versions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  prompt_key text not null check (prompt_key in (
    'admissions_router','admissions_reply','staff_insight'
  )),
  version integer not null check (version between 1 and 1000000),
  body text not null check (pg_catalog.octet_length(body) between 40 and 12000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  author_id uuid not null,
  author_session_id uuid not null,
  status text not null default 'draft' check (
    status in ('draft','pending_review','reviewed','rejected')
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  submitted_at timestamptz,
  reviewer_id uuid,
  reviewed_at timestamptz,
  constraint ai03a_unique_version unique (organization_id,prompt_key,version)
);
alter table ai03a_rehearsal.prompt_versions enable row level security;
alter table ai03a_rehearsal.prompt_versions force row level security;
revoke all on ai03a_rehearsal.prompt_versions from public,anon,authenticated,service_role;

create table ai03a_rehearsal.prompt_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  prompt_id uuid not null references ai03a_rehearsal.prompt_versions(id) on delete restrict,
  action text not null check (action in (
    'created','submitted','reviewed','rejected'
  )),
  actor_id uuid not null,
  actor_session_id uuid not null,
  body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table ai03a_rehearsal.prompt_audit enable row level security;
alter table ai03a_rehearsal.prompt_audit force row level security;
revoke all on ai03a_rehearsal.prompt_audit from public,anon,authenticated,service_role;
create index ai03a_audit_by_prompt on ai03a_rehearsal.prompt_audit (prompt_id,id);

-- No delete, truncate, or content edit. Privileged DDL owner/superuser
-- could still replace triggers; not a cryptographic immutable ledger.
create function ai03a_rehearsal.protect_prompt_body_v1()
returns trigger language plpgsql
set search_path = ''
as $ai03a_protect$
begin
  if tg_op='DELETE' then
    raise exception 'ai03a_prompt_delete_forbidden' using errcode='42501';
  end if;
  if tg_op='TRUNCATE' then
    raise exception 'ai03a_prompt_truncate_forbidden' using errcode='42501';
  end if;
  if old.id is distinct from new.id
    or old.organization_id is distinct from new.organization_id
    or old.prompt_key is distinct from new.prompt_key
    or old.version is distinct from new.version
    or old.body is distinct from new.body
    or old.sha256 is distinct from new.sha256
    or old.author_id is distinct from new.author_id
    or old.author_session_id is distinct from new.author_session_id
    or old.created_at is distinct from new.created_at then
    raise exception 'ai03a_prompt_version_immutable' using errcode='42501';
  end if;
  return new;
end;
$ai03a_protect$;
create trigger ai03a_prompt_immutable_update before update
  on ai03a_rehearsal.prompt_versions for each row
  execute function ai03a_rehearsal.protect_prompt_body_v1();
create trigger ai03a_prompt_no_delete before delete
  on ai03a_rehearsal.prompt_versions for each row
  execute function ai03a_rehearsal.protect_prompt_body_v1();
create trigger ai03a_prompt_no_truncate before truncate
  on ai03a_rehearsal.prompt_versions for each statement
  execute function ai03a_rehearsal.protect_prompt_body_v1();

create function ai03a_rehearsal.protect_prompt_audit_v1()
returns trigger language plpgsql
set search_path = ''
as $ai03a_audit_immutable$
begin
  raise exception 'ai03a_audit_append_only' using errcode='42501';
end;
$ai03a_audit_immutable$;
create trigger ai03a_audit_no_update before update
  on ai03a_rehearsal.prompt_audit for each row
  execute function ai03a_rehearsal.protect_prompt_audit_v1();
create trigger ai03a_audit_no_delete before delete
  on ai03a_rehearsal.prompt_audit for each row
  execute function ai03a_rehearsal.protect_prompt_audit_v1();
create trigger ai03a_audit_no_truncate before truncate
  on ai03a_rehearsal.prompt_audit for each statement
  execute function ai03a_rehearsal.protect_prompt_audit_v1();

-- Synthetic Auth session + current tenant membership recheck in every write.
-- This is a local rehearsal of the deployed Auth/session-binding model,
-- not evidence of effective production RLS or claims verification.
create function ai03a_rehearsal.current_reviewer_v1(
  p_organization_id uuid
) returns table(actor_id uuid, session_id uuid)
language plpgsql volatile security definer
set search_path = ''
as $ai03a_actor$
declare
  v_user text;
  v_session text;
begin
  v_user := auth.jwt()->>'sub';
  v_session := auth.jwt()->>'session_id';
  if auth.jwt()->>'role' is distinct from 'authenticated'
    or v_user is null or v_user !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_session is null or v_session !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_organization_id is null then
    raise exception 'ai03a_authenticated_actor_required' using errcode='42501';
  end if;
  return query
    select m.user_id,b.session_id
      from public.organization_members m
      join public.organizations o on o.id=m.organization_id
        and o.status='active'
      join public.tenant_session_bindings b
        on b.organization_id=m.organization_id and b.user_id=m.user_id
      join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
      where m.organization_id=p_organization_id
        and m.user_id=v_user::uuid and b.session_id=v_session::uuid
        and m.active=true and m.role in ('owner','admin')
      for share of m,o,b,s;
  if not found then
    raise exception 'ai03a_member_session_denied' using errcode='42501';
  end if;
end;
$ai03a_actor$;

-- No public EXECUTE on this internal Auth helper.
revoke all on function ai03a_rehearsal.current_reviewer_v1(uuid)
  from public,anon,authenticated,service_role;

-- Insert a new draft version. Per-tenant/key advisory lock serializes
-- version allocation and prevents duplicate versions in parallel transactions.
-- The returned "draft" status never means authorized to run.
create function ai03a_rehearsal.create_prompt_draft_v1(
  p_organization_id uuid,p_prompt_key text,p_body text
) returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $ai03a_create$
declare
  v_actor uuid;
  v_session uuid;
  v_body text := pg_catalog.btrim(pg_catalog.coalesce(p_body,''));
  v_version integer;
  v_digest text;
  v_id uuid;
begin
  if p_prompt_key not in (
    'admissions_router','admissions_reply','staff_insight'
  ) or p_prompt_key is null
    or v_body is null or pg_catalog.octet_length(v_body) not between 40 and 12000 then
    raise exception 'ai03a_invalid_draft' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text||':'||p_prompt_key,0)
  );
  select actor_id,session_id into v_actor,v_session
    from ai03a_rehearsal.current_reviewer_v1(p_organization_id);
  select pg_catalog.coalesce(pg_catalog.max(version),0)+1 into v_version
    from ai03a_rehearsal.prompt_versions
    where organization_id=p_organization_id and prompt_key=p_prompt_key;
  if v_version>1000000 then
    raise exception 'ai03a_version_limit' using errcode='22023';
  end if;
  v_digest:=pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_body,'UTF8')),'hex'
  );
  insert into ai03a_rehearsal.prompt_versions(
    organization_id,prompt_key,version,body,sha256,author_id,author_session_id
  ) values(
    p_organization_id,p_prompt_key,v_version,v_body,v_digest,v_actor,v_session
  ) returning id into v_id;
  insert into ai03a_rehearsal.prompt_audit(
    organization_id,prompt_id,action,actor_id,actor_session_id,body_sha256
  ) values(p_organization_id,v_id,'created',v_actor,v_session,v_digest);
  return pg_catalog.jsonb_build_object(
    'id',v_id,'version',v_version,'sha256',v_digest,
    'status','draft','may_execute',false
  );
end;
$ai03a_create$;

create function ai03a_rehearsal.submit_prompt_review_v1(
  p_organization_id uuid,p_prompt_id uuid
) returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $ai03a_submit$
declare
  v_actor uuid;
  v_session uuid;
  v_prompt ai03a_rehearsal.prompt_versions%rowtype;
begin
  select actor_id,session_id into v_actor,v_session
    from ai03a_rehearsal.current_reviewer_v1(p_organization_id);
  select * into v_prompt from ai03a_rehearsal.prompt_versions
    where id=p_prompt_id and organization_id=p_organization_id for update;
  if not found or v_prompt.author_id is distinct from v_actor
    or v_prompt.status <> 'draft' then
    raise exception 'ai03a_submit_denied' using errcode='42501';
  end if;
  update ai03a_rehearsal.prompt_versions
    set status='pending_review',submitted_at=pg_catalog.clock_timestamp()
    where id=p_prompt_id;
  insert into ai03a_rehearsal.prompt_audit(
    organization_id,prompt_id,action,actor_id,actor_session_id,body_sha256
  ) values(
    p_organization_id,p_prompt_id,'submitted',v_actor,v_session,v_prompt.sha256
  );
  return pg_catalog.jsonb_build_object(
    'id',p_prompt_id,'status','pending_review','may_execute',false
  );
end;
$ai03a_submit$;

-- Reviewer must be a DIFFERENT active tenant owner/admin, with an
-- independently live Auth session. A reviewed candidate is *never* active.
-- It takes a separately approved future deploy artifact to activate a prompt.
create function ai03a_rehearsal.decide_prompt_review_v1(
  p_organization_id uuid,p_prompt_id uuid,p_decision text
) returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $ai03a_decide$
declare
  v_actor uuid;
  v_session uuid;
  v_prompt ai03a_rehearsal.prompt_versions%rowtype;
  v_status text;
begin
  if p_decision not in ('review','reject') or p_decision is null then
    raise exception 'ai03a_invalid_decision' using errcode='22023';
  end if;
  select actor_id,session_id into v_actor,v_session
    from ai03a_rehearsal.current_reviewer_v1(p_organization_id);
  select * into v_prompt from ai03a_rehearsal.prompt_versions
    where id=p_prompt_id and organization_id=p_organization_id for update;
  if not found or v_prompt.status <> 'pending_review'
    or v_prompt.author_id=v_actor
    or v_prompt.sha256 is distinct from pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(v_prompt.body,'UTF8')),'hex'
    ) then
    raise exception 'ai03a_review_denied' using errcode='42501';
  end if;
  v_status:=case when p_decision='review' then 'reviewed' else 'rejected' end;
  update ai03a_rehearsal.prompt_versions
    set status=v_status,reviewer_id=v_actor,
        reviewed_at=pg_catalog.clock_timestamp()
    where id=p_prompt_id;
  insert into ai03a_rehearsal.prompt_audit(
    organization_id,prompt_id,action,actor_id,actor_session_id,body_sha256
  ) values(
    p_organization_id,p_prompt_id,
    case when v_status='reviewed' then 'reviewed' else 'rejected' end,
    v_actor,v_session,v_prompt.sha256
  );
  return pg_catalog.jsonb_build_object(
    'id',p_prompt_id,'status',v_status,'may_execute',false
  );
end;
$ai03a_decide$;

-- No API grants to plain tables, no service-role RPC bypass, no "activate",
-- "publish", "send", "tool execute", or model-provider function.
revoke all on function ai03a_rehearsal.create_prompt_draft_v1(uuid,text,text)
  from public,anon,service_role;
revoke all on function ai03a_rehearsal.submit_prompt_review_v1(uuid,uuid)
  from public,anon,service_role;
revoke all on function ai03a_rehearsal.decide_prompt_review_v1(uuid,uuid,text)
  from public,anon,service_role;
grant execute on function ai03a_rehearsal.create_prompt_draft_v1(uuid,text,text)
  to authenticated;
grant execute on function ai03a_rehearsal.submit_prompt_review_v1(uuid,uuid)
  to authenticated;
grant execute on function ai03a_rehearsal.decide_prompt_review_v1(uuid,uuid,text)
  to authenticated;

-- The SQL file is deliberately uninstalled, locally guarded and unable
-- to make any prompt run. A reviewer must independently design deployed
-- grants, authenticated session checks, retention, approval and rollback.
