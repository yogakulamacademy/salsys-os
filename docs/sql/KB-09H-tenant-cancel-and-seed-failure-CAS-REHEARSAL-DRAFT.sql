-- KB-09H: STRICTLY DISPOSABLE PostgreSQL user-cancel / seed-failure CAS.
-- NOT A MIGRATION. NEVER run on any hosted Supabase, Production, Recovery,
-- staging, shared dev database or customer tenant. No runtime code uses this.
-- Depends on local synthetic KB-01B/06A/06B/09F/09G setup.
do $guard_kb09h$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
     or to_regclass('public.test_knowledge_admins') is null
     or to_regclass('public.organizations') is null
     or to_regclass('public.tenant_session_bindings') is null
     or to_regclass('auth.sessions') is null
     or to_regprocedure('public.kb_discovery_consent_actor_v1(uuid)') is null
     or to_regclass('public.knowledge_discovery_jobs') is null
     or to_regclass('public.knowledge_discovery_pages') is null
     or to_regnamespace('kb09g_fixture') is null
     or to_regnamespace('kb09h_fixture') is not null
     or to_regclass('public.leads') is not null
     or to_regclass('public.contacts') is not null then
    raise exception 'KB09H_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$guard_kb09h$;

create schema kb09h_fixture;
revoke all on schema kb09h_fixture from public,anon,authenticated,service_role;
grant usage on schema kb09h_fixture to authenticated,service_role;

-- A single terminal transition per job. No raw lease/token/content in audit.
-- Service-origin seed repair is not misattributed to an authenticated user.
create table kb09h_fixture.job_finalization_audit (
  organization_id uuid not null,
  job_id uuid not null,
  action text not null check(action in ('tenant_cancel','seed_failure')),
  previous_status text not null check(previous_status in ('queued','running')),
  final_status text not null check(final_status in ('cancelled','failed')),
  initiator text not null check(initiator in ('tenant_admin','service_seed_handler')),
  actor_id uuid,
  session_id uuid,
  job_created_by uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint kb09h_audit_actor_fields check (
    (initiator='tenant_admin' and actor_id is not null and session_id is not null)
    or (initiator='service_seed_handler' and actor_id is null and session_id is null)
  ),
  primary key(organization_id,job_id),
  foreign key(job_id,organization_id)
    references public.knowledge_discovery_jobs(id,organization_id)
    on delete restrict
);
alter table kb09h_fixture.job_finalization_audit enable row level security;
revoke all on kb09h_fixture.job_finalization_audit
  from public,anon,authenticated,service_role;

create function kb09h_fixture.deny_job_audit_mutation()
returns trigger language plpgsql security invoker set search_path=''
as $immutable$
begin
  raise exception 'kb09h_audit_append_only' using errcode='42501';
end;
$immutable$;
revoke all on function kb09h_fixture.deny_job_audit_mutation()
 from public,anon,authenticated,service_role;
create trigger kb09h_audit_append_only
before update or delete on kb09h_fixture.job_finalization_audit
for each row execute function kb09h_fixture.deny_job_audit_mutation();

