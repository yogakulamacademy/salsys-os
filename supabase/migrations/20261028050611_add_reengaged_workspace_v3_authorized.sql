do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.get_reengaged_workspace_v2()'::regprocedure);
  if position('FUNCTION public.get_reengaged_workspace_v2()' in v_definition) = 0 then
    raise exception 'Expected get_reengaged_workspace_v2 definition not found';
  end if;
  v_definition := replace(v_definition,
    'FUNCTION public.get_reengaged_workspace_v2()',
    'FUNCTION public.get_reengaged_workspace_legacy_v2()'
  );
  execute v_definition;
end
$$;

revoke all on function public.get_reengaged_workspace_legacy_v2() from public, anon;
grant execute on function public.get_reengaged_workspace_legacy_v2() to authenticated, service_role;

create or replace function public.get_reengaged_workspace_v3(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $fn$
declare
  v_result jsonb;
  v_service boolean := auth.role() = 'service_role';
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  with journey as materialized (
    select j.*
    from public.v_lead_journey_intelligence j
    where j.organization_id = p_organization_id
      and (v_service or public.can_access_lead(j.lead_id))
  ),
  active_leads as (
    select to_jsonb(j) as row_json
    from journey j
    where coalesce(j.sessions_7d,0) > 0
       or coalesce(j.page_views_7d,0) > 0
       or coalesce(j.high_intent_events_7d,0) > 0
       or j.is_reengaged is true
    order by j.last_visit_at desc nulls last
    limit 250
  ),
  summary as (
    select
      behaviour_temperature,
      count(*) as lead_count,
      count(*) filter (where is_reengaged) as reengaged_count,
      count(*) filter (where sessions_7d > 0) as active_7d_count,
      round(avg(engagement_score), 1) as avg_engagement_score
    from journey
    group by behaviour_temperature
  ),
  distribution as (
    select
      case
        when conversion_visit_number is null then 'unknown'
        when conversion_visit_number = 1 then '1st visit'
        when conversion_visit_number = 2 then '2nd visit'
        when conversion_visit_number between 3 and 5 then '3-5 visits'
        else '6+ visits'
      end as visit_bucket,
      count(*) as lead_count,
      round(avg(conversion_visit_number) filter (where conversion_visit_number is not null), 2) as avg_visit_number,
      round(avg(days_first_visit_to_lead) filter (where days_first_visit_to_lead is not null), 2) as avg_days_to_lead,
      p_organization_id as organization_id
    from journey
    group by 1
  )
  select jsonb_build_object(
    'leads', coalesce((select jsonb_agg(row_json) from active_leads), '[]'::jsonb),
    'summary', coalesce((
      select jsonb_agg(
        to_jsonb(s)
        order by case lower(coalesce(s.behaviour_temperature,''))
          when 'hot' then 1 when 'warm' then 2 when 'cold' then 3 when 'closed' then 4 else 5 end
      )
      from summary s
    ), '[]'::jsonb),
    'distribution', coalesce((
      select jsonb_agg(
        to_jsonb(d)
        order by case d.visit_bucket
          when '1st visit' then 1 when '2nd visit' then 2 when '3-5 visits' then 3
          when '6+ visits' then 4 when 'unknown' then 5 else 6 end
      )
      from distribution d
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$fn$;

revoke all on function public.get_reengaged_workspace_v3(uuid) from public, anon;
grant execute on function public.get_reengaged_workspace_v3(uuid) to authenticated, service_role;
