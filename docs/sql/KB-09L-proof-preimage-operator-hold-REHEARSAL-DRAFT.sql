-- KB-09L — 100% DISPOSABLE PostgreSQL proof preimage + operator hold.
-- THIS IS NOT A MIGRATION. NEVER run on Supabase Production, Recovery,
-- staging, a shared dev DB, or any real/customer tenant.
-- Requires the random, auto-dropped local KB-01B/06A/B/09F/G/H/I/J/K fixture.
do $kb09l_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('public.tenant_session_bindings') is null
    or to_regclass('auth.sessions') is null
    or to_regclass('public.knowledge_discovery_domain_verifications') is null
    or to_regclass('public.knowledge_discovery_consent_control') is null
    or to_regprocedure('public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)') is null
    or to_regprocedure('kb09k_fixture.confirm_checked_domain_proof_v1(uuid,text,text)') is null
    or to_regnamespace('kb09l_fixture') is not null
    or to_regprocedure('public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)') is not null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null then
    raise exception 'KB09L_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb09l_guard$;

begin;
create schema kb09l_fixture;
revoke all on schema kb09l_fixture from public,anon,authenticated,service_role;
grant usage on schema kb09l_fixture to service_role;

-- Retire exact hash-only authorizations: the hash already stored in the
-- database is NOT proof that the claimant has read the site's proof file.
revoke execute on function public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke execute on function kb09k_fixture.confirm_checked_domain_proof_v1(uuid,text,text)
  from public,anon,authenticated,service_role;

-- DB now requires the ORIGINAL 93-character cryptographic challenge token,
-- not the non-secret SHA-256 digest in stored proof metadata. A compromised
-- service key plus a read of proof metadata is no longer enough by itself.
-- The token still can be known to the issuing user; DB cannot attest the
-- token appeared at the configured website. The server must verify robots
-- and fetch the public file before calling this function.
create function kb09l_fixture.confirm_proof_preimage_v2(
  p_organization_id uuid,p_hostname text,p_proof_token text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $proof$
declare
  v_configured_url text;
  v_configured_host text;
  v_digest text;
  v_verified_until timestamptz;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'kb09l_service_required' using errcode='42501';
  end if;
  if p_organization_id is null or p_hostname is null
      or length(p_hostname)>253
      or p_hostname !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'
      or p_proof_token is null
      or p_proof_token !~ '^salsysos-domain-verification=[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok',false,'reason','invalid_proof_preimage');
  end if;
  v_digest:=pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p_proof_token,'UTF8')),'hex');

  -- Continue the earlier fixed lock order: website configuration first;
  -- proof row UPDATE obtains its row lock and sees concurrent replacements.
  select o.website_url into v_configured_url
    from public.organization_onboarding o
    where o.organization_id=p_organization_id for share;
  v_configured_host:=substring(v_configured_url from
    '^https://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(/|$)');
  if v_configured_host is distinct from p_hostname then
    return pg_catalog.jsonb_build_object('ok',false,'reason','configured_domain_mismatch');
  end if;

  -- The 5s guard band is only a best-effort margin against ordinary
  -- one-statement RPC delay. It does NOT enforce a physical COMMIT deadline
  -- against an outer caller-controlled BEGIN ... pg_sleep ... COMMIT.
  update public.knowledge_discovery_domain_verifications d
  set verified_at=pg_catalog.clock_timestamp(),
      verified_until=pg_catalog.clock_timestamp()+interval '30 days'
  where d.organization_id=p_organization_id
    and d.hostname=p_hostname
    and d.challenge_hash=v_digest
    and d.challenge_expires_at>pg_catalog.clock_timestamp()+interval '5 seconds'
    and d.last_check_at is not null
    and d.last_check_at<=pg_catalog.clock_timestamp()
    and d.last_check_at>=pg_catalog.clock_timestamp()-interval '2 minutes'
    and (d.verified_until is null or d.verified_until<=pg_catalog.clock_timestamp())
  returning d.verified_until into v_verified_until;
  if v_verified_until is null then
    return pg_catalog.jsonb_build_object('ok',false,'reason','challenge_changed_or_expired');
  end if;
  return pg_catalog.jsonb_build_object('ok',true,'status','verified',
    'verified_until',v_verified_until);
end;
$proof$;
revoke all on function kb09l_fixture.confirm_proof_preimage_v2(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function kb09l_fixture.confirm_proof_preimage_v2(uuid,text,text)
  to service_role;

create function public.confirm_checked_knowledge_discovery_proof_v2(
  p_organization_id uuid,p_hostname text,p_proof_token text
) returns jsonb language sql volatile security invoker set search_path=''
as $bridge$
  select kb09l_fixture.confirm_proof_preimage_v2($1,$2,$3);
$bridge$;
revoke all on function public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)
  to service_role;

comment on function public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)
  is 'KB-09L disposable-only preimage check; never a production or network-proof attestation';

-- PRIVATE, DBA-ONLY POLICY REVIEW RECEIPT SCHEMA.
-- This never enables consent grants and installs NO registration or approval
-- RPC, scheduler, client API, service-role writer or policy.
-- A reviewed policy requires independently signed security/privacy evidence
-- and an actual operator-controlled registration approved outside the app.
create table kb09l_fixture.policy_review_receipts(
  id uuid primary key default gen_random_uuid(),
  policy_version text not null unique check(length(btrim(policy_version)) between 1 and 100),
  exact_policy_text text not null
    check(octet_length(pg_catalog.convert_to(exact_policy_text,'UTF8')) between 40 and 16000),
  policy_sha256 text not null
    check(policy_sha256 ~ '^[a-f0-9]{64}$'
      and policy_sha256=pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(exact_policy_text,'UTF8')),'hex')),
  source_reference text not null check(length(btrim(source_reference)) between 1 and 500),
  security_reviewer text not null check(length(btrim(security_reviewer)) between 2 and 128),
  privacy_reviewer text not null check(length(btrim(privacy_reviewer)) between 2 and 128),
  security_evidence_ref text not null check(length(btrim(security_evidence_ref)) between 3 and 500),
  privacy_evidence_ref text not null check(length(btrim(privacy_evidence_ref)) between 3 and 500),
  recorded_at timestamptz not null default clock_timestamp(),
  constraint kb09l_independent_reviewers check(
    security_reviewer<>privacy_reviewer
    and security_evidence_ref<>privacy_evidence_ref
  )
);
alter table kb09l_fixture.policy_review_receipts enable row level security;
revoke all on kb09l_fixture.policy_review_receipts
  from public,anon,authenticated,service_role;
create trigger kb09l_policy_receipt_immutable
before update or delete on kb09l_fixture.policy_review_receipts
for each row execute function public.kb_discovery_consent_audit_immutable_v1();
create trigger kb09l_policy_receipt_no_truncate
before truncate on kb09l_fixture.policy_review_receipts
for each statement execute function public.kb_discovery_consent_audit_immutable_v1();

-- Intentionally leave the KB-06B approved-policy registry OFF in this
-- local rehearsal: a receipt is documentation, not a consent switch.
-- A DBA/manual operator path and independent legal approval are separate
-- release gates; no SQL in this file turns grants_enabled on.
commit;
