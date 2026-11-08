-- KB-11 / CONSENT-ATOMIC MANUAL DISCOVERY DRAFT
-- STRICTLY DISPOSABLE RANDOM LOCAL POSTGRES REHEARSAL. NOT A MIGRATION.
-- DO NOT APPLY TO ANY HOSTED/SHARED SUPABASE, STAGING, RECOVERY OR PRODUCTION.
-- No customer data, live crawling, consent activation, or policy authorization.
begin;

do $kb11_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
     or to_regclass('public.test_knowledge_admins') is null
     or to_regclass('auth.sessions') is null
     or to_regclass('public.tenant_session_bindings') is null
     or to_regclass('public.knowledge_discovery_pages') is null
     or to_regclass('public.knowledge_discovery_jobs') is null
     or to_regclass('public.knowledge_discovery_site_consents') is null
     or to_regclass('public.knowledge_discovery_consent_control') is null
     or to_regclass('public.knowledge_discovery_consent_audit') is null
     or to_regclass('public.knowledge_discovery_domain_verifications') is null
     or to_regprocedure('public.kb_discovery_consent_actor_v1(uuid)') is null
     or to_regprocedure('public.withdraw_knowledge_discovery_consent_v1(uuid,text,integer)') is null
     or to_regprocedure('public.commit_knowledge_discovery_page_with_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)') is null
     or to_regnamespace('kb11_fixture') is not null
     or to_regprocedure('public.create_discovery_review_draft_with_current_consent_v1(uuid,uuid,text,text,text)') is not null
     or to_regclass('public.leads') is not null
     or to_regclass('public.contacts') is not null
  then
    raise exception 'KB11_DISPOSABLE_PARENT_FIXTURE_REQUIRED' using errcode='42501';
  end if;
end;
$kb11_guard$;

-- These four structures are MINIMAL synthetic stand-ins for the production
-- Knowledge tables. They exist ONLY in the auto-dropped fixture to test the
-- ACTUAL existing source-backed document creation function below.
create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_type text not null,
  name text not null,
  source_uri text,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid
);
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_id uuid not null references public.knowledge_sources(id),
  title text not null,
  category text not null,
  content text not null,
  status text not null check(status in ('draft','approved')),
  valid_from timestamptz,
  valid_until timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb
);
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_id uuid not null references public.knowledge_documents(id),
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb
);
create table public.knowledge_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_id uuid not null references public.knowledge_documents(id),
  action text not null,
  reviewer_id uuid,
  note text
);
do $kb11_acl$
declare v_tab text;
begin
  foreach v_tab in array array[
    'knowledge_sources','knowledge_documents','knowledge_chunks','knowledge_approvals'
  ] loop
    execute format('alter table public.%I enable row level security',v_tab);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',v_tab);
  end loop;
end;
$kb11_acl$;
-- The real installed v2 source-backed function currently uses auth.role().
-- A disposable-only test stand-in matches the synthetic JWT supplied by CI.
create function auth.role() returns text language sql stable
set search_path='' as $role$
  select auth.jwt()->>'role'
$role$;
revoke all on function auth.role() from public,anon,service_role;
grant execute on function auth.role() to authenticated;

-- The test runner loads the BYTE-EXACT preexisting V2 production function
-- source after this fixture setup, before exercising the new wrapper. Its
-- authored source is never modified and its hosted implementation untouched.

create schema kb11_fixture;
revoke all on schema kb11_fixture from public,anon,authenticated,service_role;
grant usage on schema kb11_fixture to authenticated;

