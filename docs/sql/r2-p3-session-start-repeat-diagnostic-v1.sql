-- R2-P3: operator-only SELECT-only session-start repeat-key diagnostic.
-- Research / data quality ONLY; not retention, real-user ID, bot classification,
-- replay certification, or source uptime evidence.
-- psql "$AUTHORIZED_DB_CONNECTION" -X -q -A -t -P pager=off -v ON_ERROR_STOP=1 \
--   -v organization_id='<verified-authorized-tenant-uuid>' -v days=30 \
--   -f docs/sql/r2-p3-session-start-repeat-diagnostic-v1.sql
-- Never publish tenant/source/browser/session/event identifiers or raw rows.
-- SDK sessionStorage may persist across same-tab reloads and browser restore.
-- Different event IDs on a single session key are NOT proof of a human repeat
-- visit or definitive evidence of a transport retry.
with params as (
  select :'organization_id'::uuid as organization_id,
    :'days'::integer as days,
    (now() at time zone 'UTC')::date as today_utc,
    now() as captured_at
), bounded as materialized (
  select e.tracking_source_id, e.anonymous_visitor_id, e.session_key,
    e.source_event_id, e.occurred_at, e.received_at,
    (e.occurred_at at time zone 'UTC')::date as event_day_utc
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  where p.days in (7,14,30)
    and e.event_family = 'web'
    and e.source_event_type = 'web.session_started'
    and e.occurred_at >= ((p.today_utc - (p.days - 1))::timestamp at time zone 'UTC')
    and e.occurred_at < ((p.today_utc + 1)::timestamp at time zone 'UTC')
    and e.received_at >= ((p.today_utc - p.days)::timestamp at time zone 'UTC')
    and e.received_at <= p.captured_at
  order by e.occurred_at, e.id
  limit 50001
), volume as (
  select count(*)::bigint as candidate_events from bounded
), valid_starts as materialized (
  select * from bounded
  where (select candidate_events <= 50000 from volume)
    and tracking_source_id is not null
    and nullif(btrim(anonymous_visitor_id),'') is not null
    and nullif(btrim(session_key),'') is not null
), by_session as (
  select tracking_source_id, anonymous_visitor_id, session_key,
    count(*)::bigint as observed_starts,
    count(distinct source_event_id)::bigint as distinct_source_event_ids,
    count(distinct event_day_utc)::bigint as distinct_event_days,
    count(*) filter(where source_event_id is null or btrim(source_event_id)='')::bigint
      as missing_source_event_ids,
    min(occurred_at) as first_occurred_at,
    max(occurred_at) as last_occurred_at,
    min(received_at) as first_received_at,
    max(received_at) as last_received_at
  from valid_starts
  group by tracking_source_id, anonymous_visitor_id, session_key
), quality as (
  select
    count(*)::bigint as observed_source_scoped_session_keys,
    coalesce(sum(observed_starts),0)::bigint as starts_with_complete_session_key,
    count(*) filter(where observed_starts>1)::bigint as session_keys_with_repeat_starts,
    coalesce(sum(greatest(observed_starts-1,0)),0)::bigint as extra_start_events_on_repeated_keys,
    count(*) filter(where observed_starts>1 and distinct_source_event_ids=1
      and missing_source_event_ids=0)::bigint as repeated_keys_single_event_id,
    count(*) filter(where observed_starts>1 and distinct_source_event_ids>1)::bigint
      as repeated_keys_multiple_event_ids,
    count(*) filter(where observed_starts>1 and missing_source_event_ids>0)::bigint
      as repeated_keys_with_missing_event_id,
    count(*) filter(where observed_starts>1 and distinct_event_days>1)::bigint
      as repeated_keys_cross_utc_days,
    count(*) filter(where observed_starts>1
      and first_occurred_at=last_occurred_at)::bigint as repeated_keys_same_occurred_timestamp,
    count(*) filter(where observed_starts>1
      and first_received_at=last_received_at)::bigint as repeated_keys_same_received_timestamp,
    coalesce(max(observed_starts),0)::bigint as maximum_starts_per_session_key,
    round((max(extract(epoch from (last_received_at-first_received_at)))
      filter(where observed_starts>1)/60)::numeric,2) as maximum_repeat_receipt_span_minutes
  from by_session
), invalid as (
  select count(*) filter(where tracking_source_id is null
      or nullif(btrim(anonymous_visitor_id),'') is null
      or nullif(btrim(session_key),'') is null)::bigint as incomplete_session_identifiers,
    count(*) filter(where source_event_id is null
      or nullif(btrim(source_event_id),'') is null)::bigint as missing_source_event_id_receipts
  from bounded
)
select jsonb_build_object(
  'report','r2_p3_session_start_repeat_diagnostic_v1',
  'status',case
    when p.days not in (7,14,30) or p.days is null then 'invalid_window'
    when v.candidate_events > 50000 then 'volume_limit'
    when v.candidate_events = 0 then 'no_observations'
    else 'observational_only'
  end,
  'window_days',p.days,
  'sampled_at_utc',to_char(p.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'first_utc_day',to_char(p.today_utc - (p.days - 1),'YYYY-MM-DD'),
  'last_utc_day',to_char(p.today_utc,'YYYY-MM-DD'),
  'current_utc_day_incomplete',true,
  'candidate_events',v.candidate_events,
  'metrics',case when p.days in (7,14,30) and v.candidate_events between 1 and 50000
    then jsonb_build_object(
      'observed_source_scoped_session_keys',q.observed_source_scoped_session_keys,
      'starts_with_complete_session_key',q.starts_with_complete_session_key,
      'incomplete_session_identifiers',i.incomplete_session_identifiers,
      'missing_source_event_id_receipts',i.missing_source_event_id_receipts,
      'session_keys_with_repeat_starts',q.session_keys_with_repeat_starts,
      'extra_start_events_on_repeated_keys',q.extra_start_events_on_repeated_keys,
      'repeated_keys_single_event_id',q.repeated_keys_single_event_id,
      'repeated_keys_multiple_event_ids',q.repeated_keys_multiple_event_ids,
      'repeated_keys_with_missing_event_id',q.repeated_keys_with_missing_event_id,
      'repeated_keys_cross_utc_days',q.repeated_keys_cross_utc_days,
      'repeated_keys_same_occurred_timestamp',q.repeated_keys_same_occurred_timestamp,
      'repeated_keys_same_received_timestamp',q.repeated_keys_same_received_timestamp,
      'maximum_starts_per_session_key',q.maximum_starts_per_session_key,
      'maximum_repeat_receipt_span_minutes',q.maximum_repeat_receipt_span_minutes
    ) else '{}'::jsonb end,
  'is_retention_kpi',false,
  'proves_history_completeness',false,
  'proves_retry_root_cause',false,
  'is_authenticated_role_test',false
) as source_scoped_aggregate_only
from params p cross join volume v cross join quality q cross join invalid i;
