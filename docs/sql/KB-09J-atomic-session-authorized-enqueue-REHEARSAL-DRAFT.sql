-- KB-09J: disposable PostgreSQL tenant-bound atomic enqueue rehearsal.
-- NOT A MIGRATION. NEVER run on hosted Supabase, Production, Recovery,
-- staging, customer tenants or a shared development database.
-- Parent: KB-09I; requires synthetic KB-01B/06A/06B/09F/09G/09H/09I.
do $kb09j_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('public.organization_onboarding') is null
    or to_regclass('public.tenant_session_bindings') is null
    or to_regclass('auth.sessions') is null
    or to_regclass('public.knowledge_discovery_jobs') is null
    or to_regclass('public.knowledge_discovery_pages') is null
    or to_regclass('public.knowledge_discovery_domain_verifications') is null
    or to_regclass('public.knowledge_discovery_site_consents') is null
    or to_regprocedure('public.cancel_knowledge_discovery_job_v1(uuid,uuid)') is null
    or to_regnamespace('kb09j_fixture') is not null
    or to_regprocedure('public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)') is not null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null then
    raise exception 'KB09J_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb09j_guard$;

create schema kb09j_fixture;
revoke all on schema kb09j_fixture from public,anon,authenticated,service_role;
grant usage on schema kb09j_fixture to authenticated;

-- Strictly synthetic SECURITY DEFINER helper, not an exposed public API.
-- It obtains the actor ONLY from the existing KB-06B authenticated session
-- helper: current auth.sessions + tenant-session binding + active owner/admin.
-- The caller cannot supply created_by, session_id, job_id, status, or page.
create function kb09j_fixture.enqueue_job_with_seed_v1(
  p_organization_id uuid,
  p_seed_url text,
  p_max_pages integer
) returns jsonb language plpgsql volatile security definer set search_path=''
as $enqueue$
declare
  v_actor uuid;
  v_host text;
  v_configured_website text;
  v_configured_host text;
  v_proof public.knowledge_discovery_domain_verifications%rowtype;
  v_consent public.knowledge_discovery_site_consents%rowtype;
  v_job uuid;
begin
  v_actor := public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb09j_current_actor_or_session_denied' using errcode='42501';
  end if;
  if p_organization_id is null or p_max_pages is null
      or p_max_pages not between 1 and 50
      or p_seed_url is null or length(p_seed_url) > 2048 then
    return jsonb_build_object('ok',false,'reason','invalid_scan_request');
  end if;

  -- Root-only canonical HTTPS, no port, credentials, extra path or query.
  -- The caller cannot ask to seed a second host or alternative origin.
  v_host := substring(p_seed_url from
    '^https://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/$');
  if v_host is null
     or p_seed_url is distinct from 'https://' || v_host || '/'
     or exists (
       select 1 from unnest(string_to_array(v_host,'.')) as label(value)
       where length(value)>63 or value='' or value !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     ) then
    return jsonb_build_object('ok',false,'reason','invalid_scan_request');
  end if;

  -- Use the same per-tenant advisory serialization key as the existing
  -- KB-01B scan rate trigger. It remains the DB's rate-limit authority.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text,20261106)
  );

  -- READ CURRENT CONFIGURATION in this transaction, not just a stale
  -- application-level check. No forged configured domain argument.
  select o.website_url into v_configured_website
    from public.organization_onboarding o
    where o.organization_id = p_organization_id
    for share;
  v_configured_host := substring(v_configured_website from
    '^https://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(/|$)');
  if v_configured_host is distinct from v_host then
    return jsonb_build_object('ok',false,'reason','configured_domain_mismatch');
  end if;

  -- Proof and consent locks interlock with concurrent revoke/update.
  -- The expected lock order is configured site -> PROOF -> CONSENT -> inserts.
  select * into v_proof
    from public.knowledge_discovery_domain_verifications d
    where d.organization_id = p_organization_id and d.hostname = v_host
    for share;
  if not found or v_proof.verified_at is null or v_proof.verified_until is null
    or v_proof.verified_at > pg_catalog.clock_timestamp()
    or v_proof.verified_until <= pg_catalog.clock_timestamp() then
    return jsonb_build_object('ok',false,'reason','ownership_proof_not_current');
  end if;

  select * into v_consent
    from public.knowledge_discovery_site_consents c
    where c.organization_id = p_organization_id and c.hostname = v_host
    for share;
  if not found or v_consent.purpose <> 'website_discovery_review_only'
    or v_consent.status <> 'granted' or v_consent.withdrawn_at is not null
    or v_consent.granted_at > pg_catalog.clock_timestamp()
    or v_consent.valid_until <= pg_catalog.clock_timestamp() then
    return jsonb_build_object('ok',false,'reason','consent_not_active');
  end if;

  -- Single PostgREST statement/transaction. A failed seed INSERT aborts
  -- the job INSERT automatically, leaving no orphan queued scan.
  -- Unique active-job / cooldown / daily-rate constraints are preserved.
  insert into public.knowledge_discovery_jobs (
    organization_id,created_by,seed_url,max_pages,status
  ) values (
    p_organization_id,v_actor,p_seed_url,p_max_pages,'queued'
  ) returning id into v_job;

  insert into public.knowledge_discovery_pages (
    organization_id,job_id,url,depth,status
  ) values (
    p_organization_id,v_job,p_seed_url,0,'discovered'
  );

  -- Expiry while executing must abort both writes, not return a success.
  -- This does NOT solve proof expiry before a caller's external COMMIT.
  if v_proof.verified_until <= pg_catalog.clock_timestamp()
    or v_consent.valid_until <= pg_catalog.clock_timestamp() then
    raise exception 'kb09j_proof_or_consent_expired_during_enqueue'
      using errcode='P0001';
  end if;

  return jsonb_build_object(
    'ok',true,'job_id',v_job,'status','queued','seed_inserted',true
  );
end;
$enqueue$;

revoke all on function kb09j_fixture.enqueue_job_with_seed_v1(uuid,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function kb09j_fixture.enqueue_job_with_seed_v1(uuid,text,integer)
  to authenticated;

-- Public schema acts only as the PostgREST entry point, SECURITY INVOKER.
create function public.enqueue_knowledge_discovery_job_v1(
  p_organization_id uuid,
  p_seed_url text,
  p_max_pages integer
) returns jsonb language sql volatile security invoker set search_path=''
as $bridge$
  select kb09j_fixture.enqueue_job_with_seed_v1($1,$2,$3);
$bridge$;
revoke all on function public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)
  to authenticated;

-- Removes the legacy service-role direct INSERT bypass in this disposable
-- fixture, while the owner-owned claim/page-commit RPCs still operate.
-- Do NOT take these grants to any hosted system without independent review
-- of ALL other service-role table writers and migration sequencing.
revoke insert on public.knowledge_discovery_jobs,public.knowledge_discovery_pages
  from public,anon,authenticated,service_role;

comment on function public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)
  is 'KB-09J disposable-only session-authorized atomic enqueue. NOT A MIGRATION';
