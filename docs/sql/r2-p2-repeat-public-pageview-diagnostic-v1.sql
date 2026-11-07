-- R2-P2 read-only operator diagnostic for heavily repeated PUBLIC page views.
-- This does NOT label bots, remove events, change analytics, or certify consent.
-- Scope to one authorized tenant; do not share the UUID or DB connection.
--
-- Example in an authorized private terminal:
-- psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
--   -v organization_id='<authorized-tenant-uuid>' -v days=30 \
--   -f docs/sql/r2-p2-repeat-public-pageview-diagnostic-v1.sql
--
-- Proof boundary: individual source/visitor/session IDs remain internal to
-- the aggregate calculation. The output exposes only privacy-filtered PUBLIC
-- paths with >=3 distinct visitors, >=5 sessions and >=50 observed events.
-- This is a diagnostic, NOT a traffic-filtering or attribution policy.

with params as (
  select :'organization_id'::uuid as organization_id,
    :'days'::integer as days,
    (now() at time zone 'UTC')::date as today_utc
), bounded as materialized (
  select
    e.tracking_source_id,
    e.anonymous_visitor_id,
    e.session_key,
    public.native_safe_behavior_breakdown_page_v1(
      e.payload ->> 'pagePath'
    ) as safe_path
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  where p.days in (7,14,30)
    and e.event_family = 'web'
    and e.source_event_type = 'web.page_viewed'
    and e.occurred_at >=
      (p.today_utc - (p.days - 1))::timestamp at time zone 'UTC'
    and e.occurred_at <
      (p.today_utc + 1)::timestamp at time zone 'UTC'
    and e.received_at >=
      (p.today_utc - p.days)::timestamp at time zone 'UTC'
  limit 50001
), volume as (
  select count(*)::bigint as candidate_events from bounded
), public_observations as materialized (
  select b.*
  from bounded b cross join volume v
  where v.candidate_events <= 50000
    and b.safe_path <> '/other'
), per_session as (
  select
    safe_path, tracking_source_id, anonymous_visitor_id, session_key,
    count(*)::bigint as views_in_session
  from public_observations
  where tracking_source_id is not null
    and nullif(anonymous_visitor_id,'') is not null
    and nullif(session_key,'') is not null
  group by safe_path, tracking_source_id, anonymous_visitor_id, session_key
), path_observations as (
  select safe_path,
    count(*)::bigint as all_views,
    count(*) filter (where tracking_source_id is null
      or nullif(anonymous_visitor_id,'') is null
      or nullif(session_key,'') is null)::bigint as unidentified_views
  from public_observations
  group by safe_path
), path_sessions as (
  select safe_path,
    count(*)::bigint as identified_sessions,
    count(distinct (tracking_source_id, anonymous_visitor_id))::bigint
      as distinct_visitors,
    sum(views_in_session)::bigint as identified_views,
    count(*) filter (where views_in_session >= 10)::bigint
      as sessions_with_ten_plus_views,
    coalesce(sum(views_in_session)
      filter (where views_in_session >= 10),0)::bigint
      as views_in_ten_plus_sessions
  from per_session
  group by safe_path
), review_candidates as (
  select
    p.safe_path, p.all_views, p.unidentified_views,
    s.identified_views, s.identified_sessions, s.distinct_visitors,
    s.sessions_with_ten_plus_views, s.views_in_ten_plus_sessions,
    round(s.identified_views::numeric / nullif(s.identified_sessions,0),1)
      as identified_views_per_session,
    round(100 * s.views_in_ten_plus_sessions::numeric /
      nullif(s.identified_views,0),1) as ten_plus_session_view_share_pct
  from path_observations p
  join path_sessions s on s.safe_path = p.safe_path
  where p.all_views >= 50
    and s.distinct_visitors >= 3
    and s.identified_sessions >= 5
    and s.identified_views >= 50
    and s.identified_views::numeric / nullif(s.identified_sessions,0) >= 10
    and s.views_in_ten_plus_sessions::numeric /
      nullif(s.identified_views,0) >= 0.70
), displayed as (
  select * from review_candidates
  order by all_views desc, safe_path
  limit 10
), report_rows as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'public_path',safe_path,
    'observed_page_views',all_views,
    'identified_page_views',identified_views,
    'unidentified_page_views',unidentified_views,
    'identified_sessions',identified_sessions,
    'distinct_visitors',distinct_visitors,
    'identified_views_per_session',identified_views_per_session,
    'sessions_with_ten_plus_views',sessions_with_ten_plus_views,
    'views_in_ten_plus_sessions',views_in_ten_plus_sessions,
    'ten_plus_session_view_share_pct',ten_plus_session_view_share_pct,
    'review_reason','high_repeat_page_views'
  ) order by all_views desc,safe_path),'[]'::jsonb) as rows
  from displayed
)
select jsonb_build_object(
  'report','r2_p2_repeat_public_pageview_diagnostic_v1',
  'status',case
    when p.days not in (7,14,30) or p.days is null then 'invalid_window'
    when v.candidate_events > 50000 then 'volume_limit'
    else 'review_only'
  end,
  'window_days',p.days,
  'last_day_utc',to_char(p.today_utc,'YYYY-MM-DD'),
  'generated_at_utc',to_char(now() at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),
  'candidate_page_views',v.candidate_events,
  'minimum_distinct_visitors',3,
  'minimum_identified_sessions',5,
  'minimum_total_views',50,
  'views_per_identified_session_threshold',10,
  'ten_plus_view_session_share_threshold_pct',70,
  'max_displayed_public_pages',10,
  'pages_to_review',case
    when p.days in (7,14,30) and v.candidate_events <= 50000
    then r.rows else '[]'::jsonb end,
  'automatic_exclusion',false,
  'bot_or_fraud_determination',false,
  'raw_identifiers_returned',false
) as diagnostic_only
from params p cross join volume v cross join report_rows r;
