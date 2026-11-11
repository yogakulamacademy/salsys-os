-- KB-06C: DRAFT, UNAPPLIED. Requires KB-01B, KB-06A and KB-06B in that order.
-- Explicit erasure of discovery JOB and PAGE METADATA for a *withdrawn* exact host.
-- NOT quotation/evidence retention or deletion; those are not implemented or approved.
-- Never apply to Production, Recovery Rehearsal or a live customer tenant.
begin;

create table public.knowledge_discovery_metadata_erasure_audit (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references public.knowledge_discovery_site_consents(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  hostname text not null,
  consent_revision integer not null check (consent_revision >= 2),
  actor_id uuid not null,
  session_id uuid not null,
  jobs_deleted integer not null check(jobs_deleted >= 0),
  pages_deleted integer not null check(pages_deleted >= 0),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (consent_id, consent_revision)
);
create index kb_discovery_erasure_org_time
  on public.knowledge_discovery_metadata_erasure_audit
  (organization_id, occurred_at desc);
alter table public.knowledge_discovery_metadata_erasure_audit enable row level security;
revoke all on public.knowledge_discovery_metadata_erasure_audit from public,anon,authenticated;
grant select on public.knowledge_discovery_metadata_erasure_audit to authenticated;
grant all on public.knowledge_discovery_metadata_erasure_audit to service_role;
create policy kb_discovery_erasure_strict_session_read
  on public.knowledge_discovery_metadata_erasure_audit
  for select to authenticated
  using(public.kb_discovery_consent_actor_v1(organization_id) is not null);
-- KB-06B's append-only trigger also prevents direct superuser UPDATE/DELETE.
create trigger kb_discovery_metadata_erasure_audit_immutable
before update or delete on public.knowledge_discovery_metadata_erasure_audit
for each row execute function public.kb_discovery_consent_audit_immutable_v1();

create or replace function public.erase_knowledge_discovery_metadata_v1(
  p_organization_id uuid,
  p_hostname text,
  p_expected_revision integer
) returns jsonb language plpgsql volatile security definer
set search_path=public,auth,pg_temp as $fn$
declare
  v_actor uuid;
  v_session uuid;
  v_consent public.knowledge_discovery_site_consents%rowtype;
  v_jobs integer := 0;
  v_pages integer := 0;
  v_active integer := 0;
begin
  -- No anonymous, employee, unbound, revoked or wrong-tenant sessions.
  v_actor := public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb_erasure_actor_or_session_denied' using errcode='42501';
  end if;
  if p_hostname is null or length(p_hostname)>253
    or p_hostname !~ '^[a-z0-9][a-z0-9.-]*[.][a-z]{2,}$'
    or p_expected_revision is null or p_expected_revision<2 then
    raise exception 'kb_erasure_invalid_exact_scope' using errcode='22023';
  end if;

  -- Lock order matches the worker page-commit and KB-06B withdrawal:
  -- all matching jobs BEFORE the consent row. This serializes in-flight
  -- page commits and means deletion cannot interleave a late result commit.
  perform j.id from public.knowledge_discovery_jobs j
  where j.organization_id=p_organization_id
    and substring(j.seed_url from '^https://([a-z0-9.-]+)(/|$)')=p_hostname
  order by j.id for update;

  select * into v_consent from public.knowledge_discovery_site_consents c
  where c.organization_id=p_organization_id and c.hostname=p_hostname
  for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','consent_missing');
  end if;
  if v_consent.revision<>p_expected_revision then
    return jsonb_build_object('ok',false,'reason','stale_revision');
  end if;
  if v_consent.status<>'withdrawn' or v_consent.withdrawn_at is null then
    return jsonb_build_object('ok',false,'reason','consent_not_withdrawn');
  end if;
  if not exists (
    select 1 from public.knowledge_discovery_consent_audit a
    where a.consent_id=v_consent.id and a.action='withdrawn'
      and a.revision=v_consent.revision
  ) then
    raise exception 'kb_erasure_withdrawal_audit_missing' using errcode='42501';
  end if;
  if exists (
    select 1 from public.knowledge_discovery_metadata_erasure_audit e
    where e.consent_id=v_consent.id and e.consent_revision=v_consent.revision
  ) then
    return jsonb_build_object('ok',false,'reason','already_erased');
  end if;

  select count(*)::integer into v_active
  from public.knowledge_discovery_jobs j
  where j.organization_id=p_organization_id
    and substring(j.seed_url from '^https://([a-z0-9.-]+)(/|$)')=p_hostname
    and j.status in ('queued','running');
  if v_active>0 then
    raise exception 'kb_erasure_active_jobs_require_withdrawal' using errcode='42501';
  end if;

  -- Only scoped discovery page/job rows. The consent and its immutable
  -- grant/withdrawal history remain to prevent unreviewed regrant.
  delete from public.knowledge_discovery_pages p
  using public.knowledge_discovery_jobs j
  where p.job_id=j.id and p.organization_id=j.organization_id
    and j.organization_id=p_organization_id
    and substring(j.seed_url from '^https://([a-z0-9.-]+)(/|$)')=p_hostname;
  get diagnostics v_pages=row_count;

  delete from public.knowledge_discovery_jobs j
  where j.organization_id=p_organization_id
    and substring(j.seed_url from '^https://([a-z0-9.-]+)(/|$)')=p_hostname;
  get diagnostics v_jobs=row_count;

  v_session := (auth.jwt()->>'session_id')::uuid;
  insert into public.knowledge_discovery_metadata_erasure_audit(
    consent_id,organization_id,hostname,consent_revision,actor_id,session_id,
    jobs_deleted,pages_deleted
  ) values(
    v_consent.id,p_organization_id,p_hostname,v_consent.revision,v_actor,
    v_session,v_jobs,v_pages
  );
  return jsonb_build_object('ok',true,'status','discovery_metadata_erased',
    'jobsDeleted',v_jobs,'pagesDeleted',v_pages);
end;
$fn$;
revoke all on function public.erase_knowledge_discovery_metadata_v1(
  uuid,text,integer
) from public,anon,authenticated,service_role;
grant execute on function public.erase_knowledge_discovery_metadata_v1(
  uuid,text,integer
) to authenticated;

commit;
