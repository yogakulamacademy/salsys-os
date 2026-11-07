-- R2-P3 retention-readiness diagnostic, READ ONLY, no raw identifiers returned.
-- Run with a verified authorized tenant: psql -v organization_id='<UUID>' -f docs/sql/r2-p3-retention-readiness-v1.sql
-- This SQL is for a trusted operator connection, NOT a public/CRM RPC.
-- A visitor key is a browser/source identifier, never a deduplicated person.
-- This intentionally reports eligibility evidence only, not a retention percentage.

with
params as (
  select :'organization_id'::uuid as organization_id,
    (now() at time zone 'UTC')::date as today_utc
),
history as (
  select min((e.occurred_at at time zone 'UTC')::date) as earliest_utc_date,
    max((e.occurred_at at time zone 'UTC')::date) as last_utc_date,
    count(*)::bigint as web_events_in_history,
    -- Observation is NOT ingestion completeness: a zero-event day could be
    -- legitimate inactivity, missing instrumentation, or delayed delivery.
    -- Never treat the earliest/latest event span as a verified 60-day history.
    count(distinct (e.occurred_at at time zone 'UTC')::date)
      filter (where (e.occurred_at at time zone 'UTC')::date >= p.today_utc - 30
        and (e.occurred_at at time zone 'UTC')::date < p.today_utc)::integer
      as observed_closed_utc_days_last_30,
    count(distinct (e.occurred_at at time zone 'UTC')::date)
      filter (where (e.occurred_at at time zone 'UTC')::date >= p.today_utc - 60
        and (e.occurred_at at time zone 'UTC')::date < p.today_utc)::integer
      as observed_closed_utc_days_last_60
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  where e.event_family = 'web'
),
-- The 30-day diagnostic is one observed UTC calendar window ending today.
bounded as materialized (
  select e.tracking_source_id, e.anonymous_visitor_id, e.session_key,
    (e.occurred_at at time zone 'UTC')::date as activity_utc_day,
    e.metadata -> 'consent_snapshot' ->> 'analytics' as analytics_snapshot,
    e.metadata ->> 'sdk_version' as sdk_version
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  where e.event_family = 'web'
    and e.source_event_type = 'web.session_started'
    and e.occurred_at >= ((p.today_utc - 29)::timestamp at time zone 'UTC')
    and e.occurred_at < ((p.today_utc + 1)::timestamp at time zone 'UTC')
    and e.received_at >= ((p.today_utc - 30)::timestamp at time zone 'UTC')
  order by e.occurred_at, e.id
  limit 50001
),
volume as (
  select count(*)::bigint as candidate_events from bounded
),
qualified as materialized (
  select tracking_source_id, anonymous_visitor_id, session_key, activity_utc_day
  from bounded
  where (select candidate_events <= 50000 from volume)
    and analytics_snapshot = 'granted'
    and tracking_source_id is not null
    and nullif(anonymous_visitor_id,'') is not null
    and nullif(session_key,'') is not null
),
per_session as (
  select tracking_source_id, anonymous_visitor_id, session_key,
    count(*)::bigint as session_start_events,
    count(distinct activity_utc_day)::bigint as dates_per_session,
    min(activity_utc_day) as first_day,
    max(activity_utc_day) as last_day
  from qualified
  group by tracking_source_id,anonymous_visitor_id,session_key
),
per_visitor as (
  select tracking_source_id, anonymous_visitor_id,
    count(*)::bigint as observed_session_keys,
    count(distinct first_day)::bigint as observed_session_start_days,
    min(first_day) as first_day,
    max(last_day) as last_day
  from per_session
  group by tracking_source_id, anonymous_visitor_id
),
session_totals as (
  select count(*)::bigint as distinct_session_keys,
    count(*) filter (where session_start_events > 1)::bigint as duplicate_start_keys,
    count(*) filter (where dates_per_session > 1)::bigint as session_keys_spanning_utc_dates
  from per_session
),
visitor_totals as (
  select count(*)::bigint as observed_browser_keys,
    count(*) filter (where observed_session_keys > 1)::bigint as browser_keys_with_repeat_sessions,
    count(*) filter (where observed_session_keys > 1 and observed_session_start_days = 1)::bigint as same_day_repeat_browser_keys,
    count(*) filter (where observed_session_start_days > 1)::bigint as multiple_day_browser_keys,
    count(*) filter (where last_day >= first_day + 7)::bigint as keys_spanning_7_days,
    count(*) filter (where last_day >= first_day + 14)::bigint as keys_spanning_14_days
  from per_visitor
),
quality as (
  select count(*) filter (where analytics_snapshot = 'granted')::bigint as granted_start_events,
    count(*) filter (where analytics_snapshot is distinct from 'granted')::bigint as missing_or_not_granted_start_events,
    count(*) filter (where tracking_source_id is null
      or nullif(anonymous_visitor_id,'') is null
      or nullif(session_key,'') is null)::bigint as incomplete_identity_events,
    count(distinct sdk_version)::bigint as observed_sdk_versions
  from bounded
)
select jsonb_build_object(
  'report','r2_p3_retention_readiness_v1',
  'status','not_ready_for_retention_kpi',
  'history_first_utc_date',h.earliest_utc_date,
  'history_last_utc_date',h.last_utc_date,
  'history_calendar_days',case when h.earliest_utc_date is null
    then 0 else p.today_utc - h.earliest_utc_date + 1 end,
  'history_at_least_60_calendar_days',
    coalesce(p.today_utc - h.earliest_utc_date + 1 >= 60,false),
  'observed_closed_utc_days_last_30', h.observed_closed_utc_days_last_30,
  'observed_closed_utc_days_last_60', h.observed_closed_utc_days_last_60,
  'closed_utc_days_without_web_observations_last_60',
    60 - h.observed_closed_utc_days_last_60,
  'current_utc_day_incomplete', true,
  'history_completeness_verified', false,
  'candidate_session_start_events',v.candidate_events,
  'report_volume_limit_exceeded',v.candidate_events > 50000,
  'analytics_granted_session_starts',q.granted_start_events,
  'missing_or_not_granted_session_starts',q.missing_or_not_granted_start_events,
  'incomplete_identity_session_starts',q.incomplete_identity_events,
  'sdk_versions_in_window',q.observed_sdk_versions,
  'distinct_observed_session_keys',
    case when v.candidate_events > 50000 then null else s.distinct_session_keys end,
  'duplicate_session_start_keys',
    case when v.candidate_events > 50000 then null else s.duplicate_start_keys end,
  'session_keys_spanning_utc_dates',
    case when v.candidate_events > 50000 then null else s.session_keys_spanning_utc_dates end,
  'observed_browser_keys',
    case when v.candidate_events > 50000 then null else u.observed_browser_keys end,
  'browser_keys_with_repeat_sessions',
    case when v.candidate_events > 50000 then null else u.browser_keys_with_repeat_sessions end,
  'same_day_repeat_browser_keys',
    case when v.candidate_events > 50000 then null else u.same_day_repeat_browser_keys end,
  'multiple_day_browser_keys',
    case when v.candidate_events > 50000 then null else u.multiple_day_browser_keys end,
  'keys_spanning_7_days',
    case when v.candidate_events > 50000 then null else u.keys_spanning_7_days end,
  'keys_spanning_14_days',
    case when v.candidate_events > 50000 then null else u.keys_spanning_14_days end,
  'identity_and_consent_continuity','requires_controlled_browser_validation',
  'cohort_first_seen_definition','not_verified',
  'observed_metrics_are_people',false
) as aggregate_evidence_only
from params p
cross join history h
cross join volume v
cross join quality q
cross join session_totals s
cross join visitor_totals u;
