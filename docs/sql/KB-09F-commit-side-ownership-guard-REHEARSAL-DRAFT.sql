-- KB-09F — LOCAL POSTGRES ONLY commit-side domain-ownership guard.
-- NOT A MIGRATION. NEVER apply on hosted Supabase, Production, Recovery,
-- staging, or any existing customer/application database.
-- Requires exact KB-01B + KB-06A + KB-06B synthetic discovery fixture,
-- including an audited-consent table and local admin marker.
do $kb09f_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
     or to_regclass('public.test_knowledge_admins') is null
     or to_regclass('public.knowledge_discovery_jobs') is null
     or to_regclass('public.knowledge_discovery_domain_verifications') is null
     or to_regclass('public.knowledge_discovery_site_consents') is null
     or to_regclass('public.knowledge_discovery_consent_audit') is null
     or to_regclass('public.leads') is not null
     or to_regclass('public.contacts') is not null
     or to_regnamespace('kb09f_fixture') is not null then
    raise exception 'KB09F_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb09f_guard$;

create schema kb09f_fixture;
revoke all on schema kb09f_fixture from public;
grant usage on schema kb09f_fixture to service_role;

-- In the disposable fixture only, disable the direct old commit RPC for
-- the simulated service_role to exercise the checked entry point. This is
-- NOT a real application migration. The service role can still use its
-- privileged table grants: this does not prove system-wide enforcement.
revoke all on function public.commit_knowledge_discovery_page_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) from public,anon,authenticated,service_role;

-- DB-only demonstration: check tenant/lease, then the CURRENT stored
-- ownership proof under row lock, before invoking the UNMODIFIED consent-
-- protected KB-06A page-commit implementation. Lock order is JOB,
-- OWNERSHIP, CONSENT (original commit locks JOB then CONSENT).
-- The existing KB-06B consent withdrawal locks JOB before CONSENT.
-- A concurrent change to the same proof row must wait / be observed.
create function kb09f_fixture.commit_page_with_current_proof_v1(
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
)
returns jsonb language plpgsql security definer
set search_path=''
as $checked$
declare
  v_job public.knowledge_discovery_jobs%rowtype;
  v_proof public.knowledge_discovery_domain_verifications%rowtype;
  v_host text;
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'kb09f_service_role_required' using errcode='42501';
  end if;
  if p_organization_id is null or p_job_id is null
     or p_lease_token is null then
    raise exception 'kb09f_invalid_claim' using errcode='22023';
  end if;
  select * into v_job from public.knowledge_discovery_jobs j
  where j.id=p_job_id and j.organization_id=p_organization_id
  for update;
  if not found or v_job.status<>'running'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_until is null
     or v_job.lease_until<=clock_timestamp() then
    return jsonb_build_object('ok',false,'reason','inactive_or_stale_lease');
  end if;

  -- Only use the canonical HTTPS hostname from the stored job, never
  -- from worker-controlled request data or a page's outbound link.
  v_host:=substring(v_job.seed_url from
    '^https://([a-z0-9][a-z0-9.-]*[.][a-z]{2,})(/|$)');
  if v_host is null then
    return jsonb_build_object('ok',false,'reason','seed_not_canonical');
  end if;
  select * into v_proof
    from public.knowledge_discovery_domain_verifications p
    where p.organization_id=p_organization_id and p.hostname=v_host
    for share;
  if not found or v_proof.verified_at is null
     or v_proof.verified_until is null
     or v_proof.verified_at>clock_timestamp()
     or v_proof.verified_until<=clock_timestamp() then
    return jsonb_build_object('ok',false,'reason','ownership_proof_not_current');
  end if;

  -- The original KB-06A transaction still validates tenant/lease and
  -- consent under its own locks before any page mutation. Do not copy,
  -- weaken or reimplement that code in this wrapper.
  select public.commit_knowledge_discovery_page_v1(
    p_organization_id,p_job_id,p_page_id,p_lease_token,p_page_status,
    p_http_status,p_content_type,p_page_title,p_failure_code,p_links,
    p_delay_seconds
  ) into v_result;

  -- If the timestamp expired during this transaction, throw so all
  -- earlier page mutations from the original function ROLL BACK.
  -- Clock/commit-time races must still be independently staged.
  if v_result->>'ok'='true'
     and v_proof.verified_until<=clock_timestamp() then
    raise exception 'kb09f_proof_expired_during_commit'
      using errcode='P0001';
  end if;
  return v_result;
end;
$checked$;

revoke all on function kb09f_fixture.commit_page_with_current_proof_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) from public,anon,authenticated,service_role;
grant execute on function kb09f_fixture.commit_page_with_current_proof_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) to service_role;

comment on function kb09f_fixture.commit_page_with_current_proof_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer
) is 'LOCAL DISPOSABLE KB09F ONLY. Not production authorization or a migration.';
