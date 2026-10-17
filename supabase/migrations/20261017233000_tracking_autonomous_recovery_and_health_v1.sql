begin;

create table if not exists public.tracking_processor_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  batch_size integer not null default 50 check (batch_size between 1 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tracking_processor_settings(organization_id,enabled,max_attempts,batch_size,metadata)
select o.id,true,3,50,jsonb_build_object('managed_by','tracking_autonomous_recovery_v1')
from public.organizations o
on conflict (organization_id) do nothing;

create or replace function public.sync_tracking_processor_settings_for_org_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.tracking_processor_settings(organization_id,enabled,max_attempts,batch_size,metadata)
  values(new.id,true,3,50,jsonb_build_object('managed_by','tracking_autonomous_recovery_v1'))
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_sync_tracking_processor_settings_for_org_v1 on public.organizations;
create trigger trg_sync_tracking_processor_settings_for_org_v1
after insert on public.organizations
for each row execute function public.sync_tracking_processor_settings_for_org_v1();

alter table public.tracking_processor_settings enable row level security;
revoke all on public.tracking_processor_settings from anon,authenticated;
grant select,insert,update,delete on public.tracking_processor_settings to service_role;

create or replace function public.sweep_tracking_events_v1(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row record;
  v_result jsonb;
  v_scanned integer := 0;
  v_processed integer := 0;
  v_failed integer := 0;
  v_ignored integer := 0;
  v_dead_letter integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500';
  end if;

  for v_row in
    select
      rp.raw_event_id,
      rp.organization_id,
      rp.attempt_count,
      s.max_attempts
    from public.raw_event_processing rp
    join public.raw_events re
      on re.id=rp.raw_event_id
     and re.organization_id=rp.organization_id
    join public.tracking_sources ts
      on ts.id=re.tracking_source_id
     and ts.organization_id=re.organization_id
    join public.tracking_processor_settings s
      on s.organization_id=re.organization_id
     and s.enabled=true
    where ts.status='active'
      and coalesce((re.metadata->>'accepted_for_processing')::boolean,true)=true
      and rp.status in ('received','failed')
      and (rp.next_retry_at is null or rp.next_retry_at<=now())
      and rp.attempt_count < s.max_attempts
    order by
      case when rp.status='failed' then 0 else 1 end,
      coalesce(rp.next_retry_at,re.received_at),
      re.received_at,
      rp.raw_event_id
    for update of rp skip locked
    limit p_limit
  loop
    v_scanned := v_scanned+1;

    update public.raw_event_processing
    set status='processing',
        processor_name='tracking_autonomous_sweep_v1',
        processor_version='v1',
        last_attempt_at=now(),
        updated_at=now()
    where raw_event_id=v_row.raw_event_id
      and organization_id=v_row.organization_id;

    v_result := public.process_tracking_raw_event_v1(
      v_row.organization_id,
      v_row.raw_event_id
    );

    if coalesce((v_result->>'processed')::boolean,false) then
      v_processed := v_processed+1;
    elsif coalesce((v_result->>'ignored')::boolean,false) then
      v_ignored := v_ignored+1;
    else
      v_failed := v_failed+1;
      if coalesce((v_result->>'dead_letter')::boolean,false) then
        v_dead_letter := v_dead_letter+1;
      end if;
    end if;
  end loop;

  update public.raw_event_processing rp
  set status='dead_letter',
      next_retry_at=null,
      lease_token=null,
      lease_expires_at=null,
      processing_error=coalesce(rp.processing_error,'Maximum autonomous tracking attempts reached.'),
      processing_metadata=coalesce(rp.processing_metadata,'{}'::jsonb) || jsonb_build_object('dead_lettered_by','tracking_autonomous_sweep_v1','dead_lettered_at',now()),
      updated_at=now()
  from public.tracking_processor_settings s,
       public.raw_events re
  where re.id=rp.raw_event_id
    and re.organization_id=rp.organization_id
    and re.tracking_source_id is not null
    and s.organization_id=rp.organization_id
    and s.enabled=true
    and rp.status in ('received','failed')
    and rp.attempt_count>=s.max_attempts;

  return jsonb_build_object(
    'ok',true,
    'scanned',v_scanned,
    'processed',v_processed,
    'failed',v_failed,
    'ignored',v_ignored,
    'dead_lettered_this_sweep',v_dead_letter,
    'ran_at',now()
  );
end;
$$;

grant execute on function public.sweep_tracking_events_v1(integer) to service_role;

create or replace view public.v_tracking_source_health_v1
with (security_invoker=true)
as
select
  ts.organization_id,
  ts.id as tracking_source_id,
  ts.name,
  ts.source_type,
  ts.source_system,
  ts.auth_mode,
  ts.hostname,
  ts.status,
  ts.rate_limit_per_minute,
  ts.max_payload_bytes,
  ts.accepted_event_count,
  ts.duplicate_event_count,
  ts.rejected_event_count,
  ts.last_seen_at,
  ts.last_rejected_at,
  count(re.id) filter (where re.received_at>=now()-interval '24 hours') as events_24h,
  count(re.id) filter (where re.received_at>=now()-interval '24 hours' and rp.status='processed') as processed_24h,
  count(re.id) filter (where re.received_at>=now()-interval '24 hours' and rp.status='failed') as failed_24h,
  count(re.id) filter (where re.received_at>=now()-interval '24 hours' and rp.status='dead_letter') as dead_letter_24h,
  count(re.id) filter (where re.received_at>=now()-interval '24 hours' and rp.status='ignored') as ignored_24h,
  count(re.id) filter (where re.received_at>=now()-interval '24 hours' and coalesce((re.metadata->>'accepted_for_processing')::boolean,true)=false) as quarantined_24h,
  max(re.received_at) as latest_event_at,
  max(rp.processed_at) as latest_processed_at,
  percentile_cont(0.95) within group (
    order by extract(epoch from (rp.processed_at-re.received_at))*1000
  ) filter (
    where re.received_at>=now()-interval '24 hours'
      and rp.processed_at is not null
      and rp.processed_at>=re.received_at
  ) as processing_latency_p95_ms
from public.tracking_sources ts
left join public.raw_events re
  on re.organization_id=ts.organization_id
 and re.tracking_source_id=ts.id
left join public.raw_event_processing rp
  on rp.organization_id=re.organization_id
 and rp.raw_event_id=re.id
group by
  ts.organization_id,ts.id,ts.name,ts.source_type,ts.source_system,ts.auth_mode,ts.hostname,ts.status,
  ts.rate_limit_per_minute,ts.max_payload_bytes,ts.accepted_event_count,ts.duplicate_event_count,
  ts.rejected_event_count,ts.last_seen_at,ts.last_rejected_at;

create or replace view public.v_tracking_integrity_health_v1
with (security_invoker=true)
as
select
  o.id as organization_id,
  (select count(*) from public.raw_event_processing rp where rp.organization_id=o.id and rp.status='dead_letter') as dead_letter_total,
  (select count(*) from public.raw_event_processing rp where rp.organization_id=o.id and rp.status='failed' and (rp.next_retry_at is null or rp.next_retry_at<=now())) as retry_due,
  (select count(*) from public.raw_events re where re.organization_id=o.id and re.tracking_source_id is not null and re.event_family is null) as unclassified_events,
  (select count(*) from public.raw_events re where re.organization_id=o.id and coalesce((re.metadata->>'accepted_for_processing')::boolean,true)=false) as quarantined_events,
  (select count(*) from public.leads l where l.organization_id=o.id and l.lead_creation_channel is null) as leads_without_creation_channel,
  (select count(*) from public.leads l where l.organization_id=o.id and not exists(select 1 from public.lead_contacts lc where lc.organization_id=o.id and lc.lead_id=l.id)) as leads_without_contacts,
  (select count(*) from public.lead_ingest_events lie where lie.organization_id=o.id and lie.status='failed') as failed_lead_ingest_events,
  (select count(*) from public.web_sessions ws where ws.organization_id=o.id and ws.lead_id is not null and not exists(select 1 from public.leads l where l.id=ws.lead_id and l.organization_id=o.id)) as broken_session_lead_links,
  now() as checked_at
from public.organizations o;

revoke all on public.v_tracking_source_health_v1 from anon,authenticated;
revoke all on public.v_tracking_integrity_health_v1 from anon,authenticated;
grant select on public.v_tracking_source_health_v1 to service_role;
grant select on public.v_tracking_integrity_health_v1 to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists(select 1 from cron.job where jobname='salsys-tracking-autonomous-recovery-v1') then
    perform cron.unschedule('salsys-tracking-autonomous-recovery-v1');
  end if;

  perform cron.schedule(
    'salsys-tracking-autonomous-recovery-v1',
    '* * * * *',
    'select public.sweep_tracking_events_v1(100);'
  );
end;
$$;

commit;
