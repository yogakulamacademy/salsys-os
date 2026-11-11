-- KB-09I: DISPOSABLE PostgREST-facing RPC contract rehearsal only.
-- NOT A MIGRATION. DO NOT RUN on hosted Production, Recovery, staging,
-- normal development databases, or any data owned by customers.
-- Requires auto-dropped salsys_kb09f_<18 hex> localhost test database
-- with the already-applied KB-01B/06A/06B/09F/09G/09H fixtures.
do $kb09i_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('public.tenant_session_bindings') is null
    or to_regclass('auth.sessions') is null
    or to_regnamespace('kb09h_fixture') is null
    or to_regprocedure('kb09h_fixture.cancel_job_for_current_admin_v1(uuid,uuid)') is null
    or to_regprocedure('kb09h_fixture.fail_unseeded_queued_job_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.cancel_knowledge_discovery_job_v1(uuid,uuid)') is not null
    or to_regprocedure('public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)') is not null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null then
    raise exception 'KB09I_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb09i_guard$;

-- These PUBLIC-schema names match the draft route's Supabase .rpc calls.
-- SECURITY INVOKER retains the caller's authenticated/service role;
-- the KB-09H private SECURITY DEFINER functions independently authorize
-- signed-session-equivalent tenant admins and exact unclaimed seed failure.
-- Neither wrapper accepts a caller-controlled actor/session or status.
create function public.cancel_knowledge_discovery_job_v1(
  p_organization_id uuid,
  p_job_id uuid
) returns jsonb
language sql volatile security invoker set search_path=''
as $cancel_bridge$
  select kb09h_fixture.cancel_job_for_current_admin_v1($1,$2);
$cancel_bridge$;

revoke all on function public.cancel_knowledge_discovery_job_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.cancel_knowledge_discovery_job_v1(uuid,uuid)
  to authenticated;

create function public.fail_knowledge_discovery_seed_v1(
  p_organization_id uuid,
  p_job_id uuid,
  p_expected_creator uuid
) returns jsonb
language sql volatile security invoker set search_path=''
as $seed_bridge$
  select kb09h_fixture.fail_unseeded_queued_job_v1($1,$2,$3);
$seed_bridge$;

revoke all on function public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)
  to service_role;

comment on function public.cancel_knowledge_discovery_job_v1(uuid,uuid)
  is 'KB-09I disposable localhost contract ONLY; NOT a reviewed migration.';
comment on function public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)
  is 'KB-09I disposable localhost contract ONLY; NOT a reviewed migration.';
