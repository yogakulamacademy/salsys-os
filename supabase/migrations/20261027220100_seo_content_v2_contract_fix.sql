-- Preserve the exact existing page_actions JSON contract while keeping
-- snapshot_id available internally for crawled/uncrawled summary counts.

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
        select
          page_id, site_id, normalized_url, url_path, page_type, title, word_count,
          is_indexable, content_state, recommended_action, action_priority_score,
          action_reason, gsc_clicks, gsc_impressions, gsc_ctr, gsc_avg_position,
          semantic_coverage_score_v1, semantic_topic_count, semantic_entity_count,
          technical_issue_count, internal_link_opportunities,
          best_internal_link_score, opportunity_score_v1, opportunity_reasons
        from pages
        where recommended_action <> 'monitor'
        order by action_priority_score desc, gsc_impressions desc, normalized_url asc
        limit 60
      ) x
    ),
    'content_gaps', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score_v1 desc, x.gsc_impressions desc, x.topic_name asc), '[]'::jsonb)
      from (
        select * from gaps
        where gap_type <> 'covered'
        order by priority_score_v1 desc, gsc_impressions desc, topic_name asc
        limit 40
      ) x
    ),
    'internal_links', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.opportunity_score_v1 desc, x.semantic_confidence desc, x.target_url asc), '[]'::jsonb)
      from (
        select * from links
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
