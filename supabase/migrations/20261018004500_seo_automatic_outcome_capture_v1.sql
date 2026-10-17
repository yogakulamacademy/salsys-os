begin;

alter table public.seo_learning_settings
  add column if not exists auto_capture_outcomes boolean not null default true,
  add column if not exists outcome_lag_days integer not null default 2 check (outcome_lag_days between 0 and 30),
  add column if not exists max_outcomes_per_sweep integer not null default 20 check (max_outcomes_per_sweep between 1 and 100);

create table if not exists public.seo_experiment_outcome_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid not null references public.seo_experiments(id) on delete cascade,
  status text not null check (status in ('captured','learned','skipped','failed')),
  final_window_start date,
  final_window_end date,
  measurement_id uuid references public.seo_experiment_measurements(id) on delete set null,
  learning_event_id uuid references public.seo_experiment_learning_events(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(experiment_id,final_window_start,final_window_end)
);

create index if not exists idx_seo_experiment_outcome_runs_org_created
  on public.seo_experiment_outcome_runs(organization_id,created_at desc);

alter table public.seo_experiment_outcome_runs enable row level security;
revoke all on public.seo_experiment_outcome_runs from anon, authenticated;
grant select,insert,update,delete on public.seo_experiment_outcome_runs to service_role;

create or replace function public.capture_due_seo_experiment_outcome_v1(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_exp public.seo_experiments%rowtype;
  v_settings public.seo_learning_settings%rowtype;
  v_baseline public.seo_experiment_measurements%rowtype;
  v_latest_gsc date;
  v_required_end date;
  v_window_days integer;
  v_final_start date;
  v_measurement_id uuid;
  v_learning jsonb;
  v_learning_event_id uuid;
  v_run_id uuid;
begin
  if p_organization_id is null or p_experiment_id is null then
    raise exception 'organization_id and experiment_id are required';
  end if;

  select * into v_exp
  from public.seo_experiments
  where id=p_experiment_id and organization_id=p_organization_id
  for update;

  if v_exp.id is null then
    return jsonb_build_object('ok',false,'reason','experiment_not_found');
  end if;

  if v_exp.status <> 'running' and p_force is not true then
    return jsonb_build_object('ok',true,'skipped',true,'reason','experiment_not_running');
  end if;

  select * into v_settings
  from public.seo_learning_settings
  where organization_id=p_organization_id;

  if v_settings.organization_id is null or v_settings.enabled is not true then
    return jsonb_build_object('ok',true,'skipped',true,'reason','learning_disabled');
  end if;

  if v_settings.auto_capture_outcomes is not true and p_force is not true then
    return jsonb_build_object('ok',true,'skipped',true,'reason','automatic_outcome_capture_disabled');
  end if;

  if exists(
    select 1 from public.seo_experiment_measurements m
    where m.organization_id=p_organization_id
      and m.experiment_id=p_experiment_id
      and m.phase='final'
  ) then
    return jsonb_build_object('ok',true,'skipped',true,'reason','final_measurement_already_exists');
  end if;

  select * into v_baseline
  from public.seo_experiment_measurements
  where organization_id=p_organization_id
    and experiment_id=p_experiment_id
    and phase='baseline'
  order by window_end desc,captured_at desc
  limit 1;

  if v_baseline.id is null then
    return jsonb_build_object('ok',true,'skipped',true,'reason','baseline_missing');
  end if;

  if v_exp.started_at is null then
    return jsonb_build_object('ok',true,'skipped',true,'reason','experiment_start_missing');
  end if;

  select max(d.date) into v_latest_gsc
  from public.gsc_page_daily d
  where d.organization_id=p_organization_id;

  if v_latest_gsc is null then
    return jsonb_build_object('ok',true,'skipped',true,'reason','finalized_gsc_unavailable');
  end if;

  v_required_end := (v_exp.started_at at time zone 'Asia/Kolkata')::date
                    + greatest(0,v_exp.minimum_observation_days-1)
                    + v_settings.outcome_lag_days;

  if v_latest_gsc < v_required_end and p_force is not true then
    return jsonb_build_object(
      'ok',true,'skipped',true,'reason','observation_window_not_mature',
      'latest_gsc_date',v_latest_gsc,'required_gsc_date',v_required_end
    );
  end if;

  v_window_days := greatest(1,(v_baseline.window_end-v_baseline.window_start)+1);
  v_final_start := v_latest_gsc-(v_window_days-1);

  if v_final_start <= v_baseline.window_end and p_force is not true then
    return jsonb_build_object(
      'ok',true,'skipped',true,'reason','final_window_overlaps_baseline',
      'final_window_start',v_final_start,'baseline_window_end',v_baseline.window_end
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'seo-outcome:' || p_organization_id::text || ':' || p_experiment_id::text || ':' || v_latest_gsc::text,
    0
  ));

  v_measurement_id := public.capture_seo_experiment_measurement(
    p_organization_id,
    p_experiment_id,
    'final',
    v_final_start,
    v_latest_gsc
  );

  v_learning := public.evaluate_seo_experiment_learning_v1(
    p_organization_id,
    p_experiment_id,
    true
  );

  begin
    v_learning_event_id := nullif(v_learning->>'learning_event_id','')::uuid;
  exception when others then
    v_learning_event_id := null;
  end;

  insert into public.seo_experiment_outcome_runs(
    organization_id,experiment_id,status,final_window_start,final_window_end,
    measurement_id,learning_event_id,reason,metadata
  ) values (
    p_organization_id,p_experiment_id,
    case when coalesce((v_learning->>'ok')::boolean,false) then 'learned' else 'captured' end,
    v_final_start,v_latest_gsc,v_measurement_id,v_learning_event_id,null,
    jsonb_build_object(
      'capture_version','seo_auto_outcome_v1',
      'baseline_window_start',v_baseline.window_start,
      'baseline_window_end',v_baseline.window_end,
      'minimum_observation_days',v_exp.minimum_observation_days,
      'outcome_lag_days',v_settings.outcome_lag_days,
      'learning',v_learning
    )
  )
  on conflict (experiment_id,final_window_start,final_window_end)
  do update set
    status=excluded.status,
    measurement_id=excluded.measurement_id,
    learning_event_id=excluded.learning_event_id,
    metadata=excluded.metadata,
    created_at=now()
  returning id into v_run_id;

  return jsonb_build_object(
    'ok',true,
    'skipped',false,
    'experiment_id',p_experiment_id,
    'outcome_run_id',v_run_id,
    'measurement_id',v_measurement_id,
    'learning_event_id',v_learning_event_id,
    'final_window_start',v_final_start,
    'final_window_end',v_latest_gsc,
    'learning',v_learning
  );
