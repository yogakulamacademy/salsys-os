create or replace function public.get_seo_workspace_v3(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  with
  base as materialized (
    select public.get_seo_workspace(p_organization_id) as j
  ),
  keywords as materialized (
    select query,site_url,clicks,impressions,ctr,avg_position,page_count,active_days,branded,mixed_surface,signal_type,
      leader_page,leader_surface,leader_impressions,leader_clicks,leader_avg_position,leader_active_days,leader_share,
      runner_up_page,runner_up_surface,runner_up_impressions,runner_up_clicks,runner_up_avg_position,runner_up_active_days,runner_up_share,
      surface_count,pages,recommendation,
      case signal_type
        when 'likely_cannibalization' then 1
        when 'needs_review' then 2
        when 'observed_overlap' then 3
        when 'healthy_leader' then 4
        when 'branded_coverage' then 5
        else 6
      end as signal_priority
    from public.v_seo_keyword_intelligence_30d
    where organization_id=p_organization_id
  ),
  keyword_rows as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.signal_priority asc,x.impressions desc,x.query asc),'[]'::jsonb) as j
    from (
      select * from keywords
      order by signal_priority asc,impressions desc,query asc
      limit 60
    ) x
  ),
  keyword_summary as (
    select jsonb_build_object(
      'overlap_queries',count(*)::bigint,
      'likely_cannibalization',count(*) filter (where signal_type='likely_cannibalization')::bigint,
      'needs_review',count(*) filter (where signal_type='needs_review')::bigint,
      'observed_overlap',count(*) filter (where signal_type='observed_overlap')::bigint,
      'healthy_leader',count(*) filter (where signal_type='healthy_leader')::bigint,
      'branded_coverage',count(*) filter (where signal_type='branded_coverage')::bigint,
      'high_impression_overlaps',count(*) filter (where impressions>=50)::bigint
    ) as j
    from keywords
  )
  select coalesce(base.j,'{}'::jsonb) || jsonb_build_object(
    'keyword_intelligence',coalesce(keyword_rows.j,'[]'::jsonb),
    'keyword_summary',coalesce(keyword_summary.j,'{}'::jsonb)
  ) into v_payload
  from base cross join keyword_rows cross join keyword_summary;

  return coalesce(v_payload,'{}'::jsonb);
end;
$function$;

alter function public.get_seo_workspace_v2(uuid) rename to get_seo_workspace_legacy_v2;

create function public.get_seo_workspace_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %',p_organization_id;
  end if;
  begin
    return public.get_seo_workspace_v3(p_organization_id);
  exception when others then
    return public.get_seo_workspace_legacy_v2(p_organization_id);
  end;
end;
$function$;

revoke all on function public.get_seo_workspace_v3(uuid) from public,anon,authenticated;
revoke all on function public.get_seo_workspace_legacy_v2(uuid) from public,anon,authenticated;
revoke all on function public.get_seo_workspace_v2(uuid) from public,anon;
grant execute on function public.get_seo_workspace_v2(uuid) to authenticated,service_role;
grant execute on function public.get_seo_workspace_v3(uuid) to service_role;
grant execute on function public.get_seo_workspace_legacy_v2(uuid) to service_role;