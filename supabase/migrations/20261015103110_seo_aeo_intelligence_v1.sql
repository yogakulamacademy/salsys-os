-- W6-OG6 Answer Engine Optimization (AEO) intelligence v1
-- Deterministic answer-demand and answer-readiness signals built from existing
-- Search Console query/page evidence, crawl snapshots and semantic coverage.
-- This layer does not generate answers and does not treat schema markup as a
-- substitute for visible, useful page content.

create or replace view public.v_seo_aeo_query_demand_30d
with (security_invoker = true)
as
with bounds as materialized (
  select
    organization_id,
    max(date) as range_end,
    max(date) - 29 as range_start
  from public.gsc_page_query_daily
  group by organization_id
),
query_page as materialized (
  select
    d.organization_id,
    d.site_url,
    lower(btrim(d.query)) as normalized_query,
    d.query,
    regexp_replace(d.page, '#.*$', '') as page,
    sum(d.clicks)::bigint as clicks,
    sum(d.impressions)::bigint as impressions,
    case
      when sum(d.impressions) > 0 then
        round(
          sum(d.avg_position * d.impressions::numeric)
          / sum(d.impressions)::numeric,
          2
        )
      else 0::numeric
    end as avg_position,
    count(distinct d.date)::integer as active_days
  from public.gsc_page_query_daily d
  join bounds b
    on b.organization_id = d.organization_id
   and d.date between b.range_start and b.range_end
  where nullif(btrim(d.query), '') is not null
  group by
    d.organization_id,
    d.site_url,
    lower(btrim(d.query)),
    d.query,
    regexp_replace(d.page, '#.*$', '')
),
query_rollup as materialized (
  select
    q.organization_id,
    q.site_url,
    q.normalized_query,
    min(q.query) as query,
    sum(q.clicks)::bigint as clicks,
    sum(q.impressions)::bigint as impressions,
    case
      when sum(q.impressions) > 0 then
        round(
          sum(q.avg_position * q.impressions::numeric)
          / sum(q.impressions)::numeric,
          2
        )
      else 0::numeric
    end as avg_position,
    count(distinct q.page)::integer as page_count,
    max(q.active_days)::integer as active_days
  from query_page q
  group by q.organization_id, q.site_url, q.normalized_query
),
leader as materialized (
  select distinct on (q.organization_id, q.site_url, q.normalized_query)
    q.organization_id,
    q.site_url,
    q.normalized_query,
    q.page as leader_page,
    q.clicks as leader_clicks,
    q.impressions as leader_impressions,
    q.avg_position as leader_avg_position,
    q.active_days as leader_active_days
  from query_page q
  order by
    q.organization_id,
    q.site_url,
    q.normalized_query,
    q.impressions desc,
    q.clicks desc,
    q.avg_position asc,
    q.page asc
),
semantic as materialized (
  select distinct on (m.organization_id, lower(btrim(m.query)))
    m.organization_id,
    lower(btrim(m.query)) as normalized_query,
    m.intent,
    m.confidence,
    m.topic_id,
    m.entity_id
  from public.seo_query_semantic_map m
  order by
    m.organization_id,
    lower(btrim(m.query)),
    m.confidence desc nulls last,
    m.last_seen_at desc nulls last,
    m.created_at desc
),
classified as (
  select
    r.organization_id,
    r.site_url,
    r.query,
    r.normalized_query,
    r.clicks,
    r.impressions,
    r.avg_position,
    r.page_count,
    r.active_days,
    l.leader_page,
    l.leader_clicks,
    l.leader_impressions,
    l.leader_avg_position,
    l.leader_active_days,
    s.intent as semantic_intent,
    s.confidence as semantic_confidence,
    s.topic_id,
    s.entity_id,
    case
      when r.normalized_query ~ '^(what|how|why|when|where|who|which|can|does|do|is|are|should|will)( |$)'
        then 'direct_question'
      when r.normalized_query ~ '(^| )(fee|fees|cost|price|pricing)( |$)'
        then 'cost_fees'
      when r.normalized_query ~ '(^| )(best|top|vs|versus|difference|compare|comparison|review|reviews)( |$)'
        then 'comparison_choice'
      when r.normalized_query ~ '(eligible|eligibility|certified|certification|accredited|accreditation|yoga alliance)'
        then 'eligibility_certification'
      when r.normalized_query ~ '(^| )(duration|schedule|timing|timings|hours|days|months)( |$)'
        then 'duration_schedule'
      when r.normalized_query ~ '(near me|where to|where can|location|located)'
        then 'location_discovery'
      when lower(coalesce(s.intent, '')) = 'informational'
        then 'informational_discovery'
      else null
    end as answer_class
  from query_rollup r
  join leader l
    on l.organization_id = r.organization_id
   and l.site_url = r.site_url
   and l.normalized_query = r.normalized_query
  left join semantic s
    on s.organization_id = r.organization_id
   and s.normalized_query = r.normalized_query
)
select
  c.organization_id,
  c.site_url,
  c.query,
  c.normalized_query,
  c.answer_class,
  c.semantic_intent,
  c.semantic_confidence,
  c.topic_id,
  c.entity_id,
  c.clicks,
  c.impressions,
  case
    when c.impressions > 0 then round(c.clicks::numeric / c.impressions::numeric, 8)
    else 0::numeric
  end as ctr,
  c.avg_position,
  c.page_count,
  c.active_days,
  c.leader_page,
  c.leader_clicks,
  c.leader_impressions,
  c.leader_avg_position,
  c.leader_active_days,
  least(
    100,
    (case
      when c.impressions >= 500 then 30
      when c.impressions >= 100 then 24
      when c.impressions >= 50 then 18
      when c.impressions >= 10 then 10
      else 4
    end)
    + (case
      when c.avg_position > 5 and c.avg_position <= 10 then 24
      when c.avg_position > 10 and c.avg_position <= 20 then 20
      when c.avg_position > 20 and c.avg_position <= 40 then 12
      when c.avg_position > 0 and c.avg_position <= 5 then 8
      else 0
    end)
    + (case
      when c.clicks = 0 and c.impressions >= 20 then 14
      when c.clicks <= 1 and c.impressions >= 50 then 8
      else 0
    end)
    + (case
      when c.answer_class = 'direct_question' then 16
      when c.answer_class in ('cost_fees','eligibility_certification','duration_schedule') then 12
      when c.answer_class in ('comparison_choice','location_discovery') then 9
      when c.answer_class = 'informational_discovery' then 7
      else 0
    end)
    + (case when c.page_count > 1 then 6 else 0 end)
  )::integer as answer_opportunity_score_v1,
  case
    when c.avg_position > 5 and c.avg_position <= 20 and c.impressions >= 10
      then 'strengthen_answer'
    when c.impressions >= 50 and c.clicks = 0
      then 'improve_answer_match'
    when c.page_count > 1 and c.impressions >= 20
      then 'clarify_answer_owner'
    when c.impressions >= 10
      then 'review_answer_coverage'
    else 'monitor'
  end as recommended_action,
  case
    when c.avg_position > 5 and c.avg_position <= 20 and c.impressions >= 10 then
      'Observed answer-seeking demand already ranks within reach. Strengthen the visible answer on the current leader page and keep the response aligned with the query intent.'
    when c.impressions >= 50 and c.clicks = 0 then
      'This answer-seeking query has meaningful visibility but no observed clicks. Review whether the title, snippet and on-page answer directly satisfy the query.'
    when c.page_count > 1 and c.impressions >= 20 then
      'Multiple pages surface for this answer-seeking query. Confirm one clear answer owner before expanding overlapping content.'
    when c.impressions >= 10 then
      'Review whether the current leader page contains a concise, visible answer supported by the page topic and entity evidence.'
    else
      'Low-volume answer demand is observed; monitor before prioritizing changes.'
  end as recommendation
