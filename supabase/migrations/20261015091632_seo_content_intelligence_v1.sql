-- W6-OG4 Content Intelligence v1
-- Deterministic content/page actions + semantic content-gap intelligence.
-- AI-generated briefs remain a later provenance-tagged layer.

create or replace view public.v_seo_content_page_intelligence_v1
with (security_invoker = true)
as
select
  p.organization_id,
  p.site_id,
  p.page_id,
  p.hostname,
  p.normalized_url,
  p.url_path,
  p.page_type,
  p.lifecycle_status,
  p.snapshot_id,
  p.fetched_at,
  p.title,
  p.meta_description,
  p.word_count,
  p.is_indexable,
  p.indexability_reason,
  p.schema_types,
  p.technical_flags,

  coalesce(o.gsc_clicks, 0)::bigint as gsc_clicks,
  coalesce(o.gsc_impressions, 0)::bigint as gsc_impressions,
  coalesce(o.gsc_ctr, 0)::numeric as gsc_ctr,
  coalesce(o.gsc_avg_position, 0)::numeric as gsc_avg_position,

  coalesce(o.semantic_coverage_score_v1, 0)::integer as semantic_coverage_score_v1,
  coalesce(o.semantic_topic_count, 0)::bigint as semantic_topic_count,
  coalesce(o.primary_topic_count, 0)::bigint as primary_topic_count,
  coalesce(o.semantic_entity_count, 0)::bigint as semantic_entity_count,

  coalesce(o.technical_issue_count, 0)::integer as technical_issue_count,
  coalesce(o.high_technical_issues, 0)::integer as high_technical_issues,
  coalesce(o.medium_technical_issues, 0)::integer as medium_technical_issues,
  coalesce(o.technical_issue_types, array[]::text[]) as technical_issue_types,

  coalesce(o.internal_link_opportunities, 0)::integer as internal_link_opportunities,
  coalesce(o.best_internal_link_score, 0)::numeric as best_internal_link_score,
  coalesce(o.opportunity_score_v1, 0)::integer as opportunity_score_v1,
  coalesce(o.opportunity_reasons, array[]::text[]) as opportunity_reasons,

  case
    when p.snapshot_id is null then 'not_crawled'
    when coalesce(p.is_indexable, false) = false then 'non_indexable'
    when coalesce(o.high_technical_issues, 0) > 0 then 'technical_risk'
    when coalesce(o.semantic_coverage_score_v1, 0) < 50 then 'low_semantic_coverage'
    else 'observed'
  end as content_state,

  case
    when p.snapshot_id is null then 'crawl_page'
    when coalesce(p.is_indexable, false) = false
      or coalesce(o.high_technical_issues, 0) > 0
      then 'fix_indexability'
    when coalesce(o.gsc_impressions, 0) >= 100
      and coalesce(o.gsc_avg_position, 0) between 1 and 10
      and coalesce(o.gsc_ctr, 0) < 0.02
      then 'improve_snippet'
    when coalesce(o.gsc_impressions, 0) >= 50
      and coalesce(o.semantic_coverage_score_v1, 0) < 50
      then 'expand_content'
    when coalesce(o.internal_link_opportunities, 0) > 0
      and coalesce(o.best_internal_link_score, 0) >= 60
      then 'strengthen_internal_links'
    when coalesce(o.opportunity_score_v1, 0) >= 50
      then 'improve_existing'
    else 'monitor'
  end as recommended_action,

  case
    when p.snapshot_id is null then
      least(90, 40 + least(50, floor(coalesce(o.gsc_impressions, 0)::numeric / 20)::integer))
    when coalesce(p.is_indexable, false) = false
      or coalesce(o.high_technical_issues, 0) > 0
      then 95
    when coalesce(o.gsc_impressions, 0) >= 100
      and coalesce(o.gsc_avg_position, 0) between 1 and 10
      and coalesce(o.gsc_ctr, 0) < 0.02
      then 85
    when coalesce(o.gsc_impressions, 0) >= 50
      and coalesce(o.semantic_coverage_score_v1, 0) < 50
      then 80
    when coalesce(o.internal_link_opportunities, 0) > 0
      and coalesce(o.best_internal_link_score, 0) >= 60
      then 70
    when coalesce(o.opportunity_score_v1, 0) >= 50
      then 60
    else least(50, coalesce(o.opportunity_score_v1, 0))
  end::integer as action_priority_score,

  case
    when p.snapshot_id is null then
      'Crawl this page before making content-quality decisions so title, headings, body copy, schema and indexability are based on observed page evidence.'
    when coalesce(p.is_indexable, false) = false
      or coalesce(o.high_technical_issues, 0) > 0 then
      'Resolve indexability or high-severity technical issues before investing in content expansion.'
    when coalesce(o.gsc_impressions, 0) >= 100
      and coalesce(o.gsc_avg_position, 0) between 1 and 10
      and coalesce(o.gsc_ctr, 0) < 0.02 then
      'This page already has page-one visibility but weak click-through. Review title and meta description against the observed query intent.'
    when coalesce(o.gsc_impressions, 0) >= 50
      and coalesce(o.semantic_coverage_score_v1, 0) < 50 then
      'Search demand exists while deterministic topic/entity coverage is weak. Expand the existing page around relevant mapped concepts before creating a duplicate page.'
    when coalesce(o.internal_link_opportunities, 0) > 0
      and coalesce(o.best_internal_link_score, 0) >= 60 then
      'Strong semantic internal-link opportunities exist. Reinforce this page from relevant pages before creating additional content.'
    when coalesce(o.opportunity_score_v1, 0) >= 50 then
      'The existing opportunity engine shows multiple improvement signals. Review its observed reasons and strengthen the current page.'
    else
      'No high-priority deterministic content action is currently indicated. Continue monitoring observed search and content signals.'
  end as action_reason

