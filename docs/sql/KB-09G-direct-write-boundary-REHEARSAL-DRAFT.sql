-- KB-09G: DISPOSABLE ONLY privilege and direct-write bypass rehearsal.
-- NOT A MIGRATION. NEVER apply to hosted Supabase, Production, Recovery,
-- staging, real customer/tenant databases, or a normal development database.
-- Requires the exact KB-01B/KB-06A/KB-06B/KB-09F synthetic localhost fixture.
-- Warning: revoking JOB UPDATE would break the existing website discovery
-- API's direct cancellation/seed-failure update; DO NOT deploy this pattern
-- without a replacement tenant-authorized RPC and independent DBA review.
do $kb09g_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
    or to_regclass('public.test_knowledge_admins') is null
    or to_regclass('public.knowledge_discovery_jobs') is null
    or to_regclass('public.knowledge_discovery_pages') is null
    or to_regclass('public.knowledge_discovery_site_consents') is null
    or to_regclass('public.knowledge_discovery_domain_verifications') is null
    or to_regprocedure('kb09f_fixture.commit_page_with_current_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)') is null
    or to_regnamespace('kb09g_fixture') is not null
    or to_regclass('public.leads') is not null
    or to_regclass('public.contacts') is not null then
    raise exception 'KB09G_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb09g_guard$;

create schema kb09g_fixture;
revoke all on schema kb09g_fixture from public,anon,authenticated,service_role;

-- Only in this test DB: service_role has BYPASSRLS in actual Supabase.
-- RLS alone would not prevent a privileged direct SQL mutation. Remove
-- write permissions instead; the existing SECURITY DEFINER commit/claim
-- functions continue to operate as their owner (postgres).
--
-- Keep SELECT and INSERT to reproduce today's create/seed API calls.
-- Remove TRUNCATE and TRIGGER as well: GRANT ALL includes these powers.
revoke update,delete,truncate,trigger
  on public.knowledge_discovery_jobs from public,anon,authenticated,service_role;
revoke update,delete,truncate,trigger
  on public.knowledge_discovery_pages from public,anon,authenticated,service_role;

-- Because the existing API inserts seed pages and jobs DIRECTLY with the
-- service client, do not revoke INSERT here. Instead reject obvious
-- finished/forged-state inserts under a narrow fixture-only trigger. This
-- does NOT prevent inserting bogus discovered links, and does NOT enforce
-- current tenant ownership on the privileged service client.
create function kb09g_fixture.guard_new_discovery_job_v1()
returns trigger language plpgsql security invoker set search_path=''
as $kb09g_job$
begin
  if new.status is distinct from 'queued'
    or new.lease_token is not null or new.lease_until is not null
    or new.started_at is not null or new.finished_at is not null
    or new.last_error_code is not null
    or new.attempts<>0 or new.pages_discovered<>0
    or new.pages_fetched<>0 or new.pages_blocked<>0
    or new.pages_failed<>0 or new.pages_skipped<>0
    or new.seed_url !~ '^https://[a-z0-9][a-z0-9.-]*[.][a-z]{2,}(/|$)' then
    raise exception 'kb09g_forged_job_insert_denied' using errcode='42501';
  end if;
  return new;
end;
$kb09g_job$;

create function kb09g_fixture.guard_new_discovery_page_v1()
returns trigger language plpgsql security invoker set search_path=''
as $kb09g_page$
begin
  if new.status is distinct from 'discovered'
    or new.http_status is not null or new.content_type is not null
    or new.page_title is not null or new.failure_code is not null
    or new.processed_at is not null then
    raise exception 'kb09g_forged_page_insert_denied' using errcode='42501';
  end if;
  return new;
end;
$kb09g_page$;

revoke all on function kb09g_fixture.guard_new_discovery_job_v1()
  from public,anon,authenticated,service_role;
revoke all on function kb09g_fixture.guard_new_discovery_page_v1()
  from public,anon,authenticated,service_role;

create trigger kb09g_guard_new_job
before insert on public.knowledge_discovery_jobs
for each row execute function kb09g_fixture.guard_new_discovery_job_v1();
create trigger kb09g_guard_new_page
before insert on public.knowledge_discovery_pages
for each row execute function kb09g_fixture.guard_new_discovery_page_v1();

comment on function kb09g_fixture.guard_new_discovery_job_v1() is
  'KB-09G LOCAL, DISPOSABLE, NOT A MIGRATION OR PRODUCTION SECURITY CONTROL';
comment on function kb09g_fixture.guard_new_discovery_page_v1() is
  'KB-09G LOCAL, DISPOSABLE, NOT A MIGRATION OR PRODUCTION SECURITY CONTROL';
