-- KB-09N — DISPOSABLE ONLY, NOT A MIGRATION OR DEPLOYABLE SQL.
-- Deny the obsolete service-only seed-failure repair after KB-09J's
-- transactional job+seed enqueue, and fail closed on public RPC/table ACLs.
-- Never use on hosted Supabase, staging, Production, Recovery, real
-- tenants, customer data, shared dev database, or local persistent DB.
begin;

do $kb09n_disposable_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null
    or to_regclass('auth.sessions') is null
    or to_regclass('public.tenant_session_bindings') is null
    or to_regnamespace('kb09h_fixture') is null
    or to_regnamespace('kb09l_fixture') is null
    or to_regprocedure('public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)') is null
    or to_regprocedure('public.commit_knowledge_discovery_page_with_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)') is null
    or to_regprocedure('public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)') is null
    or to_regprocedure('public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('kb09h_fixture.fail_unseeded_queued_job_v1(uuid,uuid,uuid)') is null
  then raise exception 'KB09N_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb09n_disposable_guard$;

-- The old "repair the orphaned seed page" path no longer has a legitimate
-- caller after KB-09J. Remove *both* public and private EXECUTE exposure.
-- Keep the DB functions in the disposable fixture for regression evidence;
-- do NOT DROP, ALTER production code or reintroduce direct table writes.
revoke execute on function public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke execute on function kb09h_fixture.fail_unseeded_queued_job_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

-- KB-01B originally GRANTed ALL service permissions to jobs/pages.
-- Previous KB-09G/J removed INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER, but
-- REFERENCES was still inherited. Remove that DDL permission too:
-- direct service-role table access must be SELECT-only in this fixture.
revoke references on public.knowledge_discovery_jobs,
  public.knowledge_discovery_pages
  from public,anon,authenticated,service_role;

-- Read-only catalog assertions, including PUBLIC-inherited grants.
-- Nine allowed runtime contracts must match the exact role; disabled
-- historical functions must have no executable public/anon/auth/service
-- route. PostgREST/real Supabase ACL behavior still requires staging.
do $kb09n_audit$
declare
  r record;
  v_role text;
  t text;
  v_perm text;
begin
  for r in
    select * from (values
      ('public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)','authenticated'),
      ('public.cancel_knowledge_discovery_job_v1(uuid,uuid)','authenticated'),
      ('public.issue_knowledge_discovery_challenge_for_admin_v1(uuid,text,text)','authenticated'),
      ('public.claim_knowledge_discovery_proof_check_for_admin_v1(uuid,text,text)','authenticated'),
      ('public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)','service_role'),
      ('public.grant_knowledge_discovery_consent_v1(uuid,text,text,text,timestamptz,text)','authenticated'),
      ('public.withdraw_knowledge_discovery_consent_v1(uuid,text,integer)','authenticated'),
      ('public.claim_knowledge_discovery_job_v1()','service_role'),
      ('public.commit_knowledge_discovery_page_with_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)','service_role')
    ) as allowed(fn,executor)
  loop
    if to_regprocedure(r.fn) is null then
      raise exception 'KB09N_missing_runtime_rpc: %',r.fn using errcode='42501';
    end if;
    foreach v_role in array array['anon','authenticated','service_role']
    loop
      if pg_catalog.has_function_privilege(v_role,r.fn,'execute')
           is distinct from (v_role=r.executor) then
        raise exception 'KB09N_runtime_rpc_role_mismatch: % %',r.fn,v_role
          using errcode='42501';
      end if;
    end loop;
  end loop;

  for t in
    select unnest(array[
      'public.commit_knowledge_discovery_page_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)',
      'public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)',
      'public.issue_knowledge_discovery_domain_challenge_v1(uuid,text,uuid,text)',
      'public.claim_knowledge_discovery_proof_check_v1(uuid,text,text)',
      'public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)',
      'kb09h_fixture.fail_unseeded_queued_job_v1(uuid,uuid,uuid)',
      'kb09k_fixture.confirm_checked_domain_proof_v1(uuid,text,text)'
    ])
  loop
    if to_regprocedure(t) is null then
      raise exception 'KB09N_retired_function_missing: %',t using errcode='42501';
    end if;
    foreach v_role in array array['anon','authenticated','service_role']
    loop
      if pg_catalog.has_function_privilege(v_role,t,'execute') then
        raise exception 'KB09N_retired_rpc_still_executable: % %',t,v_role
          using errcode='42501';
      end if;
    end loop;
  end loop;

  for t in
    select unnest(array[
      'public.knowledge_discovery_jobs',
      'public.knowledge_discovery_pages',
      'public.knowledge_discovery_domain_verifications',
      'public.knowledge_discovery_site_consents',
      'public.knowledge_discovery_consent_control',
      'public.knowledge_discovery_consent_audit'
    ])
  loop
    if to_regclass(t) is null then
      raise exception 'KB09N_missing_security_table: %',t using errcode='42501';
    end if;
    foreach v_perm in array array[
      'insert','update','delete','truncate','trigger','references'
    ]
    loop
      if pg_catalog.has_table_privilege('service_role',t,v_perm) then
        raise exception 'KB09N_service_role_direct_write_or_ddl: % %',
          t,v_perm using errcode='42501';
      end if;
    end loop;
    if not pg_catalog.has_table_privilege('service_role',t,'select') then
      raise exception 'KB09N_read_only_service_select_missing: %',t
        using errcode='42501';
    end if;
  end loop;

  if exists (select 1 from public.knowledge_discovery_consent_control
             where grants_enabled) then
    raise exception 'KB09N_unapproved_policy_grants_active' using errcode='42501';
  end if;
end;
$kb09n_audit$;

commit;
