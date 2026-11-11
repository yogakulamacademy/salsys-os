-- KB-09T: SYNTHETIC LOCAL DISPOSABLE POSTGRES ONLY; NOT A MIGRATION.
-- NEVER execute on Supabase Production, Recovery, staging, shared development,
-- any customer database, or a persistent environment.
--
-- A withdrawal must erase the associated synthetic excerpt bytes in the
-- SAME transaction, after the existing audited withdrawal obtains job and
-- consent row locks. A synthetic 60-second TTL models a bounded expiry
-- sweep but is NOT a legal or proposed production retention period.
-- No scheduler, real data, erasure promise for backups/logs or AI indexing.
begin;

do $kb09t_disposable_guard$
begin
  if current_database() !~ '^salsys_kb09f_[a-f0-9]{18}$'
     or to_regclass('public.test_knowledge_admins') is null
     or to_regclass('auth.sessions') is null
     or to_regclass('public.tenant_session_bindings') is null
     or to_regclass('public.knowledge_discovery_site_consents') is null
     or to_regclass('public.knowledge_discovery_consent_audit') is null
     or to_regclass('kb09s_fixture.page_evidence') is null
     or to_regprocedure('public.withdraw_knowledge_discovery_consent_v1(uuid,text,integer)') is null
     or to_regprocedure('public.commit_discovery_evidence_kb09s_rehearsal_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer,jsonb)') is null
     or to_regnamespace('kb09t_fixture') is not null
     or to_regclass('public.leads') is not null
     or to_regclass('public.contacts') is not null
  then
    raise exception 'KB09T_DISPOSABLE_PARENT_FIXTURE_REQUIRED' using errcode='42501';
  end if;
end;
$kb09t_disposable_guard$;

create schema kb09t_fixture;
revoke all on schema kb09t_fixture from public,anon,authenticated,service_role;
grant usage on schema kb09t_fixture to service_role;

-- This TTL is invented solely for local synthetic tests. Zero legal or
-- customer retention decisions are encoded here. Only DB owner sets dates
-- for tests; no application/browser/client can set or extend the deadline.
alter table kb09s_fixture.page_evidence
  add column ephemeral_expires_at timestamptz not null
    default (clock_timestamp() + interval '60 seconds');
alter table kb09s_fixture.page_evidence
  add constraint kb09t_fixture_ttl_upper_bound
    check (ephemeral_expires_at <= captured_at + interval '2 minutes');

-- Content-free, PRIVATE, appendix: NO URL, quote, hash, HTML, message or
-- freeform explanation. These IDs/timestamps are still personal metadata
-- in some circumstances; their final retention is NOT approved.
create table kb09t_fixture.erasure_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  page_id uuid not null unique,
  reason text not null
    check (reason in ('consent_withdrawn','synthetic_ttl_elapsed')),
  erased_at timestamptz not null default clock_timestamp()
);
alter table kb09t_fixture.erasure_receipts enable row level security;
revoke all on kb09t_fixture.erasure_receipts
  from public,anon,authenticated,service_role;

create function kb09t_fixture.refuse_receipt_mutation_v1()
returns trigger language plpgsql security invoker set search_path=''
as $immutable$
begin
  raise exception 'kb09t_erasure_receipt_append_only' using errcode='42501';
end;
$immutable$;
revoke execute on function kb09t_fixture.refuse_receipt_mutation_v1()
  from public,anon,authenticated,service_role;

create trigger kb09t_receipt_append_only
  before update or delete on kb09t_fixture.erasure_receipts
  for each row execute function kb09t_fixture.refuse_receipt_mutation_v1();

