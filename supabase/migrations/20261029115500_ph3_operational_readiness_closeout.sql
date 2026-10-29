-- PH-3 operational-readiness closeout.
--
-- Goals:
-- 1. Version the normalized System Health V2 contract that is already live in
--    production so the database state is reproducible from the repository.
-- 2. Add a separate operational-readiness read model for capabilities whose
--    truthful state may be healthy, warning, critical, inactive, or
--    configuration_blocked.
-- 3. Preserve the original v_system_health / System Health page semantics.

create or replace view public.v_system_health_v2
with (security_invoker = true)
as
select
  h.system_key,
  h.system_name,
  h.system_group,
  h.health_status,
  h.latest_status,
  h.latest_activity_at,
  h.last_success_at,
  h.last_failure_at,
  h.activity_24h,
  h.failures_24h,
  h.pending_count,
  h.oldest_pending_at,
  h.oldest_pending_minutes,
  h.latest_error,
  h.stale_after_minutes,
  h.organization_id
from public.v_system_health h

union all

select
  'crm_core_integrity'::text as system_key,
  'CRM Core Integrity'::text as system_name,
  'data_integrity'::text as system_group,
  case when c.health_status = 'healthy' then 'healthy' else 'warning' end::text as health_status,
  c.health_status as latest_status,
  null::timestamptz as latest_activity_at,
  null::timestamptz as last_success_at,
  null::timestamptz as last_failure_at,
  0::bigint as activity_24h,
  0::bigint as failures_24h,
  c.integrity_issue_count as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when c.integrity_issue_count > 0
      then c.integrity_issue_count::text || ' actionable CRM core integrity issue(s) are open.'
    else null
  end::text as latest_error,
  null::integer as stale_after_minutes,
  c.organization_id
from public.v_crm_core_integrity_health_v2 c

union all

select
  'customer360_integrity'::text as system_key,
  'Customer 360 Integrity'::text as system_name,
  'data_integrity'::text as system_group,
  case when c.health_status = 'healthy' then 'healthy' else 'warning' end::text as health_status,
  c.health_status as latest_status,
  null::timestamptz as latest_activity_at,
  null::timestamptz as last_success_at,
  null::timestamptz as last_failure_at,
  0::bigint as activity_24h,
  0::bigint as failures_24h,
  c.integrity_issue_count as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when c.integrity_issue_count > 0 then
      c.integrity_issue_count::text || ' actionable Customer 360 integrity issue(s) are open; '
      || c.open_identity_conflicts::text || ' unresolved identity conflict(s).'
    else null
  end::text as latest_error,
  null::integer as stale_after_minutes,
  c.organization_id
from public.v_customer360_identity_integrity_health_v2 c

union all

select
  'tracking_live'::text as system_key,
  'Universal Tracking'::text as system_name,
  'tracking'::text as system_group,
  case
    when t.backend_status = 'degraded' then 'critical'
    when t.backend_status in ('misconfigured', 'not_live') then 'warning'
    else 'healthy'
  end::text as health_status,
  t.backend_status as latest_status,
  t.latest_universal_event_at as latest_activity_at,
  case when t.backend_status <> 'degraded' then t.latest_universal_event_at else null end as last_success_at,
  null::timestamptz as last_failure_at,
  t.universal_events_24h as activity_24h,
  t.stuck_processing_events_24h as failures_24h,
  t.stuck_processing_events_24h as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when t.backend_status = 'degraded' then
      'Tracking degraded: ' || t.dead_letter_events_7d::text || ' dead-letter event(s) in 7d, '
      || t.stuck_processing_events_24h::text || ' stuck processing event(s) in 24h, '
      || t.contract_rejected_events_7d::text || ' contract rejection(s) in 7d.'
    when t.backend_status = 'misconfigured' then 'Tracking source or consent configuration requires review.'
    when t.backend_status = 'not_live' then 'Tracking is configured but no universal events were observed in the current live window.'
    else null
  end::text as latest_error,
  null::integer as stale_after_minutes,
  t.organization_id
from public.v_tracking_live_closeout_health_v1 t

union all