exception when others then
  begin
    insert into public.seo_experiment_outcome_runs(
      organization_id,experiment_id,status,reason,metadata
    ) values (
      p_organization_id,p_experiment_id,'failed',left(sqlerrm,500),
      jsonb_build_object('capture_version','seo_auto_outcome_v1','failed_at',now())
    );
  exception when others then
    null;
  end;
  return jsonb_build_object('ok',false,'skipped',false,'reason','outcome_capture_failed');
end;
$$;

create or replace function public.sweep_due_seo_experiment_outcomes_v1(
  p_organization_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row record;
  v_result jsonb;
  v_scanned integer := 0;
  v_completed integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_limit integer := greatest(1,least(coalesce(p_limit,50),200));
begin
  for v_row in
    select e.organization_id,e.id as experiment_id
    from public.seo_experiments e
    join public.seo_learning_settings s
      on s.organization_id=e.organization_id
     and s.enabled=true
     and s.auto_capture_outcomes=true
    where e.status='running'
      and (p_organization_id is null or e.organization_id=p_organization_id)
      and exists(
        select 1 from public.seo_experiment_measurements m
        where m.organization_id=e.organization_id
          and m.experiment_id=e.id
          and m.phase='baseline'
      )
      and not exists(
        select 1 from public.seo_experiment_measurements m
        where m.organization_id=e.organization_id
          and m.experiment_id=e.id
          and m.phase='final'
      )
    order by e.started_at nulls last,e.id
    limit v_limit
  loop
    v_scanned := v_scanned+1;
    v_result := public.capture_due_seo_experiment_outcome_v1(v_row.organization_id,v_row.experiment_id,false);
    if coalesce((v_result->>'ok')::boolean,false) is not true then
      v_failed := v_failed+1;
    elsif coalesce((v_result->>'skipped')::boolean,false) is true then
      v_skipped := v_skipped+1;
    else
      v_completed := v_completed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',v_failed=0,
    'scanned',v_scanned,
    'completed',v_completed,
    'skipped',v_skipped,
    'failed',v_failed
  );
