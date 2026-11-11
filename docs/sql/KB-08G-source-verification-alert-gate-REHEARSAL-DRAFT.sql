-- KB-08G: LOCAL POSTGRES SOURCE-VERIFICATION / ALERT REHEARSAL ONLY.
-- NOT A SUPABASE MIGRATION; never run on SalsysOS Production, Recovery or staging.
-- Requires the KB-08E and KB-08F random disposable fixtures.
-- Two mock observer reports are NOT independently authenticated website evidence.
-- Private retrieval is blocked if monitoring is pending, conflicted or expired.

do $kb08g_guard$
begin
  if current_database() !~ '^salsys_kb08e_[a-f0-9]{18}$'
     or to_regclass('public.organizations') is not null
     or to_regclass('kb08e_fixture.source_versions') is null
     or to_regclass('kb08f_fixture.review_holds') is null
     or to_regclass('kb08f_fixture.synthetic_eligible_knowledge') is null
     or to_regclass('kb08g_fixture.source_monitors') is not null then
    raise exception 'KB08G_DISPOSABLE_PARENT_FIXTURE_REQUIRED';
  end if;
end;
$kb08g_guard$;

create schema kb08g_fixture;
revoke all on schema kb08g_fixture from public;
grant usage on schema kb08g_fixture to service_role;

create table kb08g_fixture.source_monitors (
  organization_id uuid not null,
  source_id uuid not null,
  cycle integer not null default 1 check (cycle>=1),
  status text not null default 'pending'
    check (status in ('pending','conflict','verified')),
  cycle_started_at timestamptz not null default clock_timestamp(),
  last_verified_at timestamptz,
  verified_source_revision integer,
  primary key (organization_id,source_id),
  foreign key (organization_id,source_id)
    references kb08e_fixture.source_versions(organization_id,id)
    on delete restrict
);

create table kb08g_fixture.mock_observers (
  organization_id uuid not null,
  source_id uuid not null,
  observer_id uuid not null,
  active boolean not null default true,
  primary key (organization_id,source_id,observer_id),
  foreign key (organization_id,source_id)
    references kb08g_fixture.source_monitors(organization_id,source_id)
    on delete restrict
);

create table kb08g_fixture.mock_observations (
  organization_id uuid not null,
  source_id uuid not null,
  cycle integer not null,
  observer_id uuid not null,
  source_url text not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  block_id text not null check (block_id ~ '^[a-f0-9]{64}$'),
  quote_sha256 text not null check (quote_sha256 ~ '^[a-f0-9]{64}$'),
  fetched_at timestamptz not null,
  state text not null check (state in ('active','revoked')),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (organization_id,source_id,cycle,observer_id),
  foreign key (organization_id,source_id)
    references kb08g_fixture.source_monitors(organization_id,source_id)
    on delete restrict
);

create table kb08g_fixture.monitor_alerts (
  organization_id uuid not null,
  source_id uuid not null,
  cycle integer not null,
  kind text not null check (
    kind in ('observer_conflict','source_changed','source_revoked',
             'verification_delayed','verification_expired')),
  emitted_at timestamptz not null default clock_timestamp(),
  primary key (organization_id,source_id,cycle,kind),
  foreign key (organization_id,source_id)
    references kb08g_fixture.source_monitors(organization_id,source_id)
    on delete restrict
);

alter table kb08g_fixture.source_monitors enable row level security;
alter table kb08g_fixture.mock_observers enable row level security;
alter table kb08g_fixture.mock_observations enable row level security;
alter table kb08g_fixture.monitor_alerts enable row level security;
revoke all on all tables in schema kb08g_fixture
  from public, anon, authenticated, service_role;

-- This private view can be queried ONLY by the local superuser test harness,
-- not by CRM users or the actual knowledge retrieval API. Missing/old checks
-- cause immediate non-eligibility, without requiring an alert scheduler to run.
create view kb08g_fixture.synthetic_verified_eligible_knowledge
with (security_invoker = true) as
select e.organization_id,e.document_id,e.document_version,
       e.source_id,e.source_revision
from kb08f_fixture.synthetic_eligible_knowledge e
join kb08g_fixture.source_monitors m
  on m.organization_id=e.organization_id and m.source_id=e.source_id
where m.status='verified'
  and m.verified_source_revision=e.source_revision
  and m.last_verified_at is not null
  and m.last_verified_at>=clock_timestamp()-interval '24 hours';
