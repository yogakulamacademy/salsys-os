-- R2-P2 event trends V1: daily first-party web activity from canonical raw events.
-- Independent of the ordered funnel: each event is counted on its observed UTC day.
-- Does not activate browser tracking, copy event payloads, or expose visitors.
create or replace function public.get_native_behavior_event_trends_v1(
  p_organization_id uuid,
  p_days integer default 14,
  p_events text[] default array['web.page_viewed','web.form_started','web.form_submitted']::text[]
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
  v_start date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_candidate_count integer := 0;
  v_series jsonb := '[]'::jsonb;
begin
  if p_organization_id is null
    or auth.role() <> 'authenticated'
    or not public.is_crm_user()
    or not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for behavioral event trends';
  end if;

  if v_days not in (7,14,30) then
    raise exception 'Invalid trend date window';
  end if;

  if p_events is null
    or cardinality(p_events) < 1
    or cardinality(p_events) > 5
    or (select count(distinct event_name) from unnest(p_events) u(event_name))
       <> cardinality(p_events)
    or exists (
      select 1
      from unnest(p_events) u(event_name)
      where u.event_name is null
        or u.event_name !~ '^web\.[a-z][a-z0-9_]*$'
        or not exists (
          select 1 from public.tracking_event_contracts c
          where c.organization_id is null
            and c.event_name = u.event_name
            and c.schema_version = 1
            and c.family_key = 'web'
            and c.status = 'active'
        )
    )
  then
    raise exception 'Invalid or unregistered event trend series';
  end if;

  v_start := v_today - (v_days - 1);
  v_start_at := v_start::timestamp at time zone 'UTC';
  v_end_at := (v_today + 1)::timestamp at time zone 'UTC';

  -- Never return truncated totals when event volume exceeds the known bound.
  select count(*) into v_candidate_count from (
    select 1
    from public.raw_events e
    where e.organization_id = p_organization_id
      and e.event_family = 'web'
      and e.source_event_type = any(p_events)
      and e.occurred_at >= v_start_at
      and e.occurred_at < v_end_at
      and e.received_at >= v_start_at - interval '1 day'
    limit 50001
  ) candidates;

  if v_candidate_count > 50000 then
    return jsonb_build_object(
      'status', jsonb_build_object(
        'available',false,
        'reason','volume_limit',
        'window_days',v_days
      ),
      'series','[]'::jsonb
    );
  end if;

  with selected as materialized (
    select u.event_name, u.ord
    from unnest(p_events) with ordinality as u(event_name,ord)
  ),
  observed as materialized (
    select
      e.source_event_type as event_name,
      (e.occurred_at at time zone 'UTC')::date as day_utc,
      e.tracking_source_id, e.anonymous_visitor_id, e.session_key
    from public.raw_events e
    where e.organization_id = p_organization_id
      and e.event_family = 'web'
      and e.source_event_type = any(p_events)
      and e.occurred_at >= v_start_at
      and e.occurred_at < v_end_at
      and e.received_at >= v_start_at - interval '1 day'
  ),
  daily as materialized (
    select o.event_name,o.day_utc,
      count(*)::bigint as event_count,
      count(distinct (o.tracking_source_id,o.anonymous_visitor_id,o.session_key))
        filter (where o.tracking_source_id is not null
                  and nullif(o.anonymous_visitor_id,'') is not null
                  and nullif(o.session_key,'') is not null)::bigint as session_count
    from observed o
    group by o.event_name,o.day_utc
  ),
  period as materialized (
    select o.event_name,
      count(*)::bigint as event_count,
      count(distinct (o.tracking_source_id,o.anonymous_visitor_id,o.session_key))
        filter (where o.tracking_source_id is not null
                  and nullif(o.anonymous_visitor_id,'') is not null
                  and nullif(o.session_key,'') is not null)::bigint as session_count
    from observed o
    group by o.event_name
  ),
  dates as (
    select generate_series(v_start::timestamp,v_today::timestamp,interval '1 day')::date as day_utc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_name',s.event_name,
    'total_events',coalesce(p.event_count,0),
    'observed_sessions',coalesce(p.session_count,0),
    'daily',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'date_utc',to_char(d.day_utc,'YYYY-MM-DD'),
        'events',coalesce(daily_count.event_count,0),
        'sessions',coalesce(daily_count.session_count,0)
      ) order by d.day_utc),'[]'::jsonb)
      from dates d
      left join daily daily_count
        on daily_count.event_name=s.event_name and daily_count.day_utc=d.day_utc
    )
  ) order by s.ord),'[]'::jsonb)
  into v_series
  from selected s
  left join period p on p.event_name=s.event_name;

  return jsonb_build_object(
    'status',jsonb_build_object(
      'available',true,
      'window_days',v_days,
      'generated_at',now(),
      'timezone','UTC',
      'first_day_utc',to_char(v_start,'YYYY-MM-DD'),
      'last_day_utc',to_char(v_today,'YYYY-MM-DD'),
      'last_day_incomplete',true,
      'aggregation_unit','observed_web_events_and_source_scoped_sessions'
    ),
    'series',v_series
  );
end;
$$;

revoke all on function public.get_native_behavior_event_trends_v1(uuid,integer,text[])
  from public,anon;
grant execute on function public.get_native_behavior_event_trends_v1(uuid,integer,text[])
  to authenticated;

-- Deterministic date-domain sanity check in clean migration replay.
do $$
begin
  if (select count(*) from generate_series(
    timestamp '2026-11-01',timestamp '2026-11-07',interval '1 day')) <> 7 then
    raise exception 'R2-P2 event trend UTC day grid failed';
  end if;
end;
$$;