-- The EXISTING authenticated signed-session withdrawal RPC (KB-06B) holds
-- JOB lock then CONSENT lock and writes the auditable withdrawal and job
-- cancellation. This AFTER UPDATE trigger executes in that SAME transaction.
-- A worker that committed before withdrawal is erased; a later worker is
-- refused by the previously established proof/consent-checked RPC.
-- Failure of the receipt INSERT aborts the ENTIRE withdrawal transaction.
create function kb09t_fixture.erase_on_withdrawal_v1()
returns trigger language plpgsql volatile security definer set search_path=''
as $withdraw$
begin
  if tg_op='UPDATE' and old.status='granted'
     and new.status='withdrawn' and new.withdrawn_at is not null then
    with erased as (
      delete from kb09s_fixture.page_evidence e
      where e.organization_id=new.organization_id
        and substring(e.source_url from
          '^https://([a-z0-9][a-z0-9.-]*[.][a-z]{2,})(/|$)')=new.hostname
      returning e.organization_id,e.job_id,e.page_id
    )
    insert into kb09t_fixture.erasure_receipts(
      organization_id,job_id,page_id,reason
    )
    select e.organization_id,e.job_id,e.page_id,'consent_withdrawn'
    from erased e;
  end if;
  return new;
end;
$withdraw$;
revoke execute on function kb09t_fixture.erase_on_withdrawal_v1()
  from public,anon,authenticated,service_role;

create trigger kb09t_erase_evidence_on_consent_withdrawal
  after update of status,withdrawn_at
  on public.knowledge_discovery_site_consents
  for each row execute function kb09t_fixture.erase_on_withdrawal_v1();

-- A READ-FREE service-only maintenance RPC, NOT a scheduler. It performs
-- only a BOUNDED sweep of expired SYNTHETIC excerpts, with a receipt in the
-- same statement/transaction. An insert failure rolls back the erasure.
-- NO arbitrary tenant, host, deletion reason or new TTL accepted as input.
create function kb09t_fixture.purge_expired_synthetic_evidence_v1(
  p_batch_limit integer default 25
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $sweep$
declare
  v_removed integer := 0;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'kb09t_service_role_required' using errcode='42501';
  end if;
  if p_batch_limit is null or p_batch_limit not between 1 and 50 then
    raise exception 'kb09t_invalid_purge_batch' using errcode='22023';
  end if;

  with candidates as (
    select e.id from kb09s_fixture.page_evidence e
    where e.ephemeral_expires_at <= clock_timestamp()
    order by e.ephemeral_expires_at,e.id
    limit p_batch_limit
    for update of e skip locked
  ), erased as (
    delete from kb09s_fixture.page_evidence e
    using candidates c
    where e.id=c.id
    returning e.organization_id,e.job_id,e.page_id
  ), receipts as (
    insert into kb09t_fixture.erasure_receipts(
      organization_id,job_id,page_id,reason
    )
    select e.organization_id,e.job_id,e.page_id,'synthetic_ttl_elapsed'
    from erased e
    returning id
  )
  select count(*)::integer into v_removed from receipts;
  return jsonb_build_object('ok',true,'erased',v_removed,
    'scope','disposable_synthetic_expired_evidence_only');
end;
$sweep$;
revoke all on function kb09t_fixture.purge_expired_synthetic_evidence_v1(integer)
  from public,anon,authenticated,service_role;
grant execute on function kb09t_fixture.purge_expired_synthetic_evidence_v1(integer)
  to service_role;

create function public.kb09t_purge_expired_synthetic_evidence_v1(
  p_batch_limit integer default 25
) returns jsonb language sql volatile security invoker set search_path=''
as $bridge$
  select kb09t_fixture.purge_expired_synthetic_evidence_v1($1);
$bridge$;
revoke all on function public.kb09t_purge_expired_synthetic_evidence_v1(integer)
  from public,anon,authenticated,service_role;
grant execute on function public.kb09t_purge_expired_synthetic_evidence_v1(integer)
  to service_role;
comment on function public.kb09t_purge_expired_synthetic_evidence_v1(integer)
  is 'KB-09T disposable-only synthetic TTL test. NOT a migration or approved production retention';

commit;