select
  'privacy_compliance'::text as system_key,
  'Privacy Compliance'::text as system_name,
  'compliance'::text as system_group,
  case
    when p.overdue_subject_requests > 0 then 'critical'
    when p.active_sources_not_honoring_gpc > 0 then 'warning'
    else 'healthy'
  end::text as health_status,
  case
    when p.overdue_subject_requests > 0 then 'overdue_subject_requests'
    when p.active_sources_not_honoring_gpc > 0 then 'gpc_configuration_attention'
    else 'compliant'
  end::text as latest_status,
  p.checked_at as latest_activity_at,
  case
    when p.overdue_subject_requests = 0 and p.active_sources_not_honoring_gpc = 0 then p.checked_at
    else null
  end as last_success_at,
  null::timestamptz as last_failure_at,
  0::bigint as activity_24h,
  0::bigint as failures_24h,
  p.overdue_subject_requests as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when p.overdue_subject_requests > 0 then p.overdue_subject_requests::text || ' privacy subject request(s) are overdue.'
    when p.active_sources_not_honoring_gpc > 0 then p.active_sources_not_honoring_gpc::text || ' active tracking source(s) are not honoring GPC.'
    else null
  end::text as latest_error,
  null::integer as stale_after_minutes,
  p.organization_id
from public.v_privacy_compliance_health p

union all

select
  'search_index'::text as system_key,
  'Search Indexing'::text as system_name,
  'search'::text as system_group,
  case
    when not s.indexing_enabled then 'inactive'
    when s.dead_letter > 0 then 'critical'
    when s.retry > 0 then 'warning'
    when (s.pending + s.processing + s.retry) > 0
      and s.oldest_waiting_at is not null
      and s.oldest_waiting_at < now() - interval '1 hour' then 'warning'
    else 'healthy'
  end::text as health_status,
  case
    when not s.indexing_enabled then 'disabled'
    when s.dead_letter > 0 then 'dead_letter'
    when s.retry > 0 then 'retrying'
    when (s.pending + s.processing + s.retry) > 0
      and s.oldest_waiting_at is not null
      and s.oldest_waiting_at < now() - interval '1 hour' then 'backlog_stale'
    else 'active'
  end::text as latest_status,
  s.last_completed_at as latest_activity_at,
  s.last_completed_at as last_success_at,
  null::timestamptz as last_failure_at,
  0::bigint as activity_24h,
  0::bigint as failures_24h,
  (s.pending + s.processing + s.retry)::bigint as pending_count,
  s.oldest_waiting_at as oldest_pending_at,
  case
    when s.oldest_waiting_at is null then null::numeric
    else extract(epoch from now() - s.oldest_waiting_at) / 60.0
  end as oldest_pending_minutes,
  case
    when not s.indexing_enabled then null
    when s.dead_letter > 0 then s.dead_letter::text || ' search indexing item(s) are dead-lettered.'
    when s.retry > 0 then s.retry::text || ' search indexing item(s) are waiting for retry.'
    when (s.pending + s.processing + s.retry) > 0
      and s.oldest_waiting_at is not null
      and s.oldest_waiting_at < now() - interval '1 hour'
      then 'Search indexing backlog has items waiting longer than 60 minutes.'
    else null
  end::text as latest_error,
  case when s.indexing_enabled then 60 else null end::integer as stale_after_minutes,
  s.organization_id
from public.v_search_index_health_v1 s;

create or replace view public.v_system_health_summary_v2
with (security_invoker = true)
as
select
  h.organization_id,
  count(*) as total_systems,
  count(*) filter (where h.health_status = 'healthy') as healthy_systems,
  count(*) filter (where h.health_status = 'warning') as warning_systems,
  count(*) filter (where h.health_status = 'critical') as critical_systems,
  count(*) filter (where h.health_status = 'inactive') as inactive_systems,
  max(h.latest_activity_at) as latest_system_activity_at,
  now() as checked_at
from public.v_system_health_v2 h
group by h.organization_id;

revoke all on public.v_system_health_v2 from public, anon, authenticated;
revoke all on public.v_system_health_summary_v2 from public, anon, authenticated;
grant select on public.v_system_health_v2 to service_role;
grant select on public.v_system_health_summary_v2 to service_role;

