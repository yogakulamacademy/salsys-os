-- KB-11A: CONSENT-ATOMIC DISCOVERED-PAGE DRAFT REHEARSAL.
-- NOT A MIGRATION. NEVER EXECUTE ON ANY HOSTED DATABASE.
-- Only the random, auto-dropped, localhost synthetic PostgreSQL test database.
-- This is an independently reviewable candidate, NOT deployment authorization.
do $kb11_guard$
begin
  if current_database() !~ '^salsys_kb11a_[a-f0-9]{18}$'
     or to_regclass('public.test_knowledge_admins') is null
     or to_regclass('public.organization_onboarding') is null
     or to_regclass('public.knowledge_discovery_consent_audit') is null
     or to_regclass('public.knowledge_sources') is null
     or to_regclass('public.knowledge_documents') is null
     or to_regclass('public.knowledge_chunks') is null
     or to_regclass('auth.sessions') is null
     or to_regclass('public.leads') is not null
     or to_regclass('public.contacts') is not null then
    raise exception 'KB11A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED';
  end if;
end;
$kb11_guard$;

-- SECURITY DEFINER is deliberate: authenticated has no direct knowledge
-- table write permissions. Must be independently reviewed against actual
-- deployed RLS, ownership, grants and tenant binding before any migration.
create function public.create_discovery_review_draft_with_current_consent_v1(
  p_organization_id uuid,
  p_page_id uuid,
  p_title text,
  p_category text,
  p_content text
) returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $kb11_atomic$
declare
  v_actor uuid;
  v_configured text;
  v_host text;
  v_job_id uuid;
  v_job public.knowledge_discovery_jobs%rowtype;
  v_page public.knowledge_discovery_pages%rowtype;
  v_proof public.knowledge_discovery_domain_verifications%rowtype;
  v_consent public.knowledge_discovery_site_consents%rowtype;
  v_approved_policy public.knowledge_discovery_consent_control%rowtype;
  v_grant_hash text;
  v_source_id uuid;
  v_document_id uuid;
  v_now timestamptz;
  v_title text := btrim(coalesce(p_title,''));
  v_content text := btrim(coalesce(p_content,''));
