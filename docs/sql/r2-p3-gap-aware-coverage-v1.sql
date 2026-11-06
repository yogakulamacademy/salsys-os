-- R2-P3 operator-only gap-aware UTC coverage diagnostic (research, SELECT only).
-- It observes session-start DATE coverage; zero starts does NOT prove an ingest outage.
-- Run only with a separately authorized read-only connection for a verified tenant:
-- psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
--   -v organization_id='<authorized-tenant-uuid>' -v window_days=30 \
--   -v return_day=30 -f docs/sql/r2-p3-gap-aware-coverage-v1.sql
-- Allowed window_days: 7/14/30; return_day: 1/7/30.
-- The returned JSON has no tenant/source/visitor/session/event identifiers,
-- event payloads, URLs, cohort counts or retention percentages.
with params as (
  select :'organization_id'::uuid as organization_id,
    :'window_days'::integer as window_days,
    :'return_day'::integer as return_day,
    (now() at time zone 'UTC')::date as as_of_utc
), bounds as (
  select p.*,
    p.as_of_utc - 1 as last_closed_utc_day,
    p.as_of_utc - 1 - p.return_day as last_candidate_cohort_day,
    p.as_of_utc - 1 - p.return_day - (p.window_days - 1) as first_candidate_cohort_day,
    p.as_of_utc - 1 - p.return_day - (p.window_days - 1) - 30 as first_required_utc_day
  from params p
), calendar as (
  select (b.first_required_utc_day + offset_n.i)::date as utc_day
  from bounds b
  cross join lateral generate_series(
    0,
    case when b.window_days in (7,14,30) and b.return_day in (1,7,30)
      then 30 + b.window_days - 1 + b.return_day else -1 end
  ) as offset_n(i)
), bounded as materialized (
  select (e.occurred_at at time zone 'UTC')::date as utc_day,
    (e.metadata -> 'consent_snapshot' ->> 'analytics') = 'granted' as has_granted_snapshot
  from public.raw_events e
  join bounds b on e.organization_id = b.organization_id
  where b.window_days in (7,14,30) and b.return_day in (1,7,30)
    and e.event_family = 'web'
    and e.source_event_type = 'web.session_started'
    and e.occurred_at >= (b.first_required_utc_day::timestamp at time zone 'UTC')
    and e.occurred_at < (b.as_of_utc::timestamp at time zone 'UTC')
    -- As-of midnight is a reporting cutoff, not a verified ingest watermark.
    and e.received_at < (b.as_of_utc::timestamp at time zone 'UTC')
    and e.received_at >= ((b.first_required_utc_day - 1)::timestamp at time zone 'UTC')
  order by e.occurred_at,e.id
  limit 50001
), volume as (
  select count(*)::bigint as candidate_events from bounded
), daily as (
  select c.utc_day,
    count(b.utc_day)::bigint as session_start_receipts,
    count(b.utc_day) filter (where b.has_granted_snapshot is true)::bigint as granted_snapshot_receipts,
    count(b.utc_day) filter (where b.has_granted_snapshot is not true)::bigint as other_snapshot_receipts
  from calendar c left join bounded b on c.utc_day = b.utc_day
  group by c.utc_day
), summary as (
  select count(*)::int as required_utc_days,
    count(*) filter (where session_start_receipts > 0)::int as days_with_observed_session_starts,
    count(*) filter (where session_start_receipts = 0)::int as days_without_observed_session_starts,
    min(utc_day) as earliest_required_utc_day,
    max(utc_day) as latest_required_utc_day,
    min(utc_day) filter (where session_start_receipts > 0) as first_observed_utc_day,
    max(utc_day) filter (where session_start_receipts > 0) as last_observed_utc_day,
    sum(granted_snapshot_receipts)::bigint as granted_snapshot_receipts,
    sum(other_snapshot_receipts)::bigint as other_snapshot_receipts
  from daily
)
select jsonb_build_object(
  'report','r2_p3_gap_aware_coverage_research_v1',
  'status',case
    when p.window_days not in (7,14,30) or p.return_day not in (1,7,30)
      or p.window_days is null or p.return_day is null then 'invalid_contract'
    when v.candidate_events > 50000 then 'volume_limit'
    else 'coverage_observation_only' end,
  'as_of_utc',p.as_of_utc,
  'window_days',p.window_days,
  'return_day',p.return_day,
  'first_candidate_cohort_day',case when p.window_days in (7,14,30)
    and p.return_day in (1,7,30) then b.first_candidate_cohort_day else null end,
  'last_candidate_cohort_day',case when p.window_days in (7,14,30)
    and p.return_day in (1,7,30) then b.last_candidate_cohort_day else null end,
  'required_utc_days',case when v.candidate_events <= 50000 then s.required_utc_days else null end,
  'earliest_required_utc_day',case when v.candidate_events <= 50000 then s.earliest_required_utc_day else null end,
  'latest_required_utc_day',case when v.candidate_events <= 50000 then s.latest_required_utc_day else null end,
  'days_with_observed_session_starts',case when v.candidate_events <= 50000
    then s.days_with_observed_session_starts else null end,
  'days_without_observed_session_starts',case when v.candidate_events <= 50000
    then s.days_without_observed_session_starts else null end,
  'first_observed_utc_day',case when v.candidate_events <= 50000 then s.first_observed_utc_day else null end,
  'last_observed_utc_day',case when v.candidate_events <= 50000 then s.last_observed_utc_day else null end,
  'candidate_session_start_receipts',case when v.candidate_events <= 50000
    then v.candidate_events else null end,
  'candidate_receipt_limit_exceeded',v.candidate_events > 50000,
  'granted_metadata_snapshot_receipts',case when v.candidate_events <= 50000
    then s.granted_snapshot_receipts else null end,
  'missing_or_not_granted_snapshot_receipts',case when v.candidate_events <= 50000
    then s.other_snapshot_receipts else null end,
  'last_closed_day_ingestion_attested',false,
  'source_coverage_attested',false,
  'identity_and_consent_continuity_verified',false,
  'is_retention_kpi',false,
  'is_authenticated_role_test',false
) as aggregate_coverage_only
from params p cross join bounds b cross join volume v cross join summary s;