from public.v_seo_page_inventory p
left join public.v_seo_page_opportunity_engine_v1 o
  on o.organization_id = p.organization_id
 and o.page_id = p.page_id;

revoke all on table public.v_seo_content_page_intelligence_v1 from public, anon;
grant select on table public.v_seo_content_page_intelligence_v1 to authenticated, service_role;


create or replace view public.v_seo_content_gap_intelligence_v1
with (security_invoker = true)
as
with query_topic as materialized (
  select distinct
    m.organization_id,
    m.topic_id,
    m.query,
    q.clicks,
    q.impressions,
    q.ctr,
    q.avg_position
  from public.seo_query_semantic_map m
  join public.v_seo_query_30d q
    on q.organization_id = m.organization_id
   and q.query = m.query
  where m.topic_id is not null
),
ranked_queries as materialized (
  select
    qt.*,
    row_number() over (
      partition by qt.organization_id, qt.topic_id
      order by qt.impressions desc, qt.clicks desc, qt.avg_position asc, qt.query asc
    ) as query_rank
  from query_topic qt
),
demand as materialized (
  select
    organization_id,
    topic_id,
    count(distinct query)::bigint as query_count,
    sum(clicks)::bigint as gsc_clicks,
    sum(impressions)::bigint as gsc_impressions,
    case
      when sum(impressions) > 0 then
        round(sum(avg_position * impressions::numeric) / sum(impressions)::numeric, 2)
      else 0::numeric
    end as gsc_avg_position,
    jsonb_agg(
      jsonb_build_object(
        'query', query,
        'clicks', clicks,
        'impressions', impressions,
        'ctr', ctr,
        'avg_position', avg_position
      )
      order by impressions desc, clicks desc, avg_position asc, query asc
    ) filter (where query_rank <= 5) as top_queries
  from ranked_queries
  group by organization_id, topic_id
),
coverage as materialized (
  select
    pt.organization_id,
    pt.topic_id,
    count(distinct pt.page_id)::bigint as mapped_pages,
    count(distinct pt.page_id) filter (where coalesce(pi.is_indexable, false))::bigint as indexable_pages,
    round(avg(pt.confidence), 4) as avg_mapping_confidence,
    round(avg(pt.prominence), 4) as avg_prominence
  from public.seo_page_topic_map pt
  left join public.v_seo_page_inventory pi
    on pi.organization_id = pt.organization_id
   and pi.page_id = pt.page_id
  group by pt.organization_id, pt.topic_id
)
select
  t.organization_id,
  t.site_id,
  t.id as topic_id,
  t.canonical_key,
  t.name as topic_name,
  t.topic_type,
  coalesce(c.mapped_pages, 0)::bigint as mapped_pages,
  coalesce(c.indexable_pages, 0)::bigint as indexable_pages,
  c.avg_mapping_confidence,
  c.avg_prominence,
  d.query_count,
  d.gsc_clicks,
  d.gsc_impressions,
  d.gsc_avg_position,
  coalesce(d.top_queries, '[]'::jsonb) as top_queries,

  case
    when coalesce(c.mapped_pages, 0) = 0 then 'create_content'
    when coalesce(c.indexable_pages, 0) = 0 then 'restore_coverage'
    when coalesce(c.mapped_pages, 0) = 1 and d.gsc_impressions >= 50 then 'expand_topic'
    else 'covered'
  end as gap_type,

  least(
    100,
    (case when coalesce(c.mapped_pages, 0) = 0 then 35
          when coalesce(c.indexable_pages, 0) = 0 then 30
          when coalesce(c.mapped_pages, 0) = 1 then 15
          else 0 end)
    + least(45, floor(d.gsc_impressions::numeric / 50)::integer)
    + least(20, (d.query_count * 2)::integer)
  )::integer as priority_score_v1,

  case
    when coalesce(c.mapped_pages, 0) = 0 then
      'Observed Search Console queries map to this topic, but no crawled page currently maps to it. Review the top queries and create a focused page only if the intent is distinct from existing content.'
    when coalesce(c.indexable_pages, 0) = 0 then
      'This topic has mapped pages, but none are currently indexable. Restore indexable coverage before creating new content.'
    when coalesce(c.mapped_pages, 0) = 1 and d.gsc_impressions >= 50 then
      'This topic has meaningful observed demand but relies on a single mapped page. Expand that page or its supporting cluster before adding overlapping content.'
    else
      'This topic currently has mapped content coverage. Monitor demand and authority rather than creating content solely from this signal.'
  end as recommendation

