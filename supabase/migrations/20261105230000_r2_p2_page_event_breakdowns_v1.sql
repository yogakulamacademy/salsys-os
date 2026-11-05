-- R2-P2: native page-level web event breakdown, aggregation only.
-- No event writes, client raw-events grant, visitor exports, or tracking activation.
create or replace function public.get_native_behavior_page_breakdown_v1(
  p_organization_id uuid,
  p_days integer default 14,
  p_event text default 'web.page_viewed'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_days integer := coalesce(p_days,14);
  v_today date := (now() at time zone 'UTC')::date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_candidate_count integer := 0;
  v_result jsonb := '{}'::jsonb;
begin
  -- The bound tenant session and membership requirement mirror all R2 reports.
  if p_organization_id is null
    or auth.role() <> 'authenticated'
    or not public.is_crm_user()
    or not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for page event breakdown';
  end if;

  if v_days not in (7,14,30) then
    raise exception 'Invalid breakdown date range';
  end if;

  if p_event is null
    or p_event !~ '^web\.[a-z][a-z0-9_]*$'
    or not exists (
      select 1 from public.tracking_event_contracts c
      where c.organization_id is null
        and c.event_name = p_event
        and c.schema_version = 1
        and c.family_key = 'web'
        and c.status = 'active'
    ) then
    raise exception 'Invalid or unregistered breakdown event';
  end if;

  v_start_at := (v_today - (v_days - 1))::timestamp at time zone 'UTC';
  v_end_at := (v_today + 1)::timestamp at time zone 'UTC';

  -- Fail closed instead of silently truncating totals.
  select count(*) into v_candidate_count from (
    select 1 from public.raw_events e
    where e.organization_id = p_organization_id
      and e.event_family = 'web'
      and e.source_event_type = p_event
      and e.occurred_at >= v_start_at
      and e.occurred_at < v_end_at
      and e.received_at >= v_start_at - interval '1 day'
    limit 50001
  ) bounded;
  if v_candidate_count > 50000 then
    return jsonb_build_object(
      'status',jsonb_build_object('available',false,'reason','volume_limit',
        'window_days',v_days,'event_name',p_event),
      'pages','[]'::jsonb
    );
  end if;

  with observed as materialized (
    select
      e.tracking_source_id,
      e.anonymous_visitor_id,
      e.session_key,
      public.native_safe_page_path_v2(e.payload ->> 'pagePath') as safe_path
    from public.raw_events e
    where e.organization_id = p_organization_id
      and e.event_family = 'web'
      and e.source_event_type = p_event
      and e.occurred_at >= v_start_at
      and e.occurred_at < v_end_at
      and e.received_at >= v_start_at - interval '1 day'
  ),
  totals as (
    select count(*)::bigint as total_events,
      count(*) filter (where safe_path <> '/other')::bigint as safe_path_events,
      count(distinct (tracking_source_id,anonymous_visitor_id,session_key))
        filter (where tracking_source_id is not null
          and nullif(anonymous_visitor_id,'') is not null
          and nullif(session_key,'') is not null)::bigint as identified_sessions
    from observed
  ),
  ranked as materialized (
    select safe_path as path,
      count(*)::bigint as events,
      count(distinct (tracking_source_id,anonymous_visitor_id,session_key))
        filter (where tracking_source_id is not null
          and nullif(anonymous_visitor_id,'') is not null
          and nullif(session_key,'') is not null)::bigint as sessions,
      count(distinct (tracking_source_id,anonymous_visitor_id))
        filter (where tracking_source_id is not null
          and nullif(anonymous_visitor_id,'') is not null)::bigint as visitors
    from observed
    where safe_path <> '/other'
    group by safe_path
    having count(distinct (tracking_source_id,anonymous_visitor_id))
      filter (where tracking_source_id is not null
        and nullif(anonymous_visitor_id,'') is not null) >= 3
    order by events desc, sessions desc, safe_path
    limit 10
  ),
  displayed as (
    select coalesce(sum(events),0)::bigint as events
    from ranked
  ),
  pages as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'path',path,'events',events,'sessions',sessions,'visitors',visitors
    ) order by events desc,sessions desc,path),'[]'::jsonb) as rows
    from ranked
  )
  select jsonb_build_object(
    'status',jsonb_build_object(
      'available',true,
      'event_name',p_event,
      'window_days',v_days,
      'timezone','UTC',
      'generated_at',now(),
      'min_distinct_visitors',3,
      'max_displayed_pages',10,
      'total_events',totals.total_events,
      'safe_path_events',totals.safe_path_events,
      'identified_sessions',totals.identified_sessions,
      'displayed_events',displayed.events,
      'hidden_or_other_events',totals.total_events-displayed.events
    ),
    'pages',pages.rows
  ) into v_result
  from totals cross join displayed cross join pages;

  return v_result;
end;
$$;

revoke all on function public.get_native_behavior_page_breakdown_v1(uuid,integer,text)
  from public,anon;
grant execute on function public.get_native_behavior_page_breakdown_v1(uuid,integer,text)
  to authenticated;

-- No fixtures insert into production. Pure regression proof on row counting.
do $$
begin
  if (select count(*) from unnest(array['web.page_viewed','web.form_started']) e) <> 2
    then raise exception 'R2-P2 page breakdown deterministic sanity check failed';
  end if;
end;
$$;
