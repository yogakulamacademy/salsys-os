-- KB-09M: LOCAL/DISPOSABLE ONLY worker-to-proof-checker API contract.
-- NOT A MIGRATION. NEVER run this SQL on hosted Supabase, Production,
-- Recovery, staging, shared development or customer databases.
-- Prerequisites: random salsys_kb09f_<18 hex> auto-dropped fixture,
-- KB-01B/06A/06B and exact KB-09F through KB-09L rehearsal stack.
do $kb09m_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('auth.sessions') is null
    or to_regclass('public.tenant_session_bindings') is null
    or to_regclass('public.knowledge_discovery_jobs') is null
    or to_regclass('public.knowledge_discovery_pages') is null
    or to_regclass('public.knowledge_discovery_site_consents') is null
    or to_regclass('public.knowledge_discovery_domain_verifications') is null
    or to_regprocedure('kb09f_fixture.commit_page_with_current_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)') is null
    or to_regprocedure('public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)') is null
    or to_regprocedure('public.commit_knowledge_discovery_page_with_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)') is not null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null then
    raise exception 'KB09M_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end $kb09m_guard$;

-- This PUBLIC schema bridge is the exact PostgREST name used by the runner.
-- SECURITY INVOKER never silently bestows privileges; the function it
-- invokes is protected by its own internal service-role JWT and tenant/
-- active-lease/current-ownership/current-consent checks.
create function public.commit_knowledge_discovery_page_with_proof_v1(
  p_organization_id uuid,
  p_job_id uuid,
  p_page_id uuid,
  p_lease_token uuid,
  p_page_status text,
  p_http_status integer default null,
  p_content_type text default null,
  p_page_title text default null,
  p_failure_code text default null,
  p_links jsonb default '[]'::jsonb,
  p_delay_seconds integer default 2
) returns jsonb language sql volatile security invoker set search_path=''
as $bridge$
  select kb09f_fixture.commit_page_with_current_proof_v1(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
  );
$bridge$;
revoke all on function public.commit_knowledge_discovery_page_with_proof_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) from public,anon,authenticated,service_role;
grant execute on function public.commit_knowledge_discovery_page_with_proof_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) to service_role;

-- Reassert the deprecated direct page-commit interface cannot be reached
-- by application service-role. The private checked wrapper is owner-owned
-- and invokes the original consent-protected implementation internally.
revoke execute on function public.commit_knowledge_discovery_page_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) from public,anon,authenticated,service_role;

comment on function public.commit_knowledge_discovery_page_with_proof_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) is 'KB-09M DISPOSABLE REHEARSAL ONLY. Do not deploy or infer hosted RPC privileges';
