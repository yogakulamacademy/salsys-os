-- KB-06B: DRAFT, UNAPPLIED. Requires KB-01B and KB-06A draft SQL.
-- Consent change RPCs are disabled until a separate operator reviews
-- the exact policy text/digest and explicitly enables the registry.
-- Never apply to production, recovery, or a tenant with real data.
begin;

alter table public.knowledge_discovery_site_consents
  add column revision integer not null default 1 check (revision between 1 and 2147483647);

create table public.knowledge_discovery_consent_control (
  singleton boolean primary key default true check(singleton),
  grants_enabled boolean not null default false,
  approved_policy_version text,
  approved_policy_sha256 text,
  approved_at timestamptz,
  constraint kb_consent_approved_policy_check check (
    (grants_enabled=false) or (
      length(btrim(approved_policy_version)) between 1 and 100 and
      approved_policy_sha256 ~ '^[0-9a-f]{64}$' and
      approved_at is not null
    )
  )
);
insert into public.knowledge_discovery_consent_control(singleton,grants_enabled)
values(true,false);
alter table public.knowledge_discovery_consent_control enable row level security;
revoke all on public.knowledge_discovery_consent_control from public,anon,authenticated;
grant all on public.knowledge_discovery_consent_control to service_role;

create table public.knowledge_discovery_consent_audit (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references public.knowledge_discovery_site_consents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  hostname text not null,
  action text not null check(action in ('granted','withdrawn')),
  actor_id uuid not null,
  session_id uuid not null,
  policy_version text not null,
  policy_sha256 text not null check(policy_sha256 ~ '^[0-9a-f]{64}$'),
  revision integer not null check(revision>=1),
  valid_until timestamptz not null,
  job_cancellations integer not null default 0 check(job_cancellations>=0),
  occurred_at timestamptz not null default clock_timestamp(),
  unique(consent_id,revision)
);
create index kb_consent_audit_org_date
  on public.knowledge_discovery_consent_audit(organization_id,occurred_at desc);
alter table public.knowledge_discovery_consent_audit enable row level security;
revoke all on public.knowledge_discovery_consent_audit from public,anon,authenticated;
grant select on public.knowledge_discovery_consent_audit to authenticated;
grant all on public.knowledge_discovery_consent_audit to service_role;
create policy kb_consent_audit_admin_read
  on public.knowledge_discovery_consent_audit for select to authenticated
  using(public.can_manage_organization(organization_id));

create or replace function public.kb_discovery_consent_audit_immutable_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp
as $fn$
begin
  raise exception 'consent_audit_append_only' using errcode='42501';
end;
$fn$;
revoke all on function public.kb_discovery_consent_audit_immutable_v1()
  from public,anon,authenticated;
create trigger kb_discovery_consent_audit_immutable
before update or delete on public.knowledge_discovery_consent_audit
for each row execute function public.kb_discovery_consent_audit_immutable_v1();

-- Unlike generic legacy membership helpers, never allow sole-organization
-- fallback, spoofed user ids, an unbound JWT session or an absent auth.sessions
-- row. This is the only authority check for the two write RPCs.
create or replace function public.kb_discovery_consent_actor_v1(p_org uuid)
returns uuid language plpgsql stable security definer
set search_path=public,auth,pg_temp as $fn$
declare
  v_actor uuid := auth.uid();
  v_raw_session text := auth.jwt()->>'session_id';
  v_session uuid;
begin
  if auth.jwt()->>'role' is distinct from 'authenticated'
    or p_org is null or v_actor is null or v_raw_session is null
    or v_raw_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return null;
  end if;
  v_session := v_raw_session::uuid;
  if not exists (
    select 1
      from public.tenant_session_bindings b
      join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
      join public.organizations o on o.id=b.organization_id and o.status='active'
      join public.organization_members m
        on m.organization_id=b.organization_id and m.user_id=b.user_id
    where b.session_id=v_session and b.user_id=v_actor
      and b.organization_id=p_org and m.active=true
      and m.role in ('owner','admin')
  ) then
    return null;
  end if;
  return v_actor;
end;
$fn$;
revoke all on function public.kb_discovery_consent_actor_v1(uuid)
from public,anon,authenticated,service_role;