-- Dedicated readiness rollups. These intentionally model configured-but-blocked
-- and inactive capabilities separately from active runtime incidents.
create or replace view public.v_system_operational_readiness_v1
with (security_invoker = true)
as
with
feedback as (
  select
    h.organization_id,
    coalesce(sum(h.route_count), 0)::bigint as route_count,
    coalesce(sum(h.active_route_count), 0)::bigint as active_route_count,
    coalesce(sum(h.queued_count), 0)::bigint as queued_count,
    coalesce(sum(h.in_flight_count), 0)::bigint as in_flight_count,
    coalesce(sum(h.failed_count), 0)::bigint as failed_count,
    max(h.last_attempt_at) as last_attempt_at,
    max(h.last_delivered_at) as last_delivered_at
  from public.v_r7_integration_feedback_health_v1 h
  group by h.organization_id
),
automation as (
  select
    o.id as organization_id,
    count(w.id) filter (where w.status = 'active')::bigint as active_workflows,
    count(w.id) filter (where w.status = 'active' and w.runtime_flow_enabled = true)::bigint as runtime_enabled_workflows,
    (select count(*) from public.automation_runs r where r.organization_id = o.id and r.created_at >= now() - interval '24 hours')::bigint as runs_24h,
    (select count(*) from public.automation_runs r where r.organization_id = o.id and r.created_at >= now() - interval '24 hours' and r.status = 'failed')::bigint as failed_runs_24h,
    (select count(*) from public.automation_scheduled_jobs j where j.organization_id = o.id and j.status = 'scheduled' and j.scheduled_for <= now())::bigint as due_jobs,
    (select count(*) from public.automation_scheduled_jobs j where j.organization_id = o.id and j.status = 'failed')::bigint as failed_jobs,
    (select count(*) from public.automation_wait_states s where s.organization_id = o.id and s.status = 'waiting' and coalesce(s.timeout_at, s.resume_at) < now())::bigint as overdue_waits
  from public.organizations o
  left join public.automation_workflows w on w.organization_id = o.id
  group by o.id
),
scheduler as (
  select s.enabled, s.last_invoked_at, s.last_outcome
  from public.automation_scheduler_settings s
  order by s.id desc
  limit 1
),
instagram as (
  select
    o.id as organization_id,
    count(r.id)::bigint as total_rules,
    count(r.id) filter (where r.active = true)::bigint as active_rules,
    max(case when p.automation_enabled then 1 else 0 end)::integer as automation_enabled,
    (select count(*) from public.instagram_automation_runs x where x.organization_id = o.id and x.created_at >= now() - interval '24 hours')::bigint as runs_24h,
    (select count(*) from public.instagram_automation_runs x where x.organization_id = o.id and x.created_at >= now() - interval '24 hours' and x.status = 'failed')::bigint as failed_runs_24h,
    (select max(x.created_at) from public.instagram_automation_runs x where x.organization_id = o.id) as last_run_at
  from public.organizations o
  left join public.instagram_automation_rules r on r.organization_id = o.id
  left join public.instagram_channel_policies p on p.organization_id = o.id
  group by o.id
),
latest_course_sync as (
  select distinct on (h.organization_id)
    h.organization_id,
    h.status,
    h.trigger_type,
    h.error_message,
    h.started_at,
    h.completed_at,
    h.website_active_batches,
    h.website_historical_batches
  from public.v_course_catalog_sync_health_v2 h
  order by h.organization_id, coalesce(h.completed_at, h.started_at) desc nulls last
)
select
  t.organization_id,
  'tracking'::text as readiness_key,
  'Universal Tracking'::text as readiness_name,
  'tracking'::text as readiness_group,
  case
    when t.backend_status = 'degraded' then 'critical'
    when t.backend_status in ('misconfigured', 'not_live') then 'warning'
    else 'healthy'
  end::text as health_status,
  t.backend_status::text as operational_status,
  true as active,
  (t.dead_letter_events_7d + t.stuck_processing_events_24h + t.contract_rejected_events_7d)::bigint as issue_count,
  jsonb_build_object(
    'events_24h', t.universal_events_24h,
    'dead_letter_7d', t.dead_letter_events_7d,
    'stuck_processing_24h', t.stuck_processing_events_24h,
    'contract_rejected_7d', t.contract_rejected_events_7d,
    'latest_event_at', t.latest_universal_event_at
  ) as details,
  t.checked_at
from public.v_tracking_live_closeout_health_v1 t

union all

