create or replace view public.v_course_catalog_sync_health_v2
with (security_invoker=true)
as
with latest_run as (
  select distinct on (r.organization_id,r.source_system)
    r.id,
    r.organization_id,
    r.source_system,
    r.status,
    r.trigger_type,
    r.courses_received,
    r.batches_received,
    r.courses_upserted,
    r.batches_upserted,
    r.batches_deactivated,
    r.request_metadata,
    r.error_message,
    r.started_at,
    r.completed_at
  from public.course_catalog_sync_runs r
  order by r.organization_id,r.source_system,r.started_at desc,r.id desc
)
select
  r.id as sync_run_id,
  r.source_system,
  r.status,
  r.trigger_type,
  r.courses_received,
  r.batches_received,
  r.courses_upserted,
  r.batches_upserted,
  r.batches_deactivated,
  r.error_message,
  r.started_at,
  r.completed_at,
  (
    select count(*)
    from public.course_batches cb
    where cb.organization_id=r.organization_id
      and cb.source_system=r.source_system
      and cb.source_active=true
  ) as website_active_batches,
  (
    select count(*)
    from public.course_batches cb
    where cb.organization_id=r.organization_id
      and cb.source_system=r.source_system
      and cb.source_active=false
  ) as website_historical_batches,
  (
    select max(cb.last_synced_at)
    from public.course_batches cb
    where cb.organization_id=r.organization_id
      and cb.source_system=r.source_system
  ) as latest_batch_sync_at,
  r.organization_id
from latest_run r;

revoke all on public.v_course_catalog_sync_health_v2 from public,anon,authenticated;
grant select on public.v_course_catalog_sync_health_v2 to service_role;

create or replace view public.v_course_catalog_sync_health
with (security_invoker=true)
as
with latest_run as (
  select distinct on (r.organization_id,r.source_system)
    r.id,
    r.organization_id,
    r.source_system,
    r.status,
    r.trigger_type,
    r.courses_received,
    r.batches_received,
    r.courses_upserted,
    r.batches_upserted,
    r.batches_deactivated,
    r.request_metadata,
    r.error_message,
    r.started_at,
    r.completed_at
  from public.course_catalog_sync_runs r
  order by r.organization_id,r.source_system,r.started_at desc,r.id desc
)
select
  r.id as sync_run_id,
  r.source_system,
  r.status,
  r.trigger_type,
  r.courses_received,
  r.batches_received,
  r.courses_upserted,
  r.batches_upserted,
  r.batches_deactivated,
  r.error_message,
  r.started_at,
  r.completed_at,
  (
    select count(*)
    from public.course_batches cb
    where cb.organization_id=r.organization_id
      and cb.source_system=r.source_system
      and cb.source_active=true
  ) as website_active_batches,
  (
    select count(*)
    from public.course_batches cb
    where cb.organization_id=r.organization_id
      and cb.source_system=r.source_system
      and cb.source_active=false
  ) as website_historical_batches,
  (
    select max(cb.last_synced_at)
    from public.course_batches cb
    where cb.organization_id=r.organization_id
      and cb.source_system=r.source_system
  ) as latest_batch_sync_at,
  r.organization_id
from latest_run r;

revoke all on public.v_course_catalog_sync_health from public,anon;
grant select on public.v_course_catalog_sync_health to authenticated,service_role;