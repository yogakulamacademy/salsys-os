-- KB-09K: strict disposable SQL-only proof/consent write boundary.
-- NEVER APPLY AS A MIGRATION. Never run on a hosted Supabase project,
-- Recovery, Production, staging, any real tenant or shared dev database.
-- Requires the complete synthetic KB-01B/06A/06B/09F/G/H/I/J fixture.
do $kb09k_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('public.tenant_session_bindings') is null
    or to_regclass('auth.sessions') is null
    or to_regclass('public.organization_onboarding') is null
    or to_regclass('public.knowledge_discovery_domain_verifications') is null
    or to_regclass('public.knowledge_discovery_site_consents') is null
    or to_regclass('public.knowledge_discovery_consent_audit') is null
    or to_regclass('public.knowledge_discovery_consent_control') is null
    or to_regprocedure('public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)') is null
    or to_regprocedure('public.kb_discovery_consent_actor_v1(uuid)') is null
    or to_regnamespace('kb09k_fixture') is not null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null then
    raise exception 'KB09K_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb09k_guard$;

create schema kb09k_fixture;
revoke all on schema kb09k_fixture from public,anon,authenticated,service_role;
grant usage on schema kb09k_fixture to authenticated,service_role;

-- The only client-initiated proof writes are exact-session owner/admin
-- challenge issuance and rate-limited claim. Neither accepts a user or
-- session ID as an argument; the existing KB-06B helper is authoritative.
create function kb09k_fixture.issue_domain_challenge_for_current_admin_v1(
  p_organization_id uuid, p_hostname text, p_challenge_hash text
) returns timestamptz
language plpgsql volatile security definer set search_path=''
as $issue$
declare
  v_actor uuid;
  v_website text;
  v_host text;
  v_issued timestamptz;
  v_verified_until timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_expires timestamptz := v_now+interval '24 hours';
begin
  v_actor := public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb09k_session_or_actor_denied' using errcode='42501';
  end if;
  if p_hostname is null or length(p_hostname)>253
    or p_hostname !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'
    or exists(
      select 1 from pg_catalog.unnest(pg_catalog.string_to_array(p_hostname,'.')) as label(value)
      where length(value)>63 or value='' or value !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    )
    or p_challenge_hash is null or p_challenge_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'kb09k_invalid_domain_or_digest' using errcode='22023';
  end if;

  -- Retain the original tenant/host advisory serialization so the
  -- challenge issuance and any registry/proof mutation are serialized.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text||':'||p_hostname,20261106)
  );
  select o.website_url into v_website
    from public.organization_onboarding o
    where o.organization_id=p_organization_id for share;
  v_host:=substring(v_website from
    '^https://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(/|$)');
  if v_host is distinct from p_hostname then
    raise exception 'kb09k_configured_website_mismatch' using errcode='42501';
  end if;

  select d.issued_at,d.verified_until into v_issued,v_verified_until
    from public.knowledge_discovery_domain_verifications d
    where d.organization_id=p_organization_id and d.hostname=p_hostname
    for update;
  if v_verified_until>v_now then
    raise exception 'domain_already_verified' using errcode='P0001';
  end if;
  if v_issued>v_now-interval '5 minutes' then
    raise exception 'domain_challenge_cooldown' using errcode='P0001';
  end if;
  insert into public.knowledge_discovery_domain_verifications(
    organization_id,hostname,created_by,challenge_hash,issued_at,
    challenge_expires_at,verified_at,verified_until,last_check_at
  ) values (
    p_organization_id,p_hostname,v_actor,p_challenge_hash,v_now,
    v_expires,null,null,null
  )
  on conflict(organization_id,hostname) do update
  set created_by=excluded.created_by,
      challenge_hash=excluded.challenge_hash,
      issued_at=excluded.issued_at,
      challenge_expires_at=excluded.challenge_expires_at,
      verified_at=null,verified_until=null,last_check_at=null;
  return v_expires;
end;
$issue$;

create function kb09k_fixture.claim_proof_check_for_current_admin_v1(
  p_organization_id uuid,p_hostname text,p_challenge_hash text
) returns boolean
language plpgsql volatile security definer set search_path=''
as $claim$
declare
  v_actor uuid;
  v_updated uuid;
  v_site text;
  v_host text;
begin
  v_actor:=public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb09k_session_or_actor_denied' using errcode='42501';
  end if;
  if p_hostname is null or length(p_hostname)>253
    or p_hostname !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'
    or p_challenge_hash is null or p_challenge_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  select o.website_url into v_site
    from public.organization_onboarding o
    where o.organization_id=p_organization_id for share;
  v_host:=substring(v_site from
    '^https://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(/|$)');
  if v_host is distinct from p_hostname then
    return false;
  end if;
  update public.knowledge_discovery_domain_verifications d
     set last_check_at=pg_catalog.clock_timestamp()
   where d.organization_id=p_organization_id and d.hostname=p_hostname
     and d.challenge_hash=p_challenge_hash
     and d.challenge_expires_at>pg_catalog.clock_timestamp()
     and (d.last_check_at is null or
          d.last_check_at<=pg_catalog.clock_timestamp()-interval '30 seconds')
     and (d.verified_until is null or
          d.verified_until<=pg_catalog.clock_timestamp())
  returning d.id into v_updated;
  return v_updated is not null;
end;
$claim$;