select
  p.organization_id,
  'privacy'::text,
  'Privacy Compliance'::text,
  'compliance'::text,
  case
    when p.overdue_subject_requests > 0 then 'critical'
    when p.active_sources_not_honoring_gpc > 0 then 'warning'
    else 'healthy'
  end::text,
  case
    when p.overdue_subject_requests > 0 then 'overdue_subject_requests'
    when p.active_sources_not_honoring_gpc > 0 then 'gpc_configuration_attention'
    else 'compliant'
  end::text,
  true,
  (p.overdue_subject_requests + p.active_sources_not_honoring_gpc)::bigint,
  jsonb_build_object(
    'enabled_purposes', p.enabled_purposes,
    'strict_tracking_sources', p.strict_tracking_sources,
    'overdue_subject_requests', p.overdue_subject_requests,
    'sources_not_honoring_gpc', p.active_sources_not_honoring_gpc,
    'active_legal_holds', p.active_legal_holds
  ),
  p.checked_at
from public.v_privacy_compliance_health p

union all

select
  s.organization_id,
  'search_indexing'::text,
  'Search Indexing'::text,
  'search'::text,
  case
    when not s.indexing_enabled then 'inactive'
    when s.dead_letter > 0 then 'critical'
    when s.retry > 0 then 'warning'
    when (s.pending + s.processing + s.retry) > 0 and s.oldest_waiting_at < now() - interval '1 hour' then 'warning'
    else 'healthy'
  end::text,
  case
    when not s.indexing_enabled then 'disabled'
    when s.dead_letter > 0 then 'dead_letter'
    when s.retry > 0 then 'retrying'
    when (s.pending + s.processing + s.retry) > 0 and s.oldest_waiting_at < now() - interval '1 hour' then 'backlog_stale'
    else 'active'
  end::text,
  s.indexing_enabled,
  case when s.indexing_enabled then (s.dead_letter + s.retry)::bigint else 0::bigint end,
  jsonb_build_object(
    'pending', s.pending,
    'processing', s.processing,
    'retry', s.retry,
    'dead_letter', s.dead_letter,
    'done', s.done,
    'oldest_waiting_at', s.oldest_waiting_at,
    'last_completed_at', s.last_completed_at
  ),
  s.checked_at
from public.v_search_index_health_v1 s

union all

select
  o.id,
  'conversion_feedback'::text,
  'Conversion Feedback'::text,
  'feedback'::text,
  case
    when coalesce(f.active_route_count, 0) = 0 then 'inactive'
    when coalesce(f.failed_count, 0) > 0 then 'warning'
    else 'healthy'
  end::text,
  case
    when coalesce(f.active_route_count, 0) = 0 then 'feedback_not_active'
    when coalesce(f.failed_count, 0) > 0 then 'delivery_failures_present'
    else 'active'
  end::text,
  coalesce(f.active_route_count, 0) > 0,
  case when coalesce(f.active_route_count, 0) > 0 then coalesce(f.failed_count, 0) else 0 end::bigint,
  jsonb_build_object(
    'route_count', coalesce(f.route_count, 0),
    'active_route_count', coalesce(f.active_route_count, 0),
    'queued_count', coalesce(f.queued_count, 0),
    'in_flight_count', coalesce(f.in_flight_count, 0),
    'failed_count', coalesce(f.failed_count, 0),
    'last_attempt_at', f.last_attempt_at,
    'last_delivered_at', f.last_delivered_at
  ),
  now()
from public.organizations o
left join feedback f on f.organization_id = o.id

union all

select
  a.organization_id,
  'automation_runtime'::text,
  'Automation Runtime'::text,
  'automation'::text,
  case
    when a.active_workflows = 0 and a.runtime_enabled_workflows = 0 then 'inactive'
    when coalesce(sc.enabled, false) = false then 'configuration_blocked'
    when a.failed_jobs > 0 or a.overdue_waits > 0 then 'critical'
    when a.failed_runs_24h > 0 or a.due_jobs > 0 then 'warning'
    else 'healthy'
  end::text,
  case
    when a.active_workflows = 0 and a.runtime_enabled_workflows = 0 then 'no_active_workflows'
    when coalesce(sc.enabled, false) = false then 'scheduler_disabled'
    when a.failed_jobs > 0 or a.overdue_waits > 0 then 'runtime_blocked'
    when a.failed_runs_24h > 0 or a.due_jobs > 0 then 'runtime_attention'
    else 'active'
  end::text,
  a.active_workflows > 0 or a.runtime_enabled_workflows > 0,
  case
    when a.active_workflows = 0 and a.runtime_enabled_workflows = 0 then 0::bigint
    else (a.failed_runs_24h + a.due_jobs + a.failed_jobs + a.overdue_waits)::bigint
  end,
  jsonb_build_object(
    'active_workflows', a.active_workflows,
    'runtime_enabled_workflows', a.runtime_enabled_workflows,
    'runs_24h', a.runs_24h,
    'failed_runs_24h', a.failed_runs_24h,
    'due_jobs', a.due_jobs,
    'failed_jobs', a.failed_jobs,
    'overdue_waits', a.overdue_waits,
    'scheduler_enabled', coalesce(sc.enabled, false),
    'scheduler_last_invoked_at', sc.last_invoked_at,
    'scheduler_last_outcome', sc.last_outcome
  ),
  now()
