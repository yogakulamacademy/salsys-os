-- PH-5.1 scheduler truth for Admissions.
--
-- Vercel is the single authoritative scheduler for /api/admissions/auto-tasks.
-- The legacy Supabase pg_cron job dispatched to crm.yogakulam.com and could
-- report scheduler success even when the downstream HTTP request returned 404.
--
-- This migration removes only that stale duplicate job and adds a read model
-- based on admissions_auto_task_runs so operational health reflects real task
-- execution outcomes rather than HTTP dispatch success.

do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'admissions-auto-tasks-every-15-min'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

create or replace view public.v_admissions_scheduler_health_v1
with (security_invoker = true)
as
with latest_run as (
  select distinct on (r.organization_id)
    r.organization_id,
    r.status,
    r.started_at,
    r.completed_at,
    r.error_message
  from public.admissions_auto_task_runs r
  order by
    r.organization_id,
    coalesce(r.completed_at, r.started_at) desc nulls last
),
run_stats as (
  select
    o.id as organization_id,
    count(r.id) filter (
      where r.started_at >= now() - interval '24 hours'
    )::bigint as activity_24h,
    count(r.id) filter (
      where r.started_at >= now() - interval '24 hours'
        and r.status in ('failed', 'partial')
    )::bigint as failures_24h,
    max(r.completed_at) filter (
      where r.status = 'success'
    ) as last_success_at,
    max(r.completed_at) filter (
      where r.status in ('failed', 'partial')
    ) as last_failure_at
  from public.organizations o
  left join public.admissions_auto_task_runs r
    on r.organization_id = o.id
  where o.status = 'active'
  group by o.id
)
select
  s.organization_id,
  'admissions_scheduler'::text as system_key,
  'Admissions Scheduler'::text as system_name,
  'automation'::text as system_group,
  case
    when l.organization_id is null then 'warning'
    when l.status = 'failed' then 'critical'
    when l.status = 'partial' then 'warning'
    when coalesce(l.completed_at, l.started_at) < now() - interval '30 minutes' then 'warning'
    else 'healthy'
  end::text as health_status,
  coalesce(l.status, 'no_run_history')::text as latest_status,
  coalesce(l.completed_at, l.started_at) as latest_activity_at,
  s.last_success_at,
  s.last_failure_at,
  s.activity_24h,
  s.failures_24h,
  0::bigint as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when l.organization_id is null then
      'No admissions scheduler run history exists for this active organization.'
    when l.status = 'failed' then
      coalesce(l.error_message, 'Latest admissions scheduler run failed.')
    when l.status = 'partial' then
      coalesce(l.error_message, 'Latest admissions scheduler run completed partially.')
    when coalesce(l.completed_at, l.started_at) < now() - interval '30 minutes' then
      'Admissions scheduler is stale: no completed run was observed within 30 minutes.'
    else null
  end::text as latest_error,
  30::integer as stale_after_minutes,
  now() as checked_at
from run_stats s
left join latest_run l
  on l.organization_id = s.organization_id;

revoke all on public.v_admissions_scheduler_health_v1 from public, anon, authenticated;
grant select on public.v_admissions_scheduler_health_v1 to service_role;

comment on view public.v_admissions_scheduler_health_v1 is
  'PH-5.1 admissions scheduler health derived from admissions_auto_task_runs. Vercel is the sole authoritative scheduler; stale duplicate Supabase HTTP cron is retired.';