-- The server MUST first fetch the public proof file, check robots, and
-- verify its contents against the stored challenge hash. Only THEN may its
-- dedicated privileged handler invoke this CAS. A tenant-authenticated
-- caller cannot finalize ownership without performing that external check.
-- A stolen service-role key is still a privileged threat: this is bounded
-- service authority, NOT DB-side attestation of the external web fetch.
create function kb09k_fixture.confirm_checked_domain_proof_v1(
  p_organization_id uuid,p_hostname text,p_challenge_hash text
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $complete$
declare
  v_site text;
  v_host text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_verified_until timestamptz := v_now+interval '30 days';
  v_updated uuid;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'kb09k_service_role_required' using errcode='42501';
  end if;
  if p_organization_id is null or p_hostname is null or
     p_hostname !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$' or
     length(p_hostname)>253 or
     p_challenge_hash is null or p_challenge_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'reason','invalid_proof_confirmation');
  end if;
  select o.website_url into v_site
    from public.organization_onboarding o
    where o.organization_id=p_organization_id for share;
  v_host:=substring(v_site from
    '^https://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(/|$)');
  if v_host is distinct from p_hostname then
    return jsonb_build_object('ok',false,'reason','configured_domain_mismatch');
  end if;
  -- The claim must be fresh (bounded by server's 30-second fetch handler).
  -- Exact tenant/host/hash challenge CAS; no custom expiry or arbitrary
  -- status may be supplied. Already-verified challenges cannot be replayed.
  update public.knowledge_discovery_domain_verifications d
     set verified_at=v_now,verified_until=v_verified_until
   where d.organization_id=p_organization_id and d.hostname=p_hostname
     and d.challenge_hash=p_challenge_hash
     and d.challenge_expires_at>pg_catalog.clock_timestamp()
     and d.last_check_at is not null
     and d.last_check_at<=pg_catalog.clock_timestamp()
     and d.last_check_at>=pg_catalog.clock_timestamp()-interval '2 minutes'
     and (d.verified_until is null or
          d.verified_until<=pg_catalog.clock_timestamp())
  returning d.id into v_updated;
  if v_updated is null then
    return jsonb_build_object('ok',false,'reason','challenge_changed_or_expired');
  end if;
  return jsonb_build_object('ok',true,'status','verified',
    'verified_until',v_verified_until);
end;
$complete$;

revoke all on function kb09k_fixture.issue_domain_challenge_for_current_admin_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function kb09k_fixture.issue_domain_challenge_for_current_admin_v1(uuid,text,text)
  to authenticated;
revoke all on function kb09k_fixture.claim_proof_check_for_current_admin_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function kb09k_fixture.claim_proof_check_for_current_admin_v1(uuid,text,text)
  to authenticated;
revoke all on function kb09k_fixture.confirm_checked_domain_proof_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function kb09k_fixture.confirm_checked_domain_proof_v1(uuid,text,text)
  to service_role;

-- Public-schema thin SECURITY INVOKER wrappers are the only API-facing RPCs.
create function public.issue_knowledge_discovery_challenge_for_admin_v1(
  p_organization_id uuid,p_hostname text,p_challenge_hash text
) returns timestamptz language sql volatile security invoker set search_path=''
as $bridge$
  select kb09k_fixture.issue_domain_challenge_for_current_admin_v1($1,$2,$3);
$bridge$;
revoke all on function public.issue_knowledge_discovery_challenge_for_admin_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.issue_knowledge_discovery_challenge_for_admin_v1(uuid,text,text)
  to authenticated;

create function public.claim_knowledge_discovery_proof_check_for_admin_v1(
  p_organization_id uuid,p_hostname text,p_challenge_hash text
) returns boolean language sql volatile security invoker set search_path=''
as $bridge$
  select kb09k_fixture.claim_proof_check_for_current_admin_v1($1,$2,$3);
$bridge$;
revoke all on function public.claim_knowledge_discovery_proof_check_for_admin_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_knowledge_discovery_proof_check_for_admin_v1(uuid,text,text)
  to authenticated;

create function public.confirm_checked_knowledge_discovery_proof_v1(
  p_organization_id uuid,p_hostname text,p_challenge_hash text
) returns jsonb language sql volatile security invoker set search_path=''
as $bridge$
  select kb09k_fixture.confirm_checked_domain_proof_v1($1,$2,$3);
$bridge$;
revoke all on function public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)
  to service_role;

-- Retire legacy service-only SECURITY INVOKER proof writers BEFORE removing
-- their direct table privileges. No new runtime API calls these functions.
revoke execute on function public.issue_knowledge_discovery_domain_challenge_v1(uuid,text,uuid,text)
  from public,anon,authenticated,service_role;
revoke execute on function public.claim_knowledge_discovery_proof_check_v1(uuid,text,text)
  from public,anon,authenticated,service_role;

-- An authenticated user must have the current KB-06B session binding even
-- to read proof metadata. A broad can_manage_organization check is not enough.
drop policy if exists knowledge_discovery_proof_admin_read
  on public.knowledge_discovery_domain_verifications;
create policy kb09k_proof_strict_session_read
  on public.knowledge_discovery_domain_verifications
  for select to authenticated
  using(public.kb_discovery_consent_actor_v1(organization_id) is not null);

-- Remaining direct service_role writes to proof, consent, policy control and
-- consent audit bypassed carefully scoped function checks. Cut these direct
-- DML routes ONLY INSIDE THE DISPOSABLE FIXTURE. SECURITY DEFINER consent
-- grant/withdrawal continues to operate as the function owner.
-- Truncate/trigger/references matter because prior GRANT ALL included them.
revoke insert,update,delete,truncate,trigger,references
  on public.knowledge_discovery_domain_verifications,
     public.knowledge_discovery_site_consents,
     public.knowledge_discovery_consent_control,
     public.knowledge_discovery_consent_audit
  from public,anon,authenticated,service_role;

comment on function public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)
  is 'KB-09K DISPOSABLE security rehearsal. NOT A MIGRATION or hosted proof attestation';
