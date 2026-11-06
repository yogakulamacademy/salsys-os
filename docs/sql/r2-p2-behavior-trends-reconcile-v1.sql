-- R2-P2 native Event Trends: trusted-operator, tenant-bound SELECT-only comparator.
-- This query returns aggregated numbers ONLY; no raw visitor/session/source IDs.
-- Run with a verified tenant membership and an authorized read-only DB connection:
-- psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
--   -v organization_id='<verified-tenant-uuid>' -v days=14 \
--   -f docs/sql/r2-p2-behavior-trends-reconcile-v1.sql
-- NEVER paste connection secrets, a tenant UUID, or raw customer values in issues.
--
-- Coverage: default event types ONLY (web.page_viewed, web.form_started,
-- web.form_submitted), 7/14/30 UTC day windows, same receipt-floor filter as
-- get_native_behavior_event_trends_v1. Today is an incomplete UTC day.
-- This does not prove real login permissions, access to another tenant, RLS
-- behavior under a user JWT, path safety or funnel ordered-step semantics.
-- SQL runs under the operator's DB role; it MUST NOT be made a public RPC.
-- sampled_at_utc records the DB query snapshot time without disclosing identifiers.

with params as (
  select :'organization_id'::uuid as organization_id, :'days'::int as days,
    (now() at time zone 'UTC')::date as today_utc,
    now() as sampled_at
), event_names(event_name, ord) as (
  values ('web.page_viewed'::text,1),
         ('web.form_started'::text,2),
         ('web.form_submitted'::text,3)
), bounded as materialized (
  select e.source_event_type as event_name,
    (e.occurred_at at time zone 'UTC')::date as day_utc,
    e.tracking_source_id, e.anonymous_visitor_id, e.session_key
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  where p.days in (7,14,30)
    and e.event_family = 'web'
    and e.source_event_type in (select event_name from event_names)
    and e.occurred_at >= ((p.today_utc - (p.days - 1))::timestamp at time zone 'UTC')
    and e.occurred_at < ((p.today_utc + 1)::timestamp at time zone 'UTC')
    and e.received_at >= ((p.today_utc - p.days)::timestamp at time zone 'UTC')
  limit 50001
), volume as (
  select count(*) as candidate_events from bounded
), totals as (
  select n.event_name, n.ord,
    count(b.event_name)::bigint as total_events,
    count(distinct (b.tracking_source_id,b.anonymous_visitor_id,b.session_key))
      filter (where b.tracking_source_id is not null
        and nullif(b.anonymous_visitor_id,'') is not null
        and nullif(b.session_key,'') is not null)::bigint as observed_sessions
  from event_names n left join bounded b on b.event_name = n.event_name
  group by n.event_name,n.ord
), daily as (
  select b.event_name,b.day_utc,
    count(*)::bigint as events,
    count(distinct (b.tracking_source_id,b.anonymous_visitor_id,b.session_key))
      filter (where b.tracking_source_id is not null
        and nullif(b.anonymous_visitor_id,'') is not null
        and nullif(b.session_key,'') is not null)::bigint as sessions
  from bounded b
  group by b.event_name,b.day_utc
), dates as (
  select d::date as day_utc from params p
  cross join lateral generate_series(
    (p.today_utc - (case when p.days in (7,14,30) then p.days else 1 end) + 1)::timestamp,
    p.today_utc::timestamp,interval '1 day'
  ) d
), series as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_name',t.event_name,
    'total_events',t.total_events,
    'observed_sessions',t.observed_sessions,
    'daily',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'date_utc',to_char(d.day_utc,'YYYY-MM-DD'),
        'events',coalesce(a.events,0),
        'sessions',coalesce(a.sessions,0)
      ) order by d.day_utc),'[]'::jsonb)
      from dates d left join daily a
        on a.event_name = t.event_name and a.day_utc = d.day_utc
    )
  ) order by t.ord),'[]'::jsonb) as entries from totals t
)
select jsonb_build_object(
  'report','r2_p2_behavior_default_trends_reconcile_v1',
  'status',case
    when p.days not in (7,14,30) then 'invalid_window'
    when v.candidate_events > 50000 then 'volume_limit'
    else 'aggregate_comparison_only'
  end,
  'window_days',p.days,
  'sampled_at_utc',to_char(p.sampled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'first_day_utc',to_char(p.today_utc - (p.days - 1),'YYYY-MM-DD'),
  'last_day_utc',to_char(p.today_utc,'YYYY-MM-DD'),
  'last_day_incomplete',true,
  'candidate_events',v.candidate_events,
  'series',case when p.days in (7,14,30) and v.candidate_events <= 50000
    then s.entries else '[]'::jsonb end,
  'is_authenticated_role_test',false,
  'is_funnel_or_path_reconciliation',false
) as tenant_aggregate_only
from params p cross join volume v cross join series s;
