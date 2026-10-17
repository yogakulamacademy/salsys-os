begin;

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
    with candidates as (
      select
        e.organization_id,
        e.id as experiment_id,
        row_number() over(
          partition by e.organization_id
          order by e.started_at nulls last,e.id
        ) as org_rank,
        s.max_outcomes_per_sweep
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
    )
    select organization_id,experiment_id
    from candidates
    where org_rank<=max_outcomes_per_sweep
    order by organization_id,org_rank
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
with latest_gsc as (
  select organization_id,max(date) as latest_gsc_date
  from public.gsc_page_daily
  group by organization_id
), exp_state as (
  select
    e.organization_id,
    e.id,
    e.status,
    e.started_at,
    e.minimum_observation_days,
    exists(
      select 1 from public.seo_experiment_measurements m
      where m.organization_id=e.organization_id and m.experiment_id=e.id and m.phase='baseline'
    ) as has_baseline,
    exists(
      select 1 from public.seo_experiment_measurements m
      where m.organization_id=e.organization_id and m.experiment_id=e.id and m.phase='final'
    ) as has_final
  from public.seo_experiments e
)
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
  coalesce(s.max_outcomes_per_sweep,0) as max_outcomes_per_sweep,
  count(distinct e.id) filter (where e.status='running' and e.has_baseline)::integer as running_with_baseline,
  count(distinct e.id) filter (where e.status='running' and e.has_final)::integer as running_with_final,
  count(distinct e.id) filter (
    where e.status='running'
      and e.has_baseline
      and not e.has_final
      and e.started_at is not null
      and lg.latest_gsc_date is not null
      and lg.latest_gsc_date >= (e.started_at at time zone 'Asia/Kolkata')::date
          + greatest(0,e.minimum_observation_days-1)
          + coalesce(s.outcome_lag_days,0)
  )::integer as outcomes_due,
  count(distinct r.id) filter (where r.status='learned')::integer as learned_outcomes,
  count(distinct r.id) filter (where r.status='failed')::integer as failed_outcomes,
  max(r.created_at) as last_outcome_capture_at,
  lg.latest_gsc_date,
  now() as checked_at
from public.organizations o
left join public.seo_learning_settings s on s.organization_id=o.id
left join exp_state e on e.organization_id=o.id
left join public.seo_experiment_learning_events l on l.organization_id=o.id
left join public.seo_experiment_outcome_runs r on r.organization_id=o.id
left join latest_gsc lg on lg.organization_id=o.id
group by o.id,s.enabled,s.auto_finalize,s.auto_capture_outcomes,s.outcome_lag_days,s.max_outcomes_per_sweep,lg.latest_gsc_date;

revoke all on public.v_seo_learning_health_v1 from anon,authenticated;
grant select on public.v_seo_learning_health_v1 to service_role;

revoke all on function public.sweep_due_seo_experiment_outcomes_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.sweep_due_seo_experiment_outcomes_v1(uuid,integer) to service_role;

commit;