-- The user-cancel path MUST verify the current signed-session-equivalent
-- actor via the existing KB-06B helper. No user id/session can be supplied
-- as parameters. Function is private and not exposed as a PostgREST RPC.
create function kb09h_fixture.cancel_job_for_current_admin_v1(
  p_organization_id uuid,
  p_job_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path=''
as $cancel$
declare
  v_actor uuid;
  v_session uuid;
  v_job public.knowledge_discovery_jobs%rowtype;
begin
  v_actor:=public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb09h_current_actor_or_session_denied' using errcode='42501';
  end if;
  if p_job_id is null then
    raise exception 'kb09h_job_id_required' using errcode='22023';
  end if;
  v_session:=(auth.jwt()->>'session_id')::uuid;

  -- Lock before update: the existing page-commit, claim and audited consent
  -- withdrawal use this same job-row lock. Never trust an initial API read.
  select * into v_job from public.knowledge_discovery_jobs j
  where j.organization_id=p_organization_id and j.id=p_job_id
  for update;
  if not found or v_job.status not in ('queued','running') then
    return jsonb_build_object('ok',false,'reason','not_active_or_not_found');
  end if;

  update public.knowledge_discovery_jobs j set
    status='cancelled',last_error_code='owner_cancelled',
    lease_token=null,lease_until=null,finished_at=clock_timestamp()
  where j.id=v_job.id and j.organization_id=p_organization_id
    and j.status in ('queued','running');
  if not found then
    return jsonb_build_object('ok',false,'reason','not_active_or_not_found');
  end if;

  -- Audit failure makes the cancelled lease roll back atomically.
  insert into kb09h_fixture.job_finalization_audit (
    organization_id,job_id,action,previous_status,final_status,
    initiator,actor_id,session_id,job_created_by
  ) values (
    p_organization_id,p_job_id,'tenant_cancel',v_job.status,'cancelled',
    'tenant_admin',v_actor,v_session,v_job.created_by
  );
  return jsonb_build_object('ok',true,'status','cancelled',
    'audit_recorded',true);
end;
$cancel$;

revoke all on function kb09h_fixture.cancel_job_for_current_admin_v1(
  uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function kb09h_fixture.cancel_job_for_current_admin_v1(
  uuid,uuid) to authenticated;

-- Seed failure is SERVICE-ONLY, never tenant callable. A failure to INSERT
-- the very first seed page may be repaired ONLY while the exact tenant/job
-- remains queued, unclaimed and has zero pages. No caller-supplied error
-- reason, status or timestamp is accepted. Existing job INSERT remains
-- direct in the *draft* API; this procedure makes no new enqueue permission.
create function kb09h_fixture.fail_unseeded_queued_job_v1(
  p_organization_id uuid,
  p_job_id uuid,
  p_expected_creator uuid
)
returns jsonb language plpgsql volatile security definer set search_path=''
as $seed_failure$
declare
  v_job public.knowledge_discovery_jobs%rowtype;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'kb09h_service_required' using errcode='42501';
  end if;
  if p_organization_id is null or p_job_id is null
     or p_expected_creator is null then
    raise exception 'kb09h_invalid_seed_failure_request' using errcode='22023';
  end if;

  select * into v_job from public.knowledge_discovery_jobs j
  where j.organization_id=p_organization_id and j.id=p_job_id
  for update;
  if not found or v_job.status<>'queued'
     or v_job.created_by is distinct from p_expected_creator
     or v_job.lease_token is not null or v_job.lease_until is not null
     or v_job.started_at is not null or v_job.finished_at is not null
     or v_job.attempts<>0 or v_job.last_error_code is not null
     or exists(
       select 1 from public.knowledge_discovery_pages p
       where p.organization_id=p_organization_id and p.job_id=p_job_id
     ) then
    return jsonb_build_object('ok',false,'reason','not_eligible');
  end if;

  update public.knowledge_discovery_jobs j set
    status='failed',last_error_code='seed_insert_failed',
    lease_token=null,lease_until=null,finished_at=clock_timestamp()
  where j.organization_id=p_organization_id and j.id=p_job_id
    and j.status='queued' and j.lease_token is null and j.lease_until is null;
  if not found then
    return jsonb_build_object('ok',false,'reason','not_eligible');
  end if;

  insert into kb09h_fixture.job_finalization_audit (
    organization_id,job_id,action,previous_status,final_status,
    initiator,actor_id,session_id,job_created_by
  ) values (
    p_organization_id,p_job_id,'seed_failure','queued','failed',
    'service_seed_handler',null,null,v_job.created_by
  );
  return jsonb_build_object('ok',true,'status','failed',
    'audit_recorded',true);
end;
$seed_failure$;

revoke all on function kb09h_fixture.fail_unseeded_queued_job_v1(
  uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function kb09h_fixture.fail_unseeded_queued_job_v1(
  uuid,uuid,uuid) to service_role;

comment on function kb09h_fixture.cancel_job_for_current_admin_v1(uuid,uuid)
  is 'KB-09H DISPOSABLE REHEARSAL ONLY. No live HTTP RPC or signed JWT test.';
comment on function kb09h_fixture.fail_unseeded_queued_job_v1(uuid,uuid,uuid)
  is 'KB-09H DISPOSABLE REHEARSAL ONLY. No live worker integration.';
