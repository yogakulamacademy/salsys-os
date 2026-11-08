-- KB-09S: DISPOSABLE PostgreSQL ONLY. THIS IS NOT A MIGRATION.
-- NEVER use on hosted Supabase, Production, Recovery, staging, shared dev,
-- customer data or any persistent existing database. Captured text is
-- entirely SYNTHETIC. No approved legal retention or processor policy exists.
--
-- A future migration MUST be separately authored and independently approved.
-- This rehearsal demonstrates: checked page outcome and bounded excerpt write
-- in ONE database statement/transaction; a failure in either rolls back both.
-- It does NOT prove actual browser-visible text or physical external COMMIT
-- time validity of ownership, nor authorize production evidence collection.
begin;

do $kb09s_disposable_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('auth.sessions') is null
    or to_regclass('public.tenant_session_bindings') is null
    or to_regclass('public.knowledge_discovery_jobs') is null
    or to_regclass('public.knowledge_discovery_pages') is null
    or to_regclass('public.knowledge_discovery_consent_control') is null
    or to_regnamespace('kb09h_fixture') is null
    or to_regprocedure('public.commit_knowledge_discovery_page_with_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)') is null
    or to_regprocedure('public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)') is null
    or to_regnamespace('kb09s_fixture') is not null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null
  then raise exception 'KB09S_DISPOSABLE_PARENT_FIXTURE_REQUIRED' using errcode='42501';
  end if;
end;
$kb09s_disposable_guard$;

create schema kb09s_fixture;
revoke all on schema kb09s_fixture from public,anon,authenticated,service_role;
grant usage on schema kb09s_fixture to service_role;

-- NOT part of public/hosted schema. The unapproved test-only quotes exist
-- only in a new randomly named local DB destroyed at the end of CI.
create table kb09s_fixture.page_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  page_id uuid not null unique,
  source_url text not null check (char_length(source_url) between 10 and 2048),
  fetched_at text not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  quotes jsonb not null check (
    jsonb_typeof(quotes)='array'
    and jsonb_array_length(quotes) between 1 and 16
    and octet_length(quotes::text)<=24000
  ),
  review_state text not null default 'unreviewed'
    check (review_state='unreviewed'),
  publish_eligible boolean not null default false check (not publish_eligible),
  captured_at timestamptz not null default clock_timestamp(),
  foreign key(job_id,organization_id)
    references public.knowledge_discovery_jobs(id,organization_id),
  foreign key(page_id)
    references public.knowledge_discovery_pages(id)
);
alter table kb09s_fixture.page_evidence enable row level security;
revoke all on kb09s_fixture.page_evidence from public,anon,authenticated,service_role;
-- No table policy, direct service_role DML, anon/tenant API or retention job.
-- All access to this private synthetic table is through its DB-owner function.