from automation a
left join scheduler sc on true

union all

select
  i.organization_id,
  'instagram_automation'::text,
  'Instagram Automation'::text,
  'automation'::text,
  case
    when i.active_rules = 0 or coalesce(i.automation_enabled, 0) = 0 then 'inactive'
    when i.failed_runs_24h > 0 then 'warning'
    else 'healthy'
  end::text,
  case
    when i.active_rules = 0 then 'no_active_rules'
    when coalesce(i.automation_enabled, 0) = 0 then 'automation_disabled'
    when i.failed_runs_24h > 0 then 'runtime_failures_present'
    else 'active'
  end::text,
  i.active_rules > 0 and coalesce(i.automation_enabled, 0) = 1,
  case
    when i.active_rules > 0 and coalesce(i.automation_enabled, 0) = 1 then i.failed_runs_24h
    else 0::bigint
  end,
  jsonb_build_object(
    'total_rules', i.total_rules,
    'active_rules', i.active_rules,
    'automation_enabled', coalesce(i.automation_enabled, 0) = 1,
    'runs_24h', i.runs_24h,
    'failed_runs_24h', i.failed_runs_24h,
    'last_run_at', i.last_run_at
  ),
  now()
from instagram i

union all

select
  o.id,
  'course_catalog_sync'::text,
  'Course Catalog Sync'::text,
  'catalog'::text,
  case
    when c.organization_id is null then 'inactive'
    when lower(coalesce(c.status, '')) in ('failed', 'error') then 'warning'
    else 'healthy'
  end::text,
  case
    when c.organization_id is null then 'not_run'
    when lower(coalesce(c.status, '')) in ('failed', 'error') then 'last_manual_sync_failed'
    when c.trigger_type = 'manual' then 'manual_success'
    else lower(coalesce(c.status, 'unknown'))
  end::text,
  false,
  case when lower(coalesce(c.status, '')) in ('failed', 'error') then 1 else 0 end::bigint,
  jsonb_build_object(
    'trigger_type', c.trigger_type,
    'last_status', c.status,
    'error_message', c.error_message,
    'started_at', c.started_at,
    'completed_at', c.completed_at,
    'website_active_batches', c.website_active_batches,
    'website_historical_batches', c.website_historical_batches
  ),
  now()
from public.organizations o
left join latest_course_sync c on c.organization_id = o.id

union all

select
  m.organization_id,
  'meta_ads_readiness'::text,
  'Meta Ads Readiness'::text,
  'integrations'::text,
  case
    when m.operational_state = 'configuration_blocked' then 'configuration_blocked'
    else m.health_status
  end::text,
  m.operational_state::text,
  m.connection_id is not null,
  case when m.blocker_code is null then 0 else 1 end::bigint,
  jsonb_build_object(
    'blocker_code', m.blocker_code,
    'blocker_message', m.blocker_message,
    'connection_status', m.connection_status,
    'ads_permission_present', m.ads_permission_present,
    'selected_asset_count', m.selected_asset_count,
    'discovered_asset_count', m.discovered_asset_count,
    'last_sync_status', m.last_sync_status,
    'last_sync_completed_at', m.last_sync_completed_at
  ),
  m.checked_at
from public.v_meta_ads_operational_health_v1 m;

revoke all on public.v_system_operational_readiness_v1 from public, anon, authenticated;
grant select on public.v_system_operational_readiness_v1 to service_role;