end;
$$;

drop view if exists public.v_seo_learning_health_v1;
create view public.v_seo_learning_health_v1
with (security_invoker=true)
as
select
  o.id as organization_id,
  coalesce(s.enabled,false) as enabled,
  coalesce(s.auto_finalize,false) as auto_finalize,
  count(distinct e.id) filter (where e.status='running')::integer as running_experiments,
  count(distinct e.id) filter (where e.status='completed')::integer as completed_experiments,
  count(distinct l.id)::integer as learning_events,
  count(distinct l.id) filter (where l.result_classification='positive')::integer as positive_learnings,
  count(distinct l.id) filter (where l.result_classification='negative')::integer as negative_learnings,
  count(distinct l.id) filter (where l.result_classification='mixed')::integer as mixed_learnings,
  count(distinct l.id) filter (where l.result_classification='inconclusive')::integer as inconclusive_learnings,
  max(l.evaluated_at) as last_learning_at,
  coalesce(s.auto_capture_outcomes,false) as auto_capture_outcomes,
  coalesce(s.outcome_lag_days,0) as outcome_lag_days,
  count(distinct e.id) filter (where e.status='running' and exists(
    select 1 from public.seo_experiment_measurements m
    where m.organization_id=e.organization_id and m.experiment_id=e.id and m.phase='baseline'
  ))::integer as running_with_baseline,
  count(distinct e.id) filter (where e.status='running' and exists(
    select 1 from public.seo_experiment_measurements m
    where m.organization_id=e.organization_id and m.experiment_id=e.id and m.phase='final'
  ))::integer as running_with_final,
  count(distinct r.id) filter (where r.status='learned')::integer as learned_outcomes,
  count(distinct r.id) filter (where r.status='failed')::integer as failed_outcomes,
  max(r.created_at) as last_outcome_capture_at,
  now() as checked_at
from public.organizations o
left join public.seo_learning_settings s on s.organization_id=o.id
left join public.seo_experiments e on e.organization_id=o.id
left join public.seo_experiment_learning_events l on l.organization_id=o.id
left join public.seo_experiment_outcome_runs r on r.organization_id=o.id
group by o.id,s.enabled,s.auto_finalize,s.auto_capture_outcomes,s.outcome_lag_days;

revoke all on public.v_seo_learning_health_v1 from anon,authenticated;
grant select on public.v_seo_learning_health_v1 to service_role;

revoke all on function public.capture_due_seo_experiment_outcome_v1(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.sweep_due_seo_experiment_outcomes_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.capture_due_seo_experiment_outcome_v1(uuid,uuid,boolean) to service_role;
grant execute on function public.sweep_due_seo_experiment_outcomes_v1(uuid,integer) to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='salsys-seo-outcome-capture-v1') then
      perform cron.unschedule('salsys-seo-outcome-capture-v1');
    end if;
    perform cron.schedule(
      'salsys-seo-outcome-capture-v1',
      '37 * * * *',
      'select public.sweep_due_seo_experiment_outcomes_v1(null,100);'
    );
  end if;
end $$;

commit;