create function kb09s_fixture.commit_page_and_evidence_v1(
  p_organization_id uuid,
  p_job_id uuid,
  p_page_id uuid,
  p_lease_token uuid,
  p_page_status text,
  p_http_status integer,
  p_content_type text,
  p_page_title text,
  p_failure_code text,
  p_links jsonb,
  p_delay_seconds integer,
  p_evidence jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path=''
as $atomic$
declare
  v_stored_page public.knowledge_discovery_pages%rowtype;
  v_job public.knowledge_discovery_jobs%rowtype;
  v_result jsonb;
  v_keys text[];
  v_quote jsonb;
  v_quote_text text;
  v_source text;
  v_host text;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'kb09s_service_role_required' using errcode='42501';
  end if;
  if p_page_status is distinct from 'fetched' or p_http_status is distinct from 200
     or p_page_id is null or p_job_id is null or p_organization_id is null
     or p_lease_token is null or p_content_type !~* '^text/html([; ]|$)'
     or p_evidence is null or pg_catalog.jsonb_typeof(p_evidence) is distinct from 'object'
     or pg_catalog.octet_length(p_evidence::text)>30000 then
    raise exception 'kb09s_invalid_evidence_envelope' using errcode='22023';
  end if;

  select pg_catalog.array_agg(key order by key) into v_keys
    from pg_catalog.jsonb_object_keys(p_evidence) as key;
  if v_keys is distinct from array['fetched_at','quotes','snapshot_sha256','source_url'] then
    raise exception 'kb09s_unexpected_evidence_fields' using errcode='22023';
  end if;
  v_source:=p_evidence->>'source_url';
  if v_source is null or pg_catalog.char_length(v_source)>2048
     or p_evidence->>'snapshot_sha256' !~ '^[a-f0-9]{64}$'
     or p_evidence->>'fetched_at' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{3})?Z$'
     or pg_catalog.jsonb_typeof(p_evidence->'quotes') is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_evidence->'quotes') not between 1 and 16 then
    raise exception 'kb09s_invalid_evidence_fields' using errcode='22023';
  end if;

  for v_quote in select value from pg_catalog.jsonb_array_elements(p_evidence->'quotes')
  loop
    if pg_catalog.jsonb_typeof(v_quote) is distinct from 'object' then
      raise exception 'kb09s_invalid_quote_shape' using errcode='22023';
    end if;
    select pg_catalog.array_agg(key order by key) into v_keys
      from pg_catalog.jsonb_object_keys(v_quote) as key;
    if v_keys is distinct from array['block_id','exact_quote','quote_sha256'] then
      raise exception 'kb09s_invalid_quote_keys' using errcode='22023';
    end if;
    v_quote_text:=v_quote->>'exact_quote';
    if v_quote_text is null or pg_catalog.char_length(v_quote_text) not between 2 and 1400
       or v_quote->>'block_id' !~ '^[a-f0-9]{64}$'
       or v_quote->>'quote_sha256' is distinct from
          pg_catalog.encode(pg_catalog.sha256(
            pg_catalog.convert_to(v_quote_text,'UTF8')),'hex') then
      raise exception 'kb09s_quote_integrity_rejected' using errcode='22023';
    end if;
  end loop;

  -- Read the actual stored page/job. The service-supplied URL cannot choose
  -- a different tenant, site, URL or job. The checked original RPC below
  -- rechecks the CURRENT proof and site consent under its established locks.
  select * into v_stored_page
    from public.knowledge_discovery_pages p
    where p.id=p_page_id and p.job_id=p_job_id and p.organization_id=p_organization_id
    for share;
  select * into v_job
    from public.knowledge_discovery_jobs j
    where j.id=p_job_id and j.organization_id=p_organization_id;
  v_host:=substring(v_job.seed_url from
    '^https://([a-z0-9][a-z0-9.-]*[.][a-z]{2,})(/|$)');
  if v_stored_page.id is null or v_job.id is null or v_host is null
     or v_stored_page.url is distinct from v_source
     or substring(v_source from
       '^https://([a-z0-9][a-z0-9.-]*[.][a-z]{2,})(/|$)') is distinct from v_host then
    return pg_catalog.jsonb_build_object('ok',false,'reason','source_outside_current_tenant_page');
  end if;

  -- Atomic boundary: no separate page-write followed by evidence-write.
  select public.commit_knowledge_discovery_page_with_proof_v1(
    p_organization_id,p_job_id,p_page_id,p_lease_token,
    p_page_status,p_http_status,p_content_type,p_page_title,
    p_failure_code,p_links,p_delay_seconds
  ) into v_result;
  if v_result->>'ok' is distinct from 'true' then
    return pg_catalog.coalesce(v_result,
      pg_catalog.jsonb_build_object('ok',false,'reason','checked_commit_denied'));
  end if;

  -- A violation here raises and rolls back the earlier page/job commit too.
  -- This synthetic table has no legal authority to exist in hosted systems.
  insert into kb09s_fixture.page_evidence(
    organization_id,job_id,page_id,source_url,fetched_at,snapshot_sha256,quotes
  ) values(
    p_organization_id,p_job_id,p_page_id,v_source,
    p_evidence->>'fetched_at',p_evidence->>'snapshot_sha256',p_evidence->'quotes'
  );
  return pg_catalog.jsonb_build_object('ok',true,'status','fetched_with_unreviewed_evidence',
    'evidence_recorded',true,'snapshot_sha256',p_evidence->>'snapshot_sha256');
end;
$atomic$;

revoke all on function kb09s_fixture.commit_page_and_evidence_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer,jsonb
) from public,anon,authenticated,service_role;
grant execute on function kb09s_fixture.commit_page_and_evidence_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer,jsonb
) to service_role;

-- PostgREST rehearsal name is deliberately distinct from the existing
-- public production adapter and NEVER referenced by live application code.
create function public.commit_discovery_evidence_kb09s_rehearsal_v1(
  p_organization_id uuid,
  p_job_id uuid,
  p_page_id uuid,
  p_lease_token uuid,
  p_page_status text,
  p_http_status integer,
  p_content_type text,
  p_page_title text,
  p_failure_code text,
  p_links jsonb,
  p_delay_seconds integer,
  p_evidence jsonb
) returns jsonb language sql volatile security invoker set search_path=''
as $bridge$
  select kb09s_fixture.commit_page_and_evidence_v1(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
  );
$bridge$;
revoke all on function public.commit_discovery_evidence_kb09s_rehearsal_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.commit_discovery_evidence_kb09s_rehearsal_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer,jsonb
) to service_role;
comment on function public.commit_discovery_evidence_kb09s_rehearsal_v1(
  uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer,jsonb
) is 'KB-09S LOCAL AUTO-DROPPED SYNTHETIC FIXTURE ONLY. NO HOSTED MIGRATION AUTHORIZATION';
commit;