from public.seo_semantic_topics t
join demand d
  on d.organization_id = t.organization_id
 and d.topic_id = t.id
left join coverage c
  on c.organization_id = t.organization_id
 and c.topic_id = t.id;

revoke all on table public.v_seo_content_gap_intelligence_v1 from public, anon;
grant select on table public.v_seo_content_gap_intelligence_v1 to authenticated, service_role;


create or replace function public.get_seo_content_intelligence(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  summary_payload jsonb;
  page_action_payload jsonb;
  gap_payload jsonb;
  internal_link_payload jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  select jsonb_build_object(
    'total_pages', count(*)::bigint,
    'crawled_pages', count(*) filter (where snapshot_id is not null)::bigint,
    'uncrawled_pages', count(*) filter (where snapshot_id is null)::bigint,
    'fix_indexability', count(*) filter (where recommended_action = 'fix_indexability')::bigint,
    'improve_snippet', count(*) filter (where recommended_action = 'improve_snippet')::bigint,
    'expand_content', count(*) filter (where recommended_action = 'expand_content')::bigint,
    'strengthen_internal_links', count(*) filter (where recommended_action = 'strengthen_internal_links')::bigint,
    'improve_existing', count(*) filter (where recommended_action = 'improve_existing')::bigint
  )
  into summary_payload
  from public.v_seo_content_page_intelligence_v1
  where organization_id = p_organization_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.action_priority_score desc, x.gsc_impressions desc, x.normalized_url asc), '[]'::jsonb)
  into page_action_payload
  from (
    select
      page_id,
      site_id,
      normalized_url,
      url_path,
      page_type,
      title,
      word_count,
      is_indexable,
      content_state,
      recommended_action,
      action_priority_score,
      action_reason,
      gsc_clicks,
      gsc_impressions,
      gsc_ctr,
      gsc_avg_position,
      semantic_coverage_score_v1,
      semantic_topic_count,
      semantic_entity_count,
      technical_issue_count,
      internal_link_opportunities,
      best_internal_link_score,
      opportunity_score_v1,
      opportunity_reasons
    from public.v_seo_content_page_intelligence_v1
    where organization_id = p_organization_id
      and recommended_action <> 'monitor'
    order by action_priority_score desc, gsc_impressions desc, normalized_url asc
    limit 60
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score_v1 desc, x.gsc_impressions desc, x.topic_name asc), '[]'::jsonb)
  into gap_payload
  from (
    select
      site_id,
      topic_id,
      canonical_key,
      topic_name,
      topic_type,
      mapped_pages,
      indexable_pages,
      query_count,
      gsc_clicks,
      gsc_impressions,
      gsc_avg_position,
      top_queries,
      gap_type,
      priority_score_v1,
      recommendation
    from public.v_seo_content_gap_intelligence_v1
    where organization_id = p_organization_id
      and gap_type <> 'covered'
    order by priority_score_v1 desc, gsc_impressions desc, topic_name asc
    limit 40
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.opportunity_score_v1 desc, x.semantic_confidence desc, x.target_url asc), '[]'::jsonb)
  into internal_link_payload
  from (
    select
      site_id,
      source_url,
      target_url,
      source_page_id,
      target_page_id,
      shared_topic_count,
      semantic_confidence,
      opportunity_score_v1
    from public.v_seo_internal_link_opportunities
    where organization_id = p_organization_id
    order by opportunity_score_v1 desc, semantic_confidence desc, target_url asc
    limit 40
  ) x;

  return jsonb_build_object(
    'summary', coalesce(summary_payload, '{}'::jsonb)
      || jsonb_build_object(
        'create_content_topics', (
          select count(*)::bigint
          from public.v_seo_content_gap_intelligence_v1
          where organization_id = p_organization_id
            and gap_type = 'create_content'
        ),
        'expand_topic_topics', (
          select count(*)::bigint
          from public.v_seo_content_gap_intelligence_v1
          where organization_id = p_organization_id
            and gap_type = 'expand_topic'
        ),
        'internal_link_opportunities', (
          select count(*)::bigint
          from public.v_seo_internal_link_opportunities
          where organization_id = p_organization_id
        )
      ),
    'page_actions', coalesce(page_action_payload, '[]'::jsonb),
    'content_gaps', coalesce(gap_payload, '[]'::jsonb),
    'internal_links', coalesce(internal_link_payload, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_seo_content_intelligence(uuid) from public, anon;
grant execute on function public.get_seo_content_intelligence(uuid) to authenticated, service_role;

comment on function public.get_seo_content_intelligence(uuid) is
'Tenant-scoped W6-OG4 deterministic Content Intelligence payload. Uses observed crawl, Search Console, semantic mapping, technical and internal-link evidence; it does not generate AI content or predictive claims.';