-- Security definer is necessary because direct authenticated DML on the
-- checked discovery tables has been revoked by the earlier fixtures. Only
-- this private, specific, strictly scoped path may invoke the original
-- generic V2 creation function; it never accepts a source URL or approval.
create function kb11_fixture.atomic_review_draft_v1(
  p_organization_id uuid,
  p_page_id uuid,
  p_title text,
  p_category text,
  p_content text
) returns jsonb
language plpgsql volatile security definer
set search_path=''
as $atomic$
declare
  v_actor uuid;
  v_website text;
  v_host text;
  v_job public.knowledge_discovery_jobs%rowtype;
  v_page public.knowledge_discovery_pages%rowtype;
  v_proof public.knowledge_discovery_domain_verifications%rowtype;
  v_consent public.knowledge_discovery_site_consents%rowtype;
  v_policy public.knowledge_discovery_consent_control%rowtype;
  v_audit_sha text;
  v_result jsonb;
  v_now timestamptz;
begin
  -- The auth JWT role is request-local, NOT a UI-submitted field.
  if auth.jwt()->>'role' is distinct from 'authenticated' then
    raise exception 'kb11_signed_owner_session_required' using errcode='42501';
  end if;
  v_actor:=public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb11_current_admin_session_denied' using errcode='42501';
  end if;
  if p_page_id is null or p_organization_id is null
     or p_title is null or length(btrim(p_title)) not between 2 and 180
     or p_content is null or length(btrim(p_content)) not between 10 and 20000
     or p_category is null or p_category not in (
       'general','faq','courses','pricing','batches','payments',
       'accommodation','travel','certification','recordings','refunds',
       'transfers','cancellation','online_course_rules','sales_scripts',
       'objection_handling','health_escalation','policy'
     ) then
    raise exception 'kb11_invalid_review_input' using errcode='22023';
  end if;

  -- Lock configured website first. The website must still match what the
  -- discovery runner fetched; a changed host is NOT inherited consent.
  select o.website_url into v_website
    from public.organization_onboarding o
   where o.organization_id=p_organization_id for share;
  v_host:=substring(v_website from
    '^https://([a-z0-9][a-z0-9.-]*[.][a-z]{2,})(/|$)');
  if v_host is null or v_website is distinct from 'https://' || v_host || '/' then
    return pg_catalog.jsonb_build_object('ok',false,'reason','configured_site_changed');
  end if;

  -- JOB BEFORE CONSENT order matches existing audited withdrawal lock order.
  select * into v_job from public.knowledge_discovery_jobs j
   where j.organization_id=p_organization_id
     and j.id=(select p.job_id from public.knowledge_discovery_pages p
                  where p.id=p_page_id and p.organization_id=p_organization_id)
   for share;
  if v_job.id is null
     or v_job.status not in ('completed','partial')
     or v_job.seed_url is distinct from v_website then
    return pg_catalog.jsonb_build_object('ok',false,'reason','no_terminal_tenant_job');
  end if;

  select * into v_page from public.knowledge_discovery_pages p
   where p.id=p_page_id and p.organization_id=p_organization_id
     and p.job_id=v_job.id
   for share;
  if v_page.id is null
    or v_page.status is distinct from 'fetched'
    or v_page.http_status is distinct from 200
    or v_page.url !~ '^https://[a-z0-9][a-z0-9.-]*[.][a-z]{2,}(/[^[:space:]#]*)?$'
    or substring(v_page.url from
      '^https://([a-z0-9][a-z0-9.-]*[.][a-z]{2,})(/|$)') is distinct from v_host
  then
    return pg_catalog.jsonb_build_object('ok',false,'reason','page_not_authorized');
  end if;

  -- Current proof is locked, so concurrent replacement cannot switch the
  -- hostname/verification state after the check and before draft insertion.
  select * into v_proof from public.knowledge_discovery_domain_verifications d
   where d.organization_id=p_organization_id and d.hostname=v_host
   for share;

  -- Same consent row locked by withdraw_knowledge_discovery_consent_v1.
  -- An already completed withdrawal denies this write. An in-flight
  -- withdrawal waits for this transaction or vice versa; never the old
  -- app-SELECT then unchecked generic V2 INSERT race.
  select * into v_consent from public.knowledge_discovery_site_consents c
   where c.organization_id=p_organization_id and c.hostname=v_host
   for share;
  select * into v_policy from public.knowledge_discovery_consent_control k
   where k.singleton=true for share;

  v_now:=pg_catalog.clock_timestamp();
  if v_proof.id is null or v_proof.verified_at is null
     or v_proof.verified_until is null
     or v_proof.verified_at>v_now or v_proof.verified_until<=v_now
     or v_consent.id is null
     or v_consent.status is distinct from 'granted'
     or v_consent.purpose is distinct from 'website_discovery_review_only'
     or v_consent.withdrawn_at is not null
     or v_consent.granted_at>v_now or v_consent.valid_until<=v_now
     or v_policy.singleton is null or v_policy.grants_enabled is distinct from true
     or v_policy.approved_at is null or v_policy.approved_at>v_now
     or v_consent.policy_version is distinct from v_policy.approved_policy_version
  then
    return pg_catalog.jsonb_build_object('ok',false,'reason','proof_consent_or_policy_not_current');
  end if;
  select a.policy_sha256 into v_audit_sha
    from public.knowledge_discovery_consent_audit a
   where a.consent_id=v_consent.id and a.organization_id=p_organization_id
     and a.hostname=v_host and a.action='granted'
     and a.revision=1 and a.policy_version=v_consent.policy_version;
  if v_audit_sha is null
     or v_audit_sha is distinct from v_policy.approved_policy_sha256 then
    return pg_catalog.jsonb_build_object('ok',false,'reason','consent_policy_audit_not_approved');
  end if;

  -- Reuse the real generic V2 function for the source, document and chunk,
  -- but with SOURCE METADATA DERIVED ONLY FROM LOCKED DB ROWS, fixed type,
  -- fixed p_approve=false, and no unsafe form-provided provenance fields.
  -- PL/pgSQL function calls participate in THIS SAME SQL transaction.
  v_result:=public.create_source_backed_knowledge_document_v2(
    p_organization_id=>p_organization_id,
    p_title=>btrim(p_title),p_category=>p_category,p_content=>btrim(p_content),
    p_source_name=>coalesce(nullif(btrim(v_page.page_title),''),
                            'Website page ' || v_page.id::text),
    p_source_type=>'website',p_source_uri=>v_page.url,
    p_valid_from=>null,p_valid_until=>null,p_approve=>false
  );
  if v_result->>'ok' is distinct from 'true'
     or v_result->>'status' is distinct from 'draft'
     or v_result->>'document_id' is null
     or v_result->>'source_id' is null then
    -- Raise, NOT return, or the generic source inserts would commit.
    raise exception 'kb11_unverified_generic_draft_receipt' using errcode='23514';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',true,'status','draft','organization_id',p_organization_id,
    'page_id',p_page_id,
    'document_id',v_result->>'document_id','source_id',v_result->>'source_id'
  );
end;
$atomic$;
revoke all on function kb11_fixture.atomic_review_draft_v1(
  uuid,uuid,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function kb11_fixture.atomic_review_draft_v1(
  uuid,uuid,text,text,text
) to authenticated;

-- Public exposed wrapper: SECURITY INVOKER; no privileged generic fallback.
create function public.create_discovery_review_draft_with_current_consent_v1(
  p_organization_id uuid,
  p_page_id uuid,
  p_title text,
  p_category text,
  p_content text
) returns jsonb language sql volatile security invoker set search_path=''
as $bridge$
  select kb11_fixture.atomic_review_draft_v1($1,$2,$3,$4,$5);
$bridge$;
revoke all on function public.create_discovery_review_draft_with_current_consent_v1(
  uuid,uuid,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.create_discovery_review_draft_with_current_consent_v1(
  uuid,uuid,text,text,text
) to authenticated;
comment on function public.create_discovery_review_draft_with_current_consent_v1(
  uuid,uuid,text,text,text
) is 'KB11 LOCAL AUTO-DROPPED SYNTHETIC RPC TEST ONLY. NOT A HOSTED MIGRATION.';
commit;
