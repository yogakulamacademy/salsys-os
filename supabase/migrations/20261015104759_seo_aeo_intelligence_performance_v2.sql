-- W6-OG6 AEO performance hardening v2
-- Avoid repeated leader/semantic nested-loop work in the query-demand view and
-- materialize each AEO evidence set once inside the tenant-scoped RPC.

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
    min(d.query) as query,
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
    regexp_replace(d.page, '#.*$', '')
),
ranked as materialized (
  select
    q.*,
    row_number() over (
      partition by q.organization_id, q.site_url, q.normalized_query
      order by q.impressions desc, q.clicks desc, q.avg_position asc, q.page asc
    ) as rn
  from query_page q
),
query_rollup as materialized (
  select
    r.organization_id,
    r.site_url,
    r.normalized_query,
    min(r.query) as query,
    sum(r.clicks)::bigint as clicks,
    sum(r.impressions)::bigint as impressions,
    case
      when sum(r.impressions) > 0 then
        round(
          sum(r.avg_position * r.impressions::numeric)
          / sum(r.impressions)::numeric,
          2
        )
      else 0::numeric
    end as avg_position,
    count(*)::integer as page_count,
    max(r.active_days)::integer as active_days,
    max(r.page) filter (where r.rn = 1) as leader_page,
    max(r.clicks) filter (where r.rn = 1) as leader_clicks,
    max(r.impressions) filter (where r.rn = 1) as leader_impressions,
    max(r.avg_position) filter (where r.rn = 1) as leader_avg_position,
    max(r.active_days) filter (where r.rn = 1) as leader_active_days
  from ranked r
  group by r.organization_id, r.site_url, r.normalized_query
),
semantic_ranked as materialized (
  select
    m.organization_id,
    lower(btrim(m.query)) as normalized_query,
    m.intent,
    m.confidence,
    m.topic_id,
    m.entity_id,
    row_number() over (
      partition by m.organization_id, lower(btrim(m.query))
      order by m.confidence desc nulls last,
               m.last_seen_at desc nulls last,
               m.created_at desc
    ) as rn
  from public.seo_query_semantic_map m
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
    r.leader_page,
    r.leader_clicks,
    r.leader_impressions,
    r.leader_avg_position,
    r.leader_active_days,
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
  left join semantic_ranked s
    on s.organization_id = r.organization_id
   and s.normalized_query = r.normalized_query
   and s.rn = 1
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
  result_payload jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  with query_data as materialized (
    select *
    from public.v_seo_aeo_query_demand_30d
    where organization_id = p_organization_id
  ),
  page_data as materialized (
    select *
    from public.v_seo_aeo_page_readiness_v1
    where organization_id = p_organization_id
  ),
  summary as (
    select
      count(*)::bigint as total_pages,
      count(*) filter (where snapshot_id is not null)::bigint as crawled_pages,
      count(*) filter (where snapshot_id is null)::bigint as uncrawled_pages,
      count(*) filter (where has_answer_sections)::bigint as pages_with_answer_sections,
      count(*) filter (where answer_query_count > 0)::bigint as pages_with_answer_demand,
      count(*) filter (where high_opportunity_query_count > 0)::bigint as pages_with_high_opportunity_demand,
      count(*) filter (where has_faq_schema or has_howto_schema)::bigint as answer_specific_schema_pages,
      count(*) filter (where recommended_action not in ('monitor','crawl_page'))::bigint as priority_page_actions,
      coalesce(max(answer_readiness_score_v1), 0)::integer as best_page_readiness
    from page_data
  ),
  demand_summary as (
    select
      count(*)::bigint as answer_queries,
      coalesce(sum(clicks), 0)::bigint as answer_clicks,
      coalesce(sum(impressions), 0)::bigint as answer_impressions,
      count(*) filter (where answer_opportunity_score_v1 >= 55)::bigint as high_opportunity_queries,
      count(*) filter (
        where avg_position > 5 and avg_position <= 20 and impressions >= 10
      )::bigint as striking_answer_queries
    from query_data
  ),
  classes as (
    select coalesce(
      jsonb_agg(to_jsonb(x) order by x.impressions desc, x.answer_class asc),
      '[]'::jsonb
    ) as payload
    from (
      select
        answer_class,
        count(*)::bigint as query_count,
        coalesce(sum(clicks), 0)::bigint as clicks,
        coalesce(sum(impressions), 0)::bigint as impressions,
        count(*) filter (where answer_opportunity_score_v1 >= 55)::bigint as high_opportunity_queries
      from query_data
      group by answer_class
    ) x
  ),
  queries as (
    select coalesce(
      jsonb_agg(
        to_jsonb(x)
        order by x.answer_opportunity_score_v1 desc, x.impressions desc, x.query asc
      ),
      '[]'::jsonb
    ) as payload
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
      from query_data
      order by answer_opportunity_score_v1 desc, impressions desc, query asc
      limit 50
    ) x
  ),
  pages as (
    select coalesce(
      jsonb_agg(
        to_jsonb(x)
        order by x.action_priority desc, x.answer_impressions desc, x.normalized_url asc
      ),
      '[]'::jsonb
    ) as payload
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
      from page_data
      where recommended_action <> 'crawl_page'
      order by
        action_priority desc,
        answer_impressions desc,
        normalized_url asc
      limit 40
    ) x
  )
  select jsonb_build_object(
    'summary',
      to_jsonb(s) || to_jsonb(d),
    'answer_classes', c.payload,
    'query_opportunities', q.payload,
    'page_readiness', p.payload
  )
  into result_payload
  from summary s
  cross join demand_summary d
  cross join classes c
  cross join queries q
  cross join pages p;

  return coalesce(
    result_payload,
    jsonb_build_object(
      'summary', '{}'::jsonb,
      'answer_classes', '[]'::jsonb,
      'query_opportunities', '[]'::jsonb,
      'page_readiness', '[]'::jsonb
    )
  );
end;
$function$;

revoke all on function public.get_seo_aeo_intelligence(uuid) from public, anon;
grant execute on function public.get_seo_aeo_intelligence(uuid) to authenticated, service_role;

comment on function public.get_seo_aeo_intelligence(uuid) is
'Tenant-scoped W6-OG6 deterministic AEO intelligence. Performance-hardened v2: materializes query and page evidence once per RPC call.';