from classified c
where c.answer_class is not null;

revoke all on table public.v_seo_aeo_query_demand_30d from public, anon;
grant select on table public.v_seo_aeo_query_demand_30d to authenticated, service_role;

create or replace view public.v_seo_aeo_page_readiness_v1
with (security_invoker = true)
as
with latest_snapshot as materialized (
  select distinct on (s.organization_id, s.page_id)
    s.organization_id,
    s.site_id,
    s.page_id,
    s.snapshot_id,
    s.fetched_at,
    s.h1s,
    s.h2s,
    s.h3s,
    s.word_count,
    s.schema_types,
    s.structured_data,
    s.is_indexable
  from (
    select
      ps.organization_id,
      ps.site_id,
      ps.page_id,
      ps.id as snapshot_id,
      ps.fetched_at,
      ps.h1s,
      ps.h2s,
      ps.h3s,
      ps.word_count,
      ps.schema_types,
      ps.structured_data,
      ps.is_indexable
    from public.seo_page_snapshots ps
  ) s
  order by s.organization_id, s.page_id, s.fetched_at desc, s.snapshot_id desc
),
heading_signals as materialized (
  select
    s.organization_id,
    s.page_id,
    coalesce((
      select count(*)
      from unnest(coalesce(s.h2s, '{}'::text[]) || coalesce(s.h3s, '{}'::text[])) h
      where lower(btrim(h)) ~ '^(what|how|why|when|where|who|which|can|does|do|is|are|should|will)( |$)'
         or lower(h) ~ '(fees|cost|price|duration|schedule|certification|certified|accreditation|eligible|eligibility|right for you)'
    ), 0)::integer as answer_heading_count,
    coalesce((
      select count(*)
      from unnest(coalesce(s.h2s, '{}'::text[]) || coalesce(s.h3s, '{}'::text[])) h
      where lower(btrim(h)) ~ '^(what|how|why|when|where|who|which|can|does|do|is|are|should|will)( |$)'
    ), 0)::integer as interrogative_heading_count
  from latest_snapshot s
),
answer_demand as materialized (
  select
    q.organization_id,
    lower(regexp_replace(regexp_replace(q.leader_page, '[?#].*$', ''), '/+$', '')) as leader_page_key,
    count(*)::integer as answer_query_count,
    count(*) filter (where q.answer_opportunity_score_v1 >= 55)::integer as high_opportunity_query_count,
    sum(q.clicks)::bigint as answer_clicks,
    sum(q.impressions)::bigint as answer_impressions,
    max(q.answer_opportunity_score_v1)::integer as best_answer_opportunity_score,
    array_agg(distinct q.answer_class order by q.answer_class) as answer_classes
  from public.v_seo_aeo_query_demand_30d q
  group by
    q.organization_id,
    lower(regexp_replace(regexp_replace(q.leader_page, '[?#].*$', ''), '/+$', ''))
),
semantic as materialized (
  select
    c.organization_id,
    c.page_id,
    c.semantic_coverage_score_v1,
    c.topic_count,
    c.entity_count
  from public.v_seo_semantic_page_coverage c
)
select
  p.organization_id,
  p.site_id,
  p.page_id,
  p.hostname,
  p.normalized_url,
  p.url_path,
  p.page_type,
  p.lifecycle_status,
  p.title,
  p.is_indexable,
  p.snapshot_id,
  p.fetched_at,
  p.word_count,
  p.schema_types,
  coalesce(h.answer_heading_count, 0)::integer as answer_heading_count,
  coalesce(h.interrogative_heading_count, 0)::integer as interrogative_heading_count,
  (coalesce(h.answer_heading_count, 0) > 0) as has_answer_sections,
  (coalesce(p.schema_types, '{}'::text[]) && array['FAQPage']::text[]) as has_faq_schema,
  (coalesce(p.schema_types, '{}'::text[]) && array['HowTo']::text[]) as has_howto_schema,
  coalesce(s.semantic_coverage_score_v1, 0)::integer as semantic_coverage_score_v1,
  coalesce(s.topic_count, 0)::bigint as semantic_topic_count,
  coalesce(s.entity_count, 0)::bigint as semantic_entity_count,
  coalesce(d.answer_query_count, 0)::integer as answer_query_count,
  coalesce(d.high_opportunity_query_count, 0)::integer as high_opportunity_query_count,
  coalesce(d.answer_clicks, 0)::bigint as answer_clicks,
  coalesce(d.answer_impressions, 0)::bigint as answer_impressions,
  coalesce(d.best_answer_opportunity_score, 0)::integer as best_answer_opportunity_score,
  coalesce(d.answer_classes, '{}'::text[]) as answer_classes,
  least(
    100,
    (case when p.snapshot_id is not null then 18 else 0 end)
    + (case when p.is_indexable is true then 10 else 0 end)
    + (case
      when coalesce(p.word_count, 0) >= 1500 then 10
      when coalesce(p.word_count, 0) >= 600 then 6
      else 0
    end)
    + (case
      when coalesce(h.answer_heading_count, 0) >= 4 then 22
      when coalesce(h.answer_heading_count, 0) >= 1 then 14
      else 0
    end)
    + least(18, floor(coalesce(s.semantic_coverage_score_v1, 0)::numeric / 6)::integer)
    + (case
      when coalesce(s.entity_count, 0) > 0 and coalesce(s.topic_count, 0) > 0 then 8
      else 0
    end)
    + (case
      when coalesce(d.answer_query_count, 0) > 0 then 8
      else 0
    end)
    + (case
      when coalesce(p.schema_types, '{}'::text[]) && array['FAQPage','HowTo']::text[] then 6
      else 0
    end)
  )::integer as answer_readiness_score_v1,
  case
    when p.snapshot_id is null then 'uncrawled'
    when p.is_indexable is false then 'non_indexable'
    when coalesce(d.answer_query_count, 0) = 0 and coalesce(h.answer_heading_count, 0) = 0 then 'no_observed_answer_signal'
    when coalesce(d.answer_query_count, 0) > 0 and coalesce(h.answer_heading_count, 0) = 0 then 'demand_without_answer_sections'
    when coalesce(d.answer_query_count, 0) > 0 and coalesce(h.answer_heading_count, 0) > 0 then 'answer_demand_supported'
    when coalesce(h.answer_heading_count, 0) > 0 then 'answer_sections_observed'
    else 'observed'
  end as answer_state,
  case
    when p.snapshot_id is null then 'crawl_page'
    when p.is_indexable is false then 'fix_indexability'
    when coalesce(d.high_opportunity_query_count, 0) > 0 and coalesce(h.answer_heading_count, 0) = 0 then 'add_direct_answers'
    when coalesce(d.high_opportunity_query_count, 0) > 0 and coalesce(s.semantic_coverage_score_v1, 0) < 60 then 'strengthen_semantic_clarity'
    when coalesce(d.high_opportunity_query_count, 0) > 0 then 'strengthen_answer_sections'
    when coalesce(d.answer_query_count, 0) > 0 and coalesce(h.answer_heading_count, 0) = 0 then 'align_answer_sections'
    when coalesce(h.answer_heading_count, 0) > 0 and not (coalesce(p.schema_types, '{}'::text[]) && array['FAQPage','HowTo']::text[]) then 'review_structured_data'
    else 'monitor'
  end as recommended_action,
  case
    when p.snapshot_id is null then
      'Crawl evidence is required before judging answer structure, semantics or structured-data eligibility.'
    when p.is_indexable is false then
      'Resolve indexability before investing in answer-engine optimization for this page.'
    when coalesce(d.high_opportunity_query_count, 0) > 0 and coalesce(h.answer_heading_count, 0) = 0 then
      'The page leads high-opportunity answer-seeking queries but no explicit answer-oriented headings were observed. Add concise visible answer sections that match the proven query intent.'
    when coalesce(d.high_opportunity_query_count, 0) > 0 and coalesce(s.semantic_coverage_score_v1, 0) < 60 then
      'Answer demand is observed, but semantic topic/entity coverage is relatively weak. Clarify the page topic, entities and supporting facts before expanding answer sections.'
    when coalesce(d.high_opportunity_query_count, 0) > 0 then
      'The page already supports answer-seeking demand. Strengthen concise answer-first sections and preserve one clear page owner for each intent.'
    when coalesce(d.answer_query_count, 0) > 0 and coalesce(h.answer_heading_count, 0) = 0 then
      'Answer-seeking demand is observed, but explicit answer sections were not detected. Align visible headings and concise responses with the query evidence.'
    when coalesce(h.answer_heading_count, 0) > 0 and not (coalesce(p.schema_types, '{}'::text[]) && array['FAQPage','HowTo']::text[]) then
      'Answer-oriented sections are visible. Review whether any structured data is appropriate for the actual page content; do not add markup solely for ranking purposes.'
    else
      'No strong AEO action is indicated by the current crawl and Search Console evidence.'
  end as recommendation
from public.v_seo_page_inventory p
left join heading_signals h
  on h.organization_id = p.organization_id
 and h.page_id = p.page_id
left join semantic s
  on s.organization_id = p.organization_id
 and s.page_id = p.page_id
left join answer_demand d
  on d.organization_id = p.organization_id
 and d.leader_page_key = lower(regexp_replace(p.normalized_url, '/+$', ''));

revoke all on table public.v_seo_aeo_page_readiness_v1 from public, anon;
grant select on table public.v_seo_aeo_page_readiness_v1 to authenticated, service_role;

create or replace function public.get_seo_aeo_intelligence(
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
  class_payload jsonb;
  query_payload jsonb;
  page_payload jsonb;
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
    'pages_with_answer_sections', count(*) filter (where has_answer_sections)::bigint,
    'pages_with_answer_demand', count(*) filter (where answer_query_count > 0)::bigint,
    'pages_with_high_opportunity_demand', count(*) filter (where high_opportunity_query_count > 0)::bigint,
    'answer_specific_schema_pages', count(*) filter (where has_faq_schema or has_howto_schema)::bigint,
    'priority_page_actions', count(*) filter (
      where recommended_action not in ('monitor','crawl_page')
    )::bigint,
    'best_page_readiness', coalesce(max(answer_readiness_score_v1), 0)::integer
  )
  into summary_payload
  from public.v_seo_aeo_page_readiness_v1
  where organization_id = p_organization_id;

  summary_payload := coalesce(summary_payload, '{}'::jsonb) || (
    select jsonb_build_object(
      'answer_queries', count(*)::bigint,
      'answer_clicks', coalesce(sum(clicks), 0)::bigint,
      'answer_impressions', coalesce(sum(impressions), 0)::bigint,
      'high_opportunity_queries', count(*) filter (where answer_opportunity_score_v1 >= 55)::bigint,
      'striking_answer_queries', count(*) filter (
        where avg_position > 5 and avg_position <= 20 and impressions >= 10
      )::bigint
    )
    from public.v_seo_aeo_query_demand_30d
    where organization_id = p_organization_id
  );

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.impressions desc, x.answer_class asc),
    '[]'::jsonb
  )
  into class_payload
  from (
    select
      answer_class,
      count(*)::bigint as query_count,
      coalesce(sum(clicks), 0)::bigint as clicks,
      coalesce(sum(impressions), 0)::bigint as impressions,
      count(*) filter (where answer_opportunity_score_v1 >= 55)::bigint as high_opportunity_queries
    from public.v_seo_aeo_query_demand_30d
    where organization_id = p_organization_id
    group by answer_class
  ) x;

  select coalesce(
    jsonb_agg(
      to_jsonb(x)
      order by x.answer_opportunity_score_v1 desc, x.impressions desc, x.query asc
    ),
    '[]'::jsonb
  )
  into query_payload
  from (
    select
      query,
      answer_class,
      semantic_intent,
      clicks,
      impressions,
      ctr,
      avg_position,
      page_count,
      leader_page,
      leader_clicks,
      leader_impressions,
      leader_avg_position,
      answer_opportunity_score_v1,
      recommended_action,
      recommendation
    from public.v_seo_aeo_query_demand_30d
    where organization_id = p_organization_id
    order by answer_opportunity_score_v1 desc, impressions desc, query asc
    limit 50
  ) x;

  select coalesce(
    jsonb_agg(
      to_jsonb(x)
      order by x.action_priority desc, x.answer_impressions desc, x.normalized_url asc
    ),
    '[]'::jsonb
  )
  into page_payload
  from (
    select
      page_id,
      site_id,
      normalized_url,
      url_path,
      title,
      page_type,
      is_indexable,
      snapshot_id,
      word_count,
      schema_types,
      answer_heading_count,
      interrogative_heading_count,
      has_answer_sections,
      has_faq_schema,
      has_howto_schema,
      semantic_coverage_score_v1,
      semantic_topic_count,
      semantic_entity_count,
      answer_query_count,
      high_opportunity_query_count,
      answer_clicks,
      answer_impressions,
      best_answer_opportunity_score,
      answer_classes,
      answer_readiness_score_v1,
      answer_state,
      recommended_action,
      recommendation,
      least(
        100,
        answer_readiness_score_v1
        + least(20, high_opportunity_query_count * 5)
        + case when answer_impressions >= 500 then 12
               when answer_impressions >= 100 then 8
               when answer_impressions >= 20 then 4
               else 0 end
      )::integer as action_priority
    from public.v_seo_aeo_page_readiness_v1
    where organization_id = p_organization_id
      and recommended_action <> 'crawl_page'
    order by
      action_priority desc,
      answer_impressions desc,
      normalized_url asc
    limit 40
  ) x;

  return jsonb_build_object(
    'summary', coalesce(summary_payload, '{}'::jsonb),
    'answer_classes', coalesce(class_payload, '[]'::jsonb),
    'query_opportunities', coalesce(query_payload, '[]'::jsonb),
    'page_readiness', coalesce(page_payload, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_seo_aeo_intelligence(uuid) from public, anon;
grant execute on function public.get_seo_aeo_intelligence(uuid) to authenticated, service_role;

comment on function public.get_seo_aeo_intelligence(uuid) is
'Tenant-scoped W6-OG6 deterministic AEO intelligence. Classifies observed answer-seeking search demand and evaluates crawled page answer readiness without generating answers or assuming schema markup alone improves visibility.';
