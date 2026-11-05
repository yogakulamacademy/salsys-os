-- R2-P2 native product analytics — bounded, read-only, tenant-authenticated.
-- No event writes, no client access to raw_events and no new source of truth.
-- The same browser session is identified by (tracking_source_id, visitor_id, session_key).
create or replace function public.native_funnel_depth_v1(
  p_sequence text[],
  p_steps text[]
) returns integer
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_step integer := 1;
  v_event text;
  v_total integer := coalesce(array_length(p_steps, 1), 0);
begin
  if v_total < 1 then return 0; end if;
  foreach v_event in array p_sequence loop
    if v_event = p_steps[v_step] then
      v_step := v_step + 1;
      if v_step > v_total then return v_total; end if;
    end if;
  end loop;
  return v_step - 1;
end;
$$;

revoke all on function public.native_funnel_depth_v1(text[], text[]) from public, anon, authenticated;

create or replace function public.get_native_behavior_workspace_v1(
  p_organization_id uuid,
  p_days integer default 14,
  p_steps text[] default array['web.page_viewed', 'web.form_started', 'web.form_submitted']::text[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_days integer := coalesce(p_days, 14);
  v_start timestamptz;
  v_funnel jsonb := '[]'::jsonb;
  v_paths jsonb := '[]'::jsonb;
  v_path_sessions bigint := 0;
  v_candidate_count bigint := 0;
begin
  if p_organization_id is null or auth.role() <> 'authenticated'
    or not public.is_crm_user()
    or not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for behavioral analytics';
  end if;

  if v_days not in (7, 14, 30) then
    raise exception 'Invalid analytics date window';
  end if;

  if p_steps is null or cardinality(p_steps) < 2 or cardinality(p_steps) > 5
    or exists (
      select 1 from unnest(p_steps) s(event_name)
      where s.event_name is null
        or s.event_name !~ '^web\.[a-z][a-z0-9_]*$'
        or not exists (
          select 1 from public.tracking_event_contracts c
          where c.organization_id is null
            and c.event_name = s.event_name
            and c.schema_version = 1
            and c.status = 'active'
            and c.family_key = 'web'
        )
    )
    or (select count(distinct event_name) from unnest(p_steps) s(event_name)) <> cardinality(p_steps)
  then
    raise exception 'Invalid or unregistered ordered funnel steps';
  end if;

  v_start := now() - make_interval(days => v_days);

  -- Fail closed on excessive event volume, never return misleading partial counts.
  select count(*) into v_candidate_count
  from (
    select 1
    from public.raw_events e
    where e.organization_id = p_organization_id
      and e.event_family = 'web'
      and e.received_at >= v_start - interval '1 day'
      and e.occurred_at between v_start and now() + interval '5 minutes'
      and e.source_event_type = any(p_steps)
      and e.tracking_source_id is not null
      and nullif(e.session_key, '') is not null
      and nullif(e.anonymous_visitor_id, '') is not null
    limit 50001
  ) limited;
  if v_candidate_count > 50000 then
    return jsonb_build_object(
      'status', jsonb_build_object('available', false, 'reason', 'volume_limit', 'window_days', v_days),
      'funnel', '[]'::jsonb,
      'paths', '[]'::jsonb
    );
  end if;

  with session_events as materialized (
    select
      e.tracking_source_id, e.session_key, e.anonymous_visitor_id,
      array_agg(e.source_event_type order by e.occurred_at, e.id) as ordered_events
    from public.raw_events e
    where e.organization_id = p_organization_id
      and e.event_family = 'web'
      and e.received_at >= v_start - interval '1 day'
      and e.occurred_at between v_start and now() + interval '5 minutes'
      and e.source_event_type = any(p_steps)
      and e.tracking_source_id is not null
      and nullif(e.session_key, '') is not null
      and nullif(e.anonymous_visitor_id, '') is not null
    group by e.tracking_source_id, e.session_key, e.anonymous_visitor_id
  ), depths as (
    select public.native_funnel_depth_v1(ordered_events, p_steps) as depth
    from session_events
  ), totals as (
    select s.i, count(d.depth) filter(where d.depth >= s.i)::bigint as sessions
    from generate_subscripts(p_steps, 1) as s(i)
    left join depths d on true
    group by s.i
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'event_name', p_steps[t.i],
      'sessions', t.sessions
    ) order by t.i),
    '[]'::jsonb
  )
  into v_funnel
  from totals t;

  -- Aggregate page-to-page transitions: no raw visitor IDs or payloads leave SQL.
  -- Only conservative path slugs are returned. Paths with dynamic UUID, numeric
  -- ID, percent-encoding or special characters collapse to /other.
  with page_events as materialized (
    select e.tracking_source_id, e.session_key, e.anonymous_visitor_id,
      e.occurred_at, e.id,
      case
        when coalesce(e.payload ->> 'pagePath', '') ~ '^/[a-zA-Z0-9/_-]{0,120}$'
          and coalesce(e.payload ->> 'pagePath', '') !~ '/[0-9]{4,}(/|$)'
          and coalesce(e.payload ->> 'pagePath', '') !~* '/[a-f0-9]{16,}(/|$)'
        then e.payload ->> 'pagePath'
        else '/other'
      end as safe_path
    from public.raw_events e
    where e.organization_id = p_organization_id
      and e.event_family = 'web'
      and e.source_event_type = 'web.page_viewed'
      and e.received_at >= v_start - interval '1 day'
      and e.occurred_at between v_start and now() + interval '5 minutes'
      and e.tracking_source_id is not null
      and nullif(e.session_key, '') is not null
      and nullif(e.anonymous_visitor_id, '') is not null
  ), links as (
    select tracking_source_id, session_key, anonymous_visitor_id, safe_path,
      lead(safe_path) over (
        partition by tracking_source_id, session_key, anonymous_visitor_id
        order by occurred_at, id
      ) as next_path
    from page_events
  ), ranked as (
    select safe_path as from_path, next_path as to_path,
      count(*)::bigint as transitions,
      count(distinct (tracking_source_id, session_key, anonymous_visitor_id))::bigint as sessions
    from links
    where next_path is not null and safe_path <> next_path
      and safe_path <> '/other' and next_path <> '/other'
    group by safe_path, next_path
    having count(distinct (tracking_source_id, session_key, anonymous_visitor_id)) >= 3
    order by sessions desc, transitions desc, safe_path, next_path
    limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'from_path', from_path, 'to_path', to_path,
      'sessions', sessions, 'transitions', transitions
    ) order by sessions desc, transitions desc, from_path, to_path), '[]'::jsonb)
  into v_paths from ranked;

  -- A separate, aggregated denominator avoids exposing session identifiers.
  select count(distinct (e.tracking_source_id, e.session_key, e.anonymous_visitor_id))
  into v_path_sessions
  from public.raw_events e
  where e.organization_id = p_organization_id
    and e.event_family = 'web'
    and e.source_event_type = 'web.page_viewed'
    and e.received_at >= v_start - interval '1 day'
    and e.occurred_at between v_start and now() + interval '5 minutes'
    and e.tracking_source_id is not null
    and nullif(e.session_key, '') is not null
    and nullif(e.anonymous_visitor_id, '') is not null;

  return jsonb_build_object(
    'status', jsonb_build_object(
      'available', true,
      'window_days', v_days,
      'generated_at', now(),
      'aggregation_unit', 'source_scoped_visitor_session',
      'path_min_sessions', 3
    ),
    'funnel', v_funnel,
    'paths', v_paths,
    'path_sessions', v_path_sessions
  );
end;
$$;

-- SECURITY DEFINER RPC: never make this callable through PUBLIC / anon.
revoke all on function public.get_native_behavior_workspace_v1(uuid, integer, text[])
  from public, anon;
grant execute on function public.get_native_behavior_workspace_v1(uuid, integer, text[])
  to authenticated;
