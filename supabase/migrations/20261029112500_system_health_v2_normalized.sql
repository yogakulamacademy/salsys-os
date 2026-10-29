-- PH-3 reliability/observability:
-- Normalize existing operational health plus canonical integrity/tracking/privacy/search
-- surfaces into one tenant-scoped read model. Existing V1 health views remain unchanged.

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
  case when c.health_status = 'healthy' then 'healthy' else 'warning' end::text
    as health_status,
  c.health_status::text as latest_status,
  null::timestamptz as latest_activity_at,
  null::timestamptz as last_success_at,
  null::timestamptz as last_failure_at,
  0::bigint as activity_24h,
  0::bigint as failures_24h,
  c.integrity_issue_count::bigint as pending_count,
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
  case when c.health_status = 'healthy' then 'healthy' else 'warning' end::text
    as health_status,
  c.health_status::text as latest_status,
  null::timestamptz as latest_activity_at,
  null::timestamptz as last_success_at,
  null::timestamptz as last_failure_at,
  0::bigint as activity_24h,
  0::bigint as failures_24h,
  c.integrity_issue_count::bigint as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when c.integrity_issue_count > 0
      then c.integrity_issue_count::text || ' actionable Customer 360 integrity issue(s) are open; '
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
  t.backend_status::text as latest_status,
  t.latest_universal_event_at as latest_activity_at,
  case
    when t.backend_status <> 'degraded' then t.latest_universal_event_at
    else null
  end as last_success_at,
  null::timestamptz as last_failure_at,
  t.universal_events_24h::bigint as activity_24h,
  t.stuck_processing_events_24h::bigint as failures_24h,
  t.stuck_processing_events_24h::bigint as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when t.backend_status = 'degraded'
      then 'Tracking degraded: '
        || t.dead_letter_events_7d::text || ' dead-letter event(s) in 7d, '
        || t.stuck_processing_events_24h::text || ' stuck processing event(s) in 24h, '
        || t.contract_rejected_events_7d::text || ' contract rejection(s) in 7d.'
    when t.backend_status = 'misconfigured'
      then 'Tracking source or consent configuration requires review.'
    when t.backend_status = 'not_live'
      then 'Tracking is configured but no universal events were observed in the current live window.'
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
    when p.overdue_subject_requests = 0
      and p.active_sources_not_honoring_gpc = 0
      then p.checked_at
    else null
  end as last_success_at,
  null::timestamptz as last_failure_at,
  0::bigint as activity_24h,
  0::bigint as failures_24h,
  p.overdue_subject_requests::bigint as pending_count,
  null::timestamptz as oldest_pending_at,
  null::numeric as oldest_pending_minutes,
  case
    when p.overdue_subject_requests > 0
      then p.overdue_subject_requests::text || ' privacy subject request(s) are overdue.'
    when p.active_sources_not_honoring_gpc > 0
      then p.active_sources_not_honoring_gpc::text || ' active tracking source(s) are not honoring GPC.'
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
      and s.oldest_waiting_at < now() - interval '60 minutes'
      then 'warning'
    else 'healthy'
  end::text as health_status,
  case
    when not s.indexing_enabled then 'disabled'
    when s.dead_letter > 0 then 'dead_letter'
    when s.retry > 0 then 'retrying'
    when (s.pending + s.processing + s.retry) > 0
      and s.oldest_waiting_at is not null
      and s.oldest_waiting_at < now() - interval '60 minutes'
      then 'backlog_stale'
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
    when s.oldest_waiting_at is null then null
    else (extract(epoch from (now() - s.oldest_waiting_at)) / 60.0)::numeric
  end as oldest_pending_minutes,
  case
    when not s.indexing_enabled then null
    when s.dead_letter > 0
      then s.dead_letter::text || ' search indexing item(s) are dead-lettered.'
    when s.retry > 0
      then s.retry::text || ' search indexing item(s) are waiting for retry.'
    when (s.pending + s.processing + s.retry) > 0
      and s.oldest_waiting_at is not null
      and s.oldest_waiting_at < now() - interval '60 minutes'
      then 'Search indexing backlog has items waiting longer than 60 minutes.'
    else null
  end::text as latest_error,
  case when s.indexing_enabled then 60 else null end::integer as stale_after_minutes,
  s.organization_id
from public.v_search_index_health_v1 s;

revoke all on public.v_system_health_v2 from public, anon, authenticated;
grant select on public.v_system_health_v2 to service_role;

comment on view public.v_system_health_v2 is
  'PH-3 normalized tenant-scoped operational health model. Preserves V1 systems and adds canonical CRM Core, Customer 360, Tracking, Privacy, and Search health with explicit inactive semantics.';

create or replace view public.v_system_health_summary_v2
with (security_invoker = true)
as
select
  h.organization_id,
  count(*)::bigint as total_systems,
  count(*) filter (where h.health_status = 'healthy')::bigint as healthy_systems,
  count(*) filter (where h.health_status = 'warning')::bigint as warning_systems,
  count(*) filter (where h.health_status = 'critical')::bigint as critical_systems,
  count(*) filter (where h.health_status = 'inactive')::bigint as inactive_systems,
  max(h.latest_activity_at) as latest_system_activity_at,
  now() as checked_at
from public.v_system_health_v2 h
group by h.organization_id;

revoke all on public.v_system_health_summary_v2 from public, anon, authenticated;
grant select on public.v_system_health_summary_v2 to service_role;

comment on view public.v_system_health_summary_v2 is
  'PH-3 normalized System Health summary with inactive systems counted separately from warning and critical states.';