-- Initial grant only; regrant after withdrawal needs a separately reviewed
-- policy/version procedure. An explicit acknowledgement is NOT proof that
-- a real owner reviewed the policy in the UI or outside the product.
create or replace function public.grant_knowledge_discovery_consent_v1(
  p_organization_id uuid,
  p_hostname text,
  p_policy_version text,
  p_policy_sha256 text,
  p_valid_until timestamptz,
  p_acknowledgement text
) returns jsonb language plpgsql volatile security definer
set search_path=public,auth,pg_temp as $fn$
declare
  v_actor uuid;
  v_session uuid;
  v_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  v_actor:=public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb_consent_actor_or_session_denied' using errcode='42501';
  end if;
  if p_hostname is null
     or length(p_hostname)>253
     or p_hostname !~ '^[a-z0-9][a-z0-9.-]*[.][a-z]{2,}$'
     or p_acknowledgement is distinct from
         'I authorize read-only website discovery for this domain'
     or p_valid_until is null
     or p_valid_until <= v_now
     or p_valid_until > v_now+interval '7 days' then
    raise exception 'kb_consent_invalid_scope_or_acknowledgement' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.knowledge_discovery_consent_control
    where singleton=true and grants_enabled=true
      and approved_policy_version=p_policy_version
      and approved_policy_sha256=p_policy_sha256
      and approved_at<=v_now
  ) then
    raise exception 'kb_consent_policy_unapproved' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.knowledge_discovery_domain_verifications d
    where d.organization_id=p_organization_id and d.hostname=p_hostname
      and d.verified_at is not null and d.verified_at <=v_now
      and d.verified_until>v_now
  ) then
    raise exception 'kb_consent_domain_not_verified' using errcode='42501';
  end if;

  -- Serialize fresh grants for this one tenant/host even before a row exists.
  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':'||p_hostname,20261106));
  if exists(select 1 from public.knowledge_discovery_site_consents
            where organization_id=p_organization_id and hostname=p_hostname) then
    raise exception 'kb_consent_already_exists_no_implicit_regrant' using errcode='23505';
  end if;
  v_session := (auth.jwt()->>'session_id')::uuid;
  insert into public.knowledge_discovery_site_consents(
    organization_id,hostname,purpose,status,policy_version,granted_by,
    granted_at,valid_until,withdrawn_at,revision
  ) values(
    p_organization_id,p_hostname,'website_discovery_review_only','granted',
    p_policy_version,v_actor,v_now,p_valid_until,null,1
  ) returning id into v_id;

  insert into public.knowledge_discovery_consent_audit(
    consent_id,organization_id,hostname,action,actor_id,session_id,
    policy_version,policy_sha256,revision,valid_until
  ) values(
    v_id,p_organization_id,p_hostname,'granted',v_actor,v_session,
    p_policy_version,p_policy_sha256,1,p_valid_until
  );
  return jsonb_build_object('ok',true,'status','granted','revision',1);
end;
$fn$;
revoke all on function public.grant_knowledge_discovery_consent_v1(
  uuid,text,text,text,timestamptz,text
) from public,anon,authenticated,service_role;
grant execute on function public.grant_knowledge_discovery_consent_v1(
  uuid,text,text,text,timestamptz,text
) to authenticated;

create or replace function public.withdraw_knowledge_discovery_consent_v1(
  p_organization_id uuid,
  p_hostname text,
  p_expected_revision integer
) returns jsonb language plpgsql volatile security definer
set search_path=public,auth,pg_temp as $fn$
declare
  v_actor uuid;
  v_session uuid;
  v_record public.knowledge_discovery_site_consents%rowtype;
  v_sha text;
  v_jobs integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  v_actor:=public.kb_discovery_consent_actor_v1(p_organization_id);
  if v_actor is null then
    raise exception 'kb_consent_actor_or_session_denied' using errcode='42501';
  end if;
  if p_hostname is null or length(p_hostname)>253
    or p_hostname !~ '^[a-z0-9][a-z0-9.-]*[.][a-z]{2,}$'
    or p_expected_revision is null or p_expected_revision<1 then
    raise exception 'kb_consent_invalid_withdrawal' using errcode='22023';
  end if;

  -- Consistent lock order with page commits: job row BEFORE consent row.
  -- A worker which acquired the job lock first can finish before withdrawal,
  -- but no worker can commit AFTER a completed withdrawal.
  perform j.id from public.knowledge_discovery_jobs j
    where j.organization_id=p_organization_id
      and substring(j.seed_url from '^https://([a-z0-9.-]+)(/|$)')=p_hostname
      and j.status in ('queued','running')
    order by j.id for update;

  select * into v_record from public.knowledge_discovery_site_consents
    where organization_id=p_organization_id and hostname=p_hostname
    for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','consent_missing');
  end if;
  if v_record.revision<>p_expected_revision then
    return jsonb_build_object('ok',false,'reason','stale_revision');
  end if;
  if v_record.status<>'granted' or v_record.withdrawn_at is not null then
    return jsonb_build_object('ok',false,'reason','already_withdrawn');
  end if;
  if v_record.revision>=2147483647 then
    raise exception 'kb_consent_revision_exhausted' using errcode='22023';
  end if;
  select a.policy_sha256 into v_sha from public.knowledge_discovery_consent_audit a
    where a.consent_id=v_record.id and a.revision=1 and a.action='granted';
  if v_sha is null then
    raise exception 'kb_consent_grant_audit_missing' using errcode='42501';
  end if;
  update public.knowledge_discovery_site_consents
    set status='withdrawn',withdrawn_at=v_now,updated_at=v_now,revision=revision+1
    where id=v_record.id;

  update public.knowledge_discovery_jobs j
    set status='cancelled',last_error_code='consent_withdrawn',
        lease_token=null,lease_until=null,finished_at=v_now
    where j.organization_id=p_organization_id
      and substring(j.seed_url from '^https://([a-z0-9.-]+)(/|$)')=p_hostname
      and j.status in ('queued','running');
  get diagnostics v_jobs=row_count;
  v_session:=(auth.jwt()->>'session_id')::uuid;
  insert into public.knowledge_discovery_consent_audit(
    consent_id,organization_id,hostname,action,actor_id,session_id,
    policy_version,policy_sha256,revision,valid_until,job_cancellations
  ) values(
    v_record.id,p_organization_id,p_hostname,'withdrawn',v_actor,v_session,
    v_record.policy_version,v_sha,v_record.revision+1,v_record.valid_until,v_jobs
  );
  return jsonb_build_object('ok',true,'status','withdrawn',
    'revision',v_record.revision+1,'jobsCancelled',v_jobs);
end;
$fn$;
revoke all on function public.withdraw_knowledge_discovery_consent_v1(
  uuid,text,integer
) from public,anon,authenticated,service_role;
grant execute on function public.withdraw_knowledge_discovery_consent_v1(
  uuid,text,integer
) to authenticated;

commit;