revoke all on kb08g_fixture.synthetic_verified_eligible_knowledge
  from public, anon, authenticated, service_role;

-- A monitoring cycle must be explicitly opened; while it is pending, old
-- verified knowledge is deliberately withheld in this local model.
create function kb08g_fixture.begin_synthetic_verification_cycle_v1(
  p_org uuid,p_source_id uuid,p_expected_cycle integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $begin_cycle$
declare v_cycle integer;
begin
  if p_org is null or p_source_id is null
     or p_expected_cycle is null or p_expected_cycle<1 then
    raise exception 'kb08g_invalid_cycle_request' using errcode='22023';
  end if;
  update kb08g_fixture.source_monitors m
  set cycle=m.cycle+1,status='pending',cycle_started_at=clock_timestamp()
  where m.organization_id=p_org and m.source_id=p_source_id
    and m.cycle=p_expected_cycle
    and m.status in ('verified','conflict')
  returning m.cycle into v_cycle;
  if not found then
    raise exception 'kb08g_stale_or_unfinished_cycle' using errcode='P0001';
  end if;
  return jsonb_build_object('cycle',v_cycle,'status','pending',
                            'eligible',false);
end;
$begin_cycle$;

-- Both observer identities are MOCK allowlist entries created only inside the
-- disposable test. No signed collector identity, browser content, ownership
-- challenge, consent, independent source provenance or network exists here.
create function kb08g_fixture.record_synthetic_source_observation_v1(
  p_org uuid,
  p_source_id uuid,
  p_cycle integer,
  p_observer_id uuid,
  p_source_url text,
  p_snapshot_sha256 text,
  p_block_id text,
  p_quote_sha256 text,
  p_fetched_at timestamptz,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $observe$
declare
  v_monitor kb08g_fixture.source_monitors%rowtype;
  v_other kb08g_fixture.mock_observations%rowtype;
  v_source kb08e_fixture.source_versions%rowtype;
  v_change jsonb;
  v_kind text;
  v_verified_time timestamptz:=clock_timestamp();
  v_revision integer;
begin
  if p_org is null or p_source_id is null or p_observer_id is null
     or p_cycle is null or p_cycle<1
     or p_source_url is null or length(p_source_url)>2048
     or p_source_url !~ '^https://[^[:space:]]+$'
     or p_snapshot_sha256 is null or p_snapshot_sha256 !~ '^[a-f0-9]{64}$'
     or p_block_id is null or p_block_id !~ '^[a-f0-9]{64}$'
     or p_quote_sha256 is null or p_quote_sha256 !~ '^[a-f0-9]{64}$'
     or p_fetched_at is null or p_fetched_at>clock_timestamp()
     or p_state is null or p_state not in ('active','revoked') then
    raise exception 'kb08g_invalid_observation' using errcode='22023';
  end if;
  select * into v_monitor from kb08g_fixture.source_monitors m
  where m.organization_id=p_org and m.source_id=p_source_id
  for update;
  if not found or v_monitor.cycle<>p_cycle or v_monitor.status<>'pending' then
    raise exception 'kb08g_stale_or_closed_cycle' using errcode='P0001';
  end if;
  if not exists (
    select 1 from kb08g_fixture.mock_observers o
    where o.organization_id=p_org and o.source_id=p_source_id
      and o.observer_id=p_observer_id and o.active
  ) then
    raise exception 'kb08g_unrecognized_mock_observer' using errcode='42501';
  end if;
  insert into kb08g_fixture.mock_observations(
    organization_id,source_id,cycle,observer_id,source_url,
    snapshot_sha256,block_id,quote_sha256,fetched_at,state
  ) values (
    p_org,p_source_id,p_cycle,p_observer_id,p_source_url,
    p_snapshot_sha256,p_block_id,p_quote_sha256,p_fetched_at,p_state
  );

  select * into v_other from kb08g_fixture.mock_observations o
  where o.organization_id=p_org and o.source_id=p_source_id
    and o.cycle=p_cycle and o.observer_id<>p_observer_id
  order by o.observer_id limit 1;
  if not found then
    return jsonb_build_object('status','awaiting_second_mock_observer',
                              'eligible',false,'held',0);
  end if;
  if v_other.source_url is distinct from p_source_url
     or v_other.snapshot_sha256 is distinct from p_snapshot_sha256
     or v_other.block_id is distinct from p_block_id
     or v_other.quote_sha256 is distinct from p_quote_sha256
     or v_other.fetched_at is distinct from p_fetched_at
     or v_other.state is distinct from p_state then
    update kb08g_fixture.source_monitors
      set status='conflict'
    where organization_id=p_org and source_id=p_source_id;
    insert into kb08g_fixture.monitor_alerts(
      organization_id,source_id,cycle,kind
    ) values (p_org,p_source_id,p_cycle,'observer_conflict');
    return jsonb_build_object('status','mock_observers_disagree',
                              'eligible',false,'held',0);
  end if;

  -- Read current stored source as a claim. The KB-08F processor itself
  -- obtains document/source locks and compares expected revision/snapshot.
  -- This is NOT source truth, it is a database consistency demonstration.
  select * into v_source from kb08e_fixture.source_versions s
  where s.organization_id=p_org and s.id=p_source_id;
  if not found then
    raise exception 'kb08g_missing_current_source' using errcode='P0002';
  end if;
  select kb08f_fixture.apply_synthetic_source_revision_v1(
    p_org,p_source_id,v_source.revision,v_source.snapshot_sha256,
    p_source_url,p_snapshot_sha256,p_block_id,p_quote_sha256,
    p_fetched_at,p_state
  ) into v_change;

  v_revision:=(v_change->>'source_revision')::integer;
  update kb08g_fixture.source_monitors m
  set status='verified',last_verified_at=v_verified_time,
      verified_source_revision=v_revision
  where m.organization_id=p_org and m.source_id=p_source_id
    and m.cycle=p_cycle and m.status='pending';
  if not found then
    raise exception 'kb08g_monitor_compare_failed' using errcode='P0001';
  end if;
  if (v_change->>'material_change')::boolean then
    v_kind:=case when p_state='revoked'
      then 'source_revoked' else 'source_changed' end;
    insert into kb08g_fixture.monitor_alerts(
      organization_id,source_id,cycle,kind
    ) values (p_org,p_source_id,p_cycle,v_kind);
  end if;
  return jsonb_build_object(
    'status','two_mock_observations_consistent',
    'synthetic_not_independent_proof',true,
    'material_change',v_change->'material_change',
    'held',v_change->'held',
    'eligible',p_state='active' and not (v_change->>'material_change')::boolean,
    'source_revision',v_revision
  );
end;
$observe$;

-- A scheduler, email, webhook or production notification is NOT deployed.
-- Calling this service-only local function just stores synthetic gap alerts.
-- Suppression is handled by the private view even if this is never called.
create function kb08g_fixture.scan_synthetic_verification_gaps_v1(
  p_org uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $scan$
declare v_count integer;
begin
  if p_org is null then
    raise exception 'kb08g_invalid_organization' using errcode='22023';
  end if;
  insert into kb08g_fixture.monitor_alerts (
    organization_id,source_id,cycle,kind
  )
  select m.organization_id,m.source_id,m.cycle,
    case
      when m.status='conflict' then 'observer_conflict'
      when m.status='pending'
        and m.cycle_started_at<clock_timestamp()-interval '15 minutes'
      then 'verification_delayed'
      when m.status='verified' and
        (m.last_verified_at is null or
         m.last_verified_at<clock_timestamp()-interval '24 hours')
      then 'verification_expired'
    end
  from kb08g_fixture.source_monitors m
  where m.organization_id=p_org
    and (m.status='conflict'
      or (m.status='pending' and
          m.cycle_started_at<clock_timestamp()-interval '15 minutes')
      or (m.status='verified' and
          (m.last_verified_at is null or
           m.last_verified_at<clock_timestamp()-interval '24 hours')))
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return jsonb_build_object('new_synthetic_alerts',v_count,
                            'no_live_notifications',true);
end;
$scan$;

revoke all on function kb08g_fixture.begin_synthetic_verification_cycle_v1(
  uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function kb08g_fixture.begin_synthetic_verification_cycle_v1(
  uuid,uuid,integer) to service_role;

revoke all on function kb08g_fixture.record_synthetic_source_observation_v1(
  uuid,uuid,integer,uuid,text,text,text,text,timestamptz,text)
  from public,anon,authenticated,service_role;
grant execute on function kb08g_fixture.record_synthetic_source_observation_v1(
  uuid,uuid,integer,uuid,text,text,text,text,timestamptz,text)
  to service_role;

revoke all on function kb08g_fixture.scan_synthetic_verification_gaps_v1(
  uuid) from public,anon,authenticated,service_role;
grant execute on function kb08g_fixture.scan_synthetic_verification_gaps_v1(
  uuid) to service_role;