begin
  -- This is NOT the generic source-backed creator. No service-role bypass,
  -- caller-controlled URL, caller-controlled consent, or approval parameter.
  v_actor := public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null or p_page_id is null then
    raise exception 'kb_discovery_draft_denied' using errcode='42501';
  end if;
  if length(v_title) not between 2 and 180
     or length(v_content) not between 10 and 20000
     or p_category is null or p_category not in (
      'general','faq','courses','pricing','batches','payments',
      'accommodation','travel','certification','recordings','refunds',
      'transfers','cancellation','online_course_rules','sales_scripts',
      'objection_handling','health_escalation','policy') then
    raise exception 'kb_discovery_draft_invalid_input' using errcode='22023';
  end if;

  -- Re-read configured business website inside this same transaction; no URL
  -- from the caller. Only an explicit HTTPS hostname is eligible.
  select o.website_url into v_configured
    from public.organization_onboarding o
    where o.organization_id=p_organization_id for share;
  v_host := substring(v_configured from
    '^https://([a-z0-9][a-z0-9.-]*[.][a-z]{2,})(/|$)');
  if v_host is null or v_configured !~ '^https://[a-z0-9][a-z0-9.-]*[.][a-z]{2,}(/|$)'
     or length(v_host) > 253 then
    raise exception 'kb_discovery_draft_invalid_website' using errcode='42501';
  end if;

  -- Read page ID only as a lookup hint; lock JOB before consent to match the
  -- audited withdrawal sequence (the withdrawal may skip terminal jobs, so
  -- the consent-row lock below is still mandatory).
  select p.job_id into v_job_id from public.knowledge_discovery_pages p
    where p.id=p_page_id and p.organization_id=p_organization_id;
  if v_job_id is null then
    raise exception 'kb_discovery_draft_page_denied' using errcode='42501';
  end if;
  select * into v_job from public.knowledge_discovery_jobs j
    where j.id=v_job_id and j.organization_id=p_organization_id for share;
  if not found or v_job.status not in ('completed','partial')
     or v_job.seed_url is distinct from 'https://' || v_host || '/' then
    raise exception 'kb_discovery_draft_job_denied' using errcode='42501';
  end if;
  select * into v_page from public.knowledge_discovery_pages p
    where p.id=p_page_id and p.job_id=v_job.id
      and p.organization_id=p_organization_id for share;
  if not found or v_page.status <> 'fetched' or v_page.http_status <> 200
     or v_page.url is null
     or v_page.url not like ('https://' || v_host || '/%')
     or split_part(lower(coalesce(v_page.content_type,'')),';',1)
        not in ('text/html','application/xhtml+xml') then
    raise exception 'kb_discovery_draft_source_denied' using errcode='42501';
  end if;

  -- Lock active proof and approved policy before consent. These are *current*
  -- local SQL checks, NOT a promise about physical COMMIT after expiry.
  select * into v_proof from public.knowledge_discovery_domain_verifications d
    where d.organization_id=p_organization_id and d.hostname=v_host for share;
  v_now := pg_catalog.clock_timestamp();
  if not found or v_proof.verified_at is null
     or v_proof.verified_at > v_now
     or v_proof.verified_until is null or v_proof.verified_until <= v_now then
    raise exception 'kb_discovery_draft_proof_denied' using errcode='42501';
  end if;

  select * into v_approved_policy from public.knowledge_discovery_consent_control pc
    where pc.singleton=true for share;
  if not found or v_approved_policy.grants_enabled is distinct from true
     or v_approved_policy.approved_policy_version is null
     or v_approved_policy.approved_policy_sha256 !~ '^[0-9a-f]{64}$'
     or v_approved_policy.approved_at is null
     or v_approved_policy.approved_at > v_now then
    raise exception 'kb_discovery_draft_policy_denied' using errcode='42501';
  end if;

  select * into v_consent from public.knowledge_discovery_site_consents c
    where c.organization_id=p_organization_id and c.hostname=v_host for share;
  if not found or v_consent.purpose <> 'website_discovery_review_only'
     or v_consent.status <> 'granted' or v_consent.withdrawn_at is not null
     or v_consent.granted_at > v_now or v_consent.valid_until <= v_now
     or v_consent.policy_version is distinct from
        v_approved_policy.approved_policy_version then
    raise exception 'kb_discovery_draft_consent_denied' using errcode='42501';
  end if;
  select a.policy_sha256 into v_grant_hash
    from public.knowledge_discovery_consent_audit a
    where a.consent_id=v_consent.id and a.revision=1 and a.action='granted';
  if v_grant_hash is distinct from v_approved_policy.approved_policy_sha256 then
    raise exception 'kb_discovery_draft_policy_hash_denied' using errcode='42501';
  end if;

  -- One SQL function call = one transaction of source + document + chunk.
  -- The manually typed text is explicitly marked UNVERIFIED; this function
  -- does not fetch pages, approve knowledge, or make a new consent grant.
  insert into public.knowledge_sources(
    organization_id,source_type,name,source_uri,status,metadata,created_by
  ) values (
    p_organization_id,'website',left(coalesce(nullif(v_page.page_title,''),v_host),240),
    v_page.url,'active',
    pg_catalog.jsonb_build_object(
      'entry_mode','discovery_manual_review','discovery_page_id',v_page.id,
      'discovery_job_id',v_job.id,'consent_id',v_consent.id,
      'consent_revision',v_consent.revision,'source_text_verified',false),
    v_actor
  ) returning id into v_source_id;

  insert into public.knowledge_documents(
    organization_id,source_id,title,category,content,status,
    created_by,metadata
  ) values (
    p_organization_id,v_source_id,v_title,p_category,v_content,'draft',
    v_actor,pg_catalog.jsonb_build_object(
      'entry_mode','discovery_manual_review','discovery_page_id',v_page.id,
      'consent_id',v_consent.id,'manual_review_required',true,
      'source_text_verified',false)
  ) returning id into v_document_id;

  insert into public.knowledge_chunks(
    organization_id,document_id,chunk_index,content,metadata
  ) values (
    p_organization_id,v_document_id,0,v_content,
    '{"source":"manual_discovery_draft_unverified"}'::jsonb
  );

  v_now:=pg_catalog.clock_timestamp();
  if v_proof.verified_until <= v_now or v_consent.valid_until <= v_now then
    raise exception 'kb_discovery_draft_expired_before_return' using errcode='42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,'status','draft','organization_id',p_organization_id,
    'page_id',p_page_id,'document_id',v_document_id,'source_id',v_source_id
  );
end;
$kb11_atomic$;

revoke all on function public.create_discovery_review_draft_with_current_consent_v1(
  uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_discovery_review_draft_with_current_consent_v1(
  uuid,uuid,text,text,text) to authenticated;

comment on function public.create_discovery_review_draft_with_current_consent_v1(
  uuid,uuid,text,text,text) is
  'KB-11A disposable-only reviewed draft candidate; never deployed. Authoritative retention, deletion and COMMIT-expiry policy remain unapproved.';
