-- PH-0: SEO content/revenue read-model reuse.
--
-- Existing RPCs rescan the same expensive derived views several times per call.
-- These additive V2 functions keep the existing JSON contracts and tenant
-- authorization while materializing each organization-scoped derived dataset
-- once per RPC execution.

create or replace function public.get_seo_content_intelligence_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
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
  pages as materialized (
    select
      page_id, site_id, normalized_url, url_path, page_type, title, word_count,
      is_indexable, snapshot_id, content_state, recommended_action,
      action_priority_score, action_reason, gsc_clicks, gsc_impressions, gsc_ctr,
      gsc_avg_position, semantic_coverage_score_v1, semantic_topic_count,
      semantic_entity_count, technical_issue_count, internal_link_opportunities,
      best_internal_link_score, opportunity_score_v1, opportunity_reasons
    from public.v_seo_content_page_intelligence_v1
    where organization_id = p_organization_id
  ),
  gaps as materialized (
    select
      site_id, topic_id, canonical_key, topic_name, topic_type, mapped_pages,
      indexable_pages, query_count, gsc_clicks, gsc_impressions, gsc_avg_position,
      top_queries, gap_type, priority_score_v1, recommendation
    from public.v_seo_content_gap_intelligence_v1
    where organization_id = p_organization_id
  ),
  links as materialized (
    select
      site_id, source_url, target_url, source_page_id, target_page_id,
      shared_topic_count, semantic_confidence, opportunity_score_v1
    from public.v_seo_internal_link_opportunities
    where organization_id = p_organization_id
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_pages', (select count(*)::bigint from pages),
      'crawled_pages', (select count(*) filter (where snapshot_id is not null)::bigint from pages),
      'uncrawled_pages', (select count(*) filter (where snapshot_id is null)::bigint from pages),
      'fix_indexability', (select count(*) filter (where recommended_action = 'fix_indexability')::bigint from pages),
      'improve_snippet', (select count(*) filter (where recommended_action = 'improve_snippet')::bigint from pages),
      'expand_content', (select count(*) filter (where recommended_action = 'expand_content')::bigint from pages),
      'strengthen_internal_links', (select count(*) filter (where recommended_action = 'strengthen_internal_links')::bigint from pages),
      'improve_existing', (select count(*) filter (where recommended_action = 'improve_existing')::bigint from pages),
      'create_content_topics', (select count(*)::bigint from gaps where gap_type = 'create_content'),
      'expand_topic_topics', (select count(*)::bigint from gaps where gap_type = 'expand_topic'),
      'internal_link_opportunities', (select count(*)::bigint from links)
    ),
    'page_actions', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.action_priority_score desc, x.gsc_impressions desc, x.normalized_url asc), '[]'::jsonb)
      from (
        select *
        from pages
        where recommended_action <> 'monitor'
        order by action_priority_score desc, gsc_impressions desc, normalized_url asc
        limit 60
      ) x
    ),
    'content_gaps', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score_v1 desc, x.gsc_impressions desc, x.topic_name asc), '[]'::jsonb)
      from (
        select *
        from gaps
        where gap_type <> 'covered'
        order by priority_score_v1 desc, gsc_impressions desc, topic_name asc
        limit 40
      ) x
    ),
    'internal_links', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.opportunity_score_v1 desc, x.semantic_confidence desc, x.target_url asc), '[]'::jsonb)
      from (
        select *
        from links
        order by opportunity_score_v1 desc, semantic_confidence desc, target_url asc
        limit 40
      ) x
    )
  ) into v_payload;

  return coalesce(v_payload, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_seo_content_intelligence_v2(uuid) from public, anon;
grant execute on function public.get_seo_content_intelligence_v2(uuid) to authenticated, service_role;

comment on function public.get_seo_content_intelligence_v2(uuid) is
  'Tenant-authorized SEO content intelligence V2. Materializes page, gap, and internal-link evidence once per call to avoid repeated derived-view recomputation.';

create or replace function public.get_seo_revenue_intelligence_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
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
  overview as materialized (
    select
      range_start, range_end,
      clicks as organic_clicks,
      impressions as organic_impressions,
      organic_leads,
      organic_qualified_leads,
      organic_enrolled_leads,
      organic_revenue_inr,
      organic_revenue_usd
    from public.v_seo_30d_overview
    where organization_id = p_organization_id
    limit 1
  ),
  value_pages as materialized (
    select
      page_id, site_id, normalized_url, url_path, title, page_type, is_indexable,
      gsc_clicks, gsc_impressions, gsc_ctr, gsc_avg_position,
      organic_leads, organic_qualified_leads, organic_enrolled_leads,
      revenue_leads, organic_revenue_inr, organic_revenue_usd,
      click_to_lead_rate_directional, lead_to_qualified_rate,
      lead_to_enrolled_rate, business_value_signal, revenue_priority_score_v1,
      recommended_action, recommendation, content_recommended_action,
      content_priority_score
    from public.v_seo_organic_value_page_30d
    where organization_id = p_organization_id
  ),
  base_summary as materialized (
    select
      count(*) filter (where organic_leads > 0)::bigint as pages_with_leads,
      count(*) filter (where organic_qualified_leads > 0)::bigint as pages_with_qualified_leads,
      count(*) filter (where organic_enrolled_leads > 0)::bigint as pages_with_enrollments,
      count(*) filter (where organic_revenue_inr <> 0 or organic_revenue_usd <> 0)::bigint as pages_with_revenue,
      coalesce(sum(organic_leads), 0)::bigint as mapped_organic_leads,
      count(*) filter (where gsc_clicks >= 10 and organic_leads = 0)::bigint as high_traffic_without_leads,
      count(*) filter (where business_value_signal in ('revenue_proven','enrollment_proven','qualified_demand','lead_demand'))::bigint as commercial_signal_pages
    from value_pages
  )
  select jsonb_build_object(
    'overview', coalesce((select to_jsonb(o) from overview o), '{}'::jsonb),
    'summary', (
      select jsonb_build_object(
        'pages_with_leads', s.pages_with_leads,
        'pages_with_qualified_leads', s.pages_with_qualified_leads,
        'pages_with_enrollments', s.pages_with_enrollments,
        'pages_with_revenue', s.pages_with_revenue,
        'mapped_organic_leads', s.mapped_organic_leads,
        'unmapped_organic_leads', greatest(0, coalesce(o.organic_leads, 0)::bigint - s.mapped_organic_leads),
        'landing_page_attribution_coverage', case
          when coalesce(o.organic_leads, 0)::numeric > 0 then
            round(s.mapped_organic_leads::numeric / o.organic_leads::numeric * 100, 2)
          else 0::numeric
        end,
        'high_traffic_without_leads', s.high_traffic_without_leads,
        'commercial_signal_pages', s.commercial_signal_pages
      )
      from base_summary s
      left join overview o on true
    ),
    'value_pages', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue_priority_score_v1 desc, x.organic_leads desc, x.gsc_clicks desc, x.normalized_url asc), '[]'::jsonb)
      from (
        select *
        from value_pages
        where organic_leads > 0
           or organic_qualified_leads > 0
           or organic_enrolled_leads > 0
           or organic_revenue_inr <> 0
           or organic_revenue_usd <> 0
        order by revenue_priority_score_v1 desc, organic_leads desc, gsc_clicks desc
        limit 30
      ) x
    ),
    'traffic_gaps', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.gsc_clicks desc, x.gsc_impressions desc, x.normalized_url asc), '[]'::jsonb)
      from (
        select
          page_id, site_id, normalized_url, url_path, title,
          gsc_clicks, gsc_impressions, gsc_ctr, gsc_avg_position,
          business_value_signal, revenue_priority_score_v1, recommended_action,
          recommendation, content_recommended_action, content_priority_score
        from value_pages
        where gsc_clicks >= 10 and organic_leads = 0
        order by gsc_clicks desc, gsc_impressions desc
        limit 15
      ) x
    ),
    'priority_actions', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue_priority_score_v1 desc, x.gsc_clicks desc, x.normalized_url asc), '[]'::jsonb)
      from (
        select
          page_id, site_id, normalized_url, url_path, title,
          gsc_clicks, gsc_impressions, gsc_avg_position,
          organic_leads, organic_qualified_leads, organic_enrolled_leads,
          organic_revenue_inr, organic_revenue_usd, business_value_signal,
          revenue_priority_score_v1, recommended_action, recommendation,
          content_recommended_action, content_priority_score
        from value_pages
        where recommended_action <> 'monitor'
        order by revenue_priority_score_v1 desc, gsc_clicks desc
        limit 30
      ) x
    )
  ) into v_payload;

  return coalesce(v_payload, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_seo_revenue_intelligence_v2(uuid) from public, anon;
grant execute on function public.get_seo_revenue_intelligence_v2(uuid) to authenticated, service_role;

comment on function public.get_seo_revenue_intelligence_v2(uuid) is
  'Tenant-authorized SEO revenue intelligence V2. Materializes organization-scoped page value evidence once per call to avoid repeated derived-view recomputation.';
