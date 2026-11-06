-- R2-P2 page-level summary reconciliation. SELECT-only, operator-only.
-- Does NOT return per-page paths, browser identifiers or visitor/session/source IDs.
-- The safe-route helper matches live RPC behavior; this is a summary comparator,
-- not an independent privacy proof of each route.
--
-- Example (private terminal, authorized tenant):
-- psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
--   -v organization_id='<authorized-tenant-uuid>' -v days=14 \
--   -v event='web.page_viewed' \
--   -f docs/sql/r2-p2-behavior-page-reconcile-v1.sql
-- Do not post the tenant UUID or connection string in issues/chat.
with params as (
  select :'organization_id'::uuid as organization_id,
    :'days'::integer as days, :'event'::text as event_name,
    (now() at time zone 'UTC')::date as today_utc
), valid_event as (
  select exists (
    select 1 from public.tracking_event_contracts c cross join params p
    where c.organization_id is null
      and c.event_name = p.event_name
      and c.schema_version = 1
      and c.family_key = 'web'
      and c.status = 'active'
      and p.event_name ~ '^web\.[a-z][a-z0-9_]*$'
  ) as allowed
), bounded as materialized (
  select e.tracking_source_id,e.anonymous_visitor_id,e.session_key,
    public.native_safe_behavior_breakdown_page_v1(e.payload ->> 'pagePath') as safe_path
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  cross join valid_event ve
  where p.days in (7,14,30)
    and ve.allowed
    and e.event_family = 'web'
    and e.source_event_type = p.event_name
    and e.occurred_at >= (p.today_utc - (p.days - 1))::timestamp at time zone 'UTC'
    and e.occurred_at < (p.today_utc + 1)::timestamp at time zone 'UTC'
    and e.received_at >= (p.today_utc - p.days)::timestamp at time zone 'UTC'
  limit 50001
), volume as (
  select count(*)::bigint as candidate_events from bounded
), totals as (
  select count(*)::bigint as total_events,
    count(*) filter (where safe_path <> '/other')::bigint as safe_path_events,
    count(distinct (tracking_source_id,anonymous_visitor_id,session_key))
      filter (where tracking_source_id is not null
        and nullif(anonymous_visitor_id,'') is not null
        and nullif(session_key,'') is not null)::bigint as identified_sessions
  from bounded
), ranked as materialized (
  select safe_path,
    count(*)::bigint as events,
    count(distinct (tracking_source_id,anonymous_visitor_id,session_key))
      filter (where tracking_source_id is not null
        and nullif(anonymous_visitor_id,'') is not null
        and nullif(session_key,'') is not null)::bigint as sessions,
    count(distinct (tracking_source_id,anonymous_visitor_id))
      filter (where tracking_source_id is not null
        and nullif(anonymous_visitor_id,'') is not null)::bigint as visitors
  from bounded
  where safe_path <> '/other'
  group by safe_path
  having count(distinct (tracking_source_id,anonymous_visitor_id))
    filter (where tracking_source_id is not null
      and nullif(anonymous_visitor_id,'') is not null) >= 3
  order by events desc,sessions desc,safe_path
  limit 10
), displayed as (
  select count(*)::int as displayed_pages,
    coalesce(sum(events),0)::bigint as displayed_events from ranked
)
select jsonb_build_object(
  'report','r2_p2_page_summary_aggregate_comparison_v1',
  'status',case
    when p.days not in (7,14,30) or p.days is null then 'invalid_window'
    when not ve.allowed then 'unregistered_event'
    when v.candidate_events > 50000 then 'volume_limit'
    else 'aggregate_comparison_only'
  end,
  'event_name',p.event_name,
  'window_days',p.days,
  'last_day_utc',to_char(p.today_utc,'YYYY-MM-DD'),
  'last_day_incomplete',true,
  'candidate_events',v.candidate_events,
  'summary',case when p.days in (7,14,30) and ve.allowed
    and v.candidate_events <= 50000 then jsonb_build_object(
      'total_events',t.total_events,
      'safe_path_events',t.safe_path_events,
      'identified_sessions',t.identified_sessions,
      'displayed_events',d.displayed_events,
      'hidden_or_other_events',t.total_events-d.displayed_events,
      'displayed_pages',d.displayed_pages
    ) else '{}'::jsonb end,
  'minimum_distinct_visitors',3,
  'max_displayed_pages',10,
  'returns_page_paths',false,
  'uses_live_safe_path_helper',true,
  'is_authenticated_role_test',false
) as page_aggregates_only
from params p cross join valid_event ve cross join volume v
cross join totals t cross join displayed d;
