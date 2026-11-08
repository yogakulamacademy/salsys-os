-- R2-P3: operator-only, SELECT-only session-start receipt-time quality diagnostic.
-- This is NOT a retention KPI, public RPC, consent audit, or approved ingestion SLA.
-- Run only with a verified authorized tenant and an independently authorized read-only connection:
--   psql "$AUTHORIZED_DB_CONNECTION" -X -q -A -t -P pager=off -v ON_ERROR_STOP=1 \
--     -v organization_id='<verified-authorized-tenant-uuid>' -v days=30 \
--     -f docs/sql/r2-p3-event-time-quality-diagnostic-v1.sql
-- Never post database credentials, tenant/source identifiers or visitor/session IDs.
-- Aggregated counts describe SDK-reported occurred_at vs database received_at only.
-- Negative lag may reflect browser clock skew; positive lag may reflect retries/queues.
-- The 24-hour and 5-minute comparisons are RESEARCH BUCKETS, NOT validated policy.
-- No visitor/session keys, event payloads, URLs, contacts or per-event rows are returned.

with params as (
  select :'organization_id'::uuid as organization_id,
    :'days'::integer as days,
    (now() at time zone 'UTC')::date as today_utc,
    now() as captured_at
), bounded as materialized (
  select extract(epoch from (e.received_at - e.occurred_at)) as lag_seconds,
    (e.received_at > p.captured_at) as receipt_after_snapshot,
    (e.occurred_at > p.captured_at) as occurred_after_snapshot,
    e.metadata -> 'consent_snapshot' ->> 'analytics' as analytics_snapshot,
    e.metadata ->> 'sdk_version' as sdk_version
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  where p.days in (7,14,30)
    and e.event_family = 'web'
    and e.source_event_type = 'web.session_started'
    and e.occurred_at >= ((p.today_utc - (p.days - 1))::timestamp at time zone 'UTC')
    and e.occurred_at < ((p.today_utc + 1)::timestamp at time zone 'UTC')
    and e.received_at >= ((p.today_utc - p.days)::timestamp at time zone 'UTC')
    and e.received_at <= p.captured_at
  limit 50001
), volume as (
  select count(*)::bigint as candidate_events from bounded
), quality as (
  select
    count(*) filter (where lag_seconds < -300)::bigint as negative_beyond_5m,
    count(*) filter (where lag_seconds >= -300 and lag_seconds < 0)::bigint as negative_up_to_5m,
    count(*) filter (where lag_seconds >= 0 and lag_seconds <= 300)::bigint as positive_up_to_5m,
    count(*) filter (where lag_seconds > 300 and lag_seconds <= 3600)::bigint as positive_5m_to_1h,
    count(*) filter (where lag_seconds > 3600 and lag_seconds <= 86400)::bigint as positive_1h_to_24h,
    count(*) filter (where lag_seconds > 86400 and lag_seconds <= 172800)::bigint as positive_24h_to_48h,
    count(*) filter (where lag_seconds > 172800)::bigint as positive_beyond_48h,
    count(*) filter (where occurred_after_snapshot)::bigint as client_event_time_after_snapshot,
    count(*) filter (where analytics_snapshot = 'granted')::bigint as client_granted_snapshot,
    count(*) filter (where analytics_snapshot is distinct from 'granted')::bigint as client_missing_or_other_snapshot,
    count(distinct sdk_version)::bigint as sdk_version_count,
    round((min(lag_seconds) / 60)::numeric, 2) as minimum_lag_minutes,
    round((max(lag_seconds) / 3600)::numeric, 2) as maximum_lag_hours
  from bounded
)
select jsonb_build_object(
  'report','r2_p3_event_time_quality_diagnostic_v1',
  'status',case
    when p.days not in (7,14,30) or p.days is null then 'invalid_window'
    when v.candidate_events > 50000 then 'volume_limit'
    when v.candidate_events = 0 then 'no_observations'
    else 'observational_only'
  end,
  'window_days',p.days,
  'first_utc_day',to_char(p.today_utc - (p.days - 1), 'YYYY-MM-DD'),
  'last_utc_day',to_char(p.today_utc, 'YYYY-MM-DD'),
  'current_utc_day_incomplete',true,
  'sampled_at_utc',to_char(p.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'candidate_events',v.candidate_events,
  'quality',case
    when p.days in (7,14,30) and v.candidate_events <= 50000 then
      jsonb_build_object(
        'negative_beyond_5m',q.negative_beyond_5m,
        'negative_up_to_5m',q.negative_up_to_5m,
        'positive_up_to_5m',q.positive_up_to_5m,
        'positive_5m_to_1h',q.positive_5m_to_1h,
        'positive_1h_to_24h',q.positive_1h_to_24h,
        'positive_24h_to_48h',q.positive_24h_to_48h,
        'positive_beyond_48h',q.positive_beyond_48h,
        'client_event_time_after_snapshot',q.client_event_time_after_snapshot,
        'client_granted_snapshot',q.client_granted_snapshot,
        'client_missing_or_other_snapshot',q.client_missing_or_other_snapshot,
        'sdk_version_count',q.sdk_version_count,
        'minimum_lag_minutes',q.minimum_lag_minutes,
        'maximum_lag_hours',q.maximum_lag_hours
      )
    else '{}'::jsonb
  end,
  'thresholds_are_approved_sla',false,
  'is_retention_kpi',false,
  'proves_history_completeness',false,
  'is_authenticated_role_test',false
) as event_time_quality_aggregates_only
from params p cross join volume v cross join quality q;
