-- KB-09E — disposable-only early-denial lease CAS rehearsal.
-- NOT A MIGRATION. NEVER execute on hosted Supabase, Production, Recovery,
-- customer tenants, or a nonempty application database.
-- Requires random disposable local DB with exact KB-01B/KB-06A schemas
-- and the synthetic knowledge-discovery.foundation.sql marker.
-- NO production worker or real scheduler invokes this prototype.
do $kb09e_guard$
begin
  if current_database() !~ '^salsys_kb09e_[a-f0-9]{18}$'
     or to_regclass('public.test_knowledge_admins') is null
     or to_regclass('public.knowledge_discovery_jobs') is null
     or to_regclass('public.knowledge_discovery_domain_verifications') is null
     or to_regclass('public.knowledge_discovery_site_consents') is null
     or to_regclass('public.leads') is not null
     or to_regclass('public.contacts') is not null
     or to_regclass('kb09e_fixture.early_denial_audit') is not null then
    raise exception 'KB09E_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end
$kb09e_guard$;

create schema kb09e_fixture;
revoke all on schema kb09e_fixture from public;
grant usage on schema kb09e_fixture to service_role;

-- No raw lease token, website HTML, user details or customer content.
create table kb09e_fixture.early_denial_audit (
  organization_id uuid not null,
  job_id uuid not null,
  lease_sha256 text not null check (lease_sha256 ~ '^[a-f0-9]{64}$'),
  reason text not null check (
    reason in ('consent_not_active','ownership_proof_expired')
  ),
  observed_at timestamptz not null default clock_timestamp(),
  prior_status text not null check (prior_status='running'),
  result_status text not null check (result_status='cancelled'),
  primary key (organization_id,job_id,lease_sha256),
  foreign key (job_id,organization_id)
    references public.knowledge_discovery_jobs(id,organization_id)
    on delete restrict
);
alter table kb09e_fixture.early_denial_audit enable row level security;
revoke all on kb09e_fixture.early_denial_audit
  from public,anon,authenticated,service_role;

-- This function is intentionally kept PRIVATE inside a disposable fixture.
-- The service JWT role check is simulated by a local auth.jwt() test stub:
-- it is NOT a signed Supabase Auth acceptance claim.
--
-- Lock order matches the existing KB-06B withdrawal: JOB first, then consent.
-- We also lock current domain proof when evaluating ownership expiry. Old
-- leases, other tenants and restored consent/proof never authorize a cancel.
create function kb09e_fixture.abort_claimed_job_on_current_denial_v1(
  p_organization_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_reason text
)
returns jsonb language plpgsql security definer
set search_path = ''
as $abort$
declare
  v_job public.knowledge_discovery_jobs%rowtype;
  v_consent public.knowledge_discovery_site_consents%rowtype;
  v_proof public.knowledge_discovery_domain_verifications%rowtype;
  v_host text;
  v_at timestamptz:=clock_timestamp();
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'kb09e_service_role_required' using errcode='42501';
  end if;
  if p_organization_id is null or p_job_id is null
     or p_lease_token is null or p_reason is null
     or p_reason not in ('consent_not_active','ownership_proof_expired') then
    raise exception 'kb09e_invalid_denial_request' using errcode='22023';
  end if;

  select * into v_job from public.knowledge_discovery_jobs j
  where j.organization_id=p_organization_id and j.id=p_job_id
  for update;
  if not found or v_job.status<>'running'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_until is null or v_job.lease_until<=v_at then
    return jsonb_build_object('ok',false,'reason','inactive_or_stale_lease');
  end if;

  -- Do not use a hostname or "denied" flag supplied by an untrusted worker.
  -- Derive a canonical host from the job's stored HTTPS seed URL.
  v_host:=substring(v_job.seed_url from '^https://([a-z0-9.-]+)(/|$)');
  if v_host is null then
    return jsonb_build_object('ok',false,'reason','seed_not_canonical');
  end if;

  if p_reason='consent_not_active' then
    select * into v_consent from public.knowledge_discovery_site_consents c
    where c.organization_id=p_organization_id and c.hostname=v_host
    for share;
    if found and v_consent.status='granted'
       and v_consent.purpose='website_discovery_review_only'
       and v_consent.granted_at<=clock_timestamp()
       and v_consent.valid_until>clock_timestamp()
       and v_consent.withdrawn_at is null then
      return jsonb_build_object('ok',false,'reason','denial_not_current');
    end if;
  elsif p_reason='ownership_proof_expired' then
    select * into v_proof from public.knowledge_discovery_domain_verifications p
    where p.organization_id=p_organization_id and p.hostname=v_host
    for share;
    if found and v_proof.verified_at is not null
       and v_proof.verified_until is not null
       and v_proof.verified_at<=clock_timestamp()
       and v_proof.verified_until>clock_timestamp() then
      return jsonb_build_object('ok',false,'reason','denial_not_current');
    end if;
  end if;

  -- Current denial is supported by stored tenant records. CAS is still
  -- checked at UPDATE; no retry, requeue or attempts counter is modified.
  update public.knowledge_discovery_jobs j
  set status='cancelled',last_error_code=p_reason,
      lease_token=null,lease_until=null,finished_at=clock_timestamp()
  where j.organization_id=p_organization_id and j.id=p_job_id
    and j.status='running' and j.lease_token=p_lease_token
    and j.lease_until>clock_timestamp();
  if not found then
    return jsonb_build_object('ok',false,'reason','inactive_or_stale_lease');
  end if;

  -- Deliberate uniqueness or audit failure aborts the full transaction.
  -- The document/job status update cannot commit without its audit row.
  insert into kb09e_fixture.early_denial_audit(
    organization_id,job_id,lease_sha256,reason,prior_status,result_status
  ) values (
    p_organization_id,p_job_id,
    pg_catalog.encode(pg_catalog.sha256(
      pg_catalog.convert_to(p_lease_token::text,'UTF8')
    ),'hex'),
    p_reason,'running','cancelled'
  );

  return jsonb_build_object('ok',true,'status','cancelled',
    'reason',p_reason,'audit_recorded',true);
end;
$abort$;

revoke all on function kb09e_fixture.abort_claimed_job_on_current_denial_v1(
  uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function kb09e_fixture.abort_claimed_job_on_current_denial_v1(
  uuid,uuid,uuid,text) to service_role;
comment on function kb09e_fixture.abort_claimed_job_on_current_denial_v1(
  uuid,uuid,uuid,text) is
  'KB-09E LOCAL DISPOSABLE REHEARSAL ONLY. DO NOT APPLY OR CONNECT TO LIVE WORKER.';
