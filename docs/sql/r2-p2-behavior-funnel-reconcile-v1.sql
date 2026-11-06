-- R2-P2 operator-only funnel reconciliation. SELECT-only and aggregate output.
-- Do not expose this script as a CRM RPC, store the organization UUID in GitHub,
-- or run without confirming the target tenant and read-only DB authorization.
-- Example (private terminal):
-- psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
--   -v organization_id='<authorized-tenant-uuid>' -v days=14 \
--   -f docs/sql/r2-p2-behavior-funnel-reconcile-v1.sql
--
-- Uses independent three-step WITH ORDINALITY position checks, rather than the
-- live funnel-depth helper. Comparison still requires an authorized UI session.
-- The live RPC has a moving NOW() bound: compare within a short interval and
-- investigate new/delayed events before concluding a mismatch.
-- Never pass customer tokens or browser identifiers into this script.
-- sampled_at_utc is an aggregate-only timestamp for offline drift checks.

with params as (
  select :'organization_id'::uuid as organization_id,
    :'days'::integer as days,
    now() as captured_at,
    array['web.page_viewed','web.form_started','web.form_submitted']::text[] as steps
), bounded as materialized (
  select e.source_event_type, e.tracking_source_id,
    e.anonymous_visitor_id, e.session_key, e.occurred_at, e.id
  from public.raw_events e
  join params p on e.organization_id = p.organization_id
  where p.days in (7,14,30)
    and e.event_family = 'web'
    and e.received_at >= p.captured_at - make_interval(days => p.days) - interval '1 day'
    and e.occurred_at between p.captured_at - make_interval(days => p.days)
                          and p.captured_at + interval '5 minutes'
    and (e.source_event_type = any(p.steps) or e.source_event_type = 'web.page_viewed')
    and e.tracking_source_id is not null
    and nullif(e.session_key,'') is not null
    and nullif(e.anonymous_visitor_id,'') is not null
  limit 50001
), volume as (
  select count(*)::bigint as candidate_events from bounded
), session_events as materialized (
  select b.tracking_source_id,b.anonymous_visitor_id,b.session_key,
    array_agg(b.source_event_type order by b.occurred_at,b.id) as ordered_events
  from bounded b
  join params p on b.source_event_type = any(p.steps)
  group by b.tracking_source_id,b.anonymous_visitor_id,b.session_key
), depths as (
  -- Independent ordering contract: first page view, then first form start
  -- strictly after it, then first form submit strictly after the form start.
  -- Repeated earlier events do not incorrectly advance the funnel.
  select case
    when third_step.ord is not null then 3
    when second_step.ord is not null then 2
    when first_step.ord is not null then 1
    else 0 end as depth
  from session_events s
  left join lateral (
    select min(e.ord) as ord
    from unnest(s.ordered_events) with ordinality e(event_name,ord)
    where e.event_name = 'web.page_viewed'
  ) first_step on true
  left join lateral (
    select min(e.ord) as ord
    from unnest(s.ordered_events) with ordinality e(event_name,ord)
    where e.event_name = 'web.form_started' and e.ord > first_step.ord
  ) second_step on true
  left join lateral (
    select min(e.ord) as ord
    from unnest(s.ordered_events) with ordinality e(event_name,ord)
    where e.event_name = 'web.form_submitted' and e.ord > second_step.ord
  ) third_step on true
), funnel as (
  select coalesce(jsonb_agg(
    jsonb_build_object('event_name',p.steps[s.i],
                       'sessions',coalesce(t.sessions,0))
    order by s.i
  ),'[]'::jsonb) as steps
  from params p
  cross join lateral generate_subscripts(p.steps,1) s(i)
  left join lateral (
    select count(*) filter (where d.depth >= s.i)::bigint as sessions
    from depths d
  ) t on true
), paths as (
  select count(distinct
    (b.tracking_source_id,b.session_key,b.anonymous_visitor_id))::bigint as path_sessions
  from bounded b
  where b.source_event_type = 'web.page_viewed'
)
select jsonb_build_object(
  'report','r2_p2_default_funnel_aggregate_comparison_v1',
  'status',case
    when p.days not in (7,14,30) or p.days is null then 'invalid_window'
    when v.candidate_events > 50000 then 'volume_limit'
    else 'aggregate_comparison_only'
  end,
  'window_days',p.days,
  'sampled_at_utc',to_char(p.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'candidate_events',v.candidate_events,
  'funnel',case when p.days in (7,14,30) and v.candidate_events <= 50000
    then f.steps else '[]'::jsonb end,
  'path_sessions',case when p.days in (7,14,30) and v.candidate_events <= 50000
    then x.path_sessions else null end,
  'uses_independent_ordering_check',true,
  'is_authenticated_role_test',false,
  'is_path_edge_reconciliation',false
) as default_funnel_aggregates_only
from params p cross join volume v cross join funnel f cross join paths x;
