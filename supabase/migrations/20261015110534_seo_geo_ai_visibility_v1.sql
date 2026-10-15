-- W6-OG7 GEO / AI Visibility v1
-- Evidence-first generative discoverability layer.
-- Separates observed AI referral traffic from semantic/entity readiness.
-- It does not infer citations, mentions, rankings, or model recommendations that
-- have not been directly observed.

create or replace view public.v_seo_geo_ai_provider_30d
with (security_invoker = true)
as
with bounds as materialized (
  select
    organization_id,
    max(analytics_date) as range_end,
    max(analytics_date) - 29 as range_start
  from public.ga4_source_medium_daily
  group by organization_id
), classified as (
  select
    d.organization_id,
    b.range_start,
    b.range_end,
    case
      when lower(coalesce(d.source,'')) like '%chatgpt%'
        or lower(coalesce(d.source,'')) like '%openai%' then 'ChatGPT'
      when lower(coalesce(d.source,'')) like '%gemini%'
        or lower(coalesce(d.source,'')) like '%bard%' then 'Gemini'
      when lower(coalesce(d.source,'')) like '%perplex%' then 'Perplexity'
      when lower(coalesce(d.source,'')) like '%copilot%' then 'Copilot'
      when lower(coalesce(d.source,'')) like '%claude%'
        or lower(coalesce(d.source,'')) like '%anthropic%' then 'Claude'
      when lower(coalesce(d.source,'')) like '%you.com%' then 'You.com'
      when lower(coalesce(d.source,'')) like '%phind%' then 'Phind'
      when lower(coalesce(d.source,'')) like '%poe%' then 'Poe'
      when lower(coalesce(d.source,'')) like '%mistral%' then 'Mistral'
      else coalesce(nullif(d.source,''),'Other AI referral')
    end as provider,
    d.sessions,
    d.total_users,
    d.new_users,
    d.engaged_sessions,
    d.key_events
  from public.ga4_source_medium_daily d
  join bounds b
    on b.organization_id = d.organization_id
   and d.analytics_date between b.range_start and b.range_end
  where
    lower(coalesce(d.source,'')) ~ '(^|[./_-])(chatgpt|openai|perplexity|gemini|bard|copilot|claude|anthropic|you|phind|poe|mistral)([./_-]|$)'
    or lower(coalesce(d.medium,'')) in ('ai-assistant','ai_assistant','assistant','generative-ai','generative_ai')
)
select
  organization_id,
  range_start,
  range_end,
  provider,
  sum(sessions)::bigint as sessions,
  sum(total_users)::bigint as users,
  sum(new_users)::bigint as new_users,
  sum(engaged_sessions)::bigint as engaged_sessions,
  sum(key_events)::numeric as key_events,
  case
    when sum(sessions) > 0 then round(sum(engaged_sessions)::numeric / sum(sessions)::numeric, 4)
    else 0::numeric
  end as engagement_rate,
  case
    when sum(sessions) > 0 then round(sum(key_events)::numeric / sum(sessions)::numeric, 4)
    else 0::numeric
  end as key_event_rate
from classified
group by organization_id, range_start, range_end, provider;

revoke all on table public.v_seo_geo_ai_provider_30d from public, anon;
grant select on table public.v_seo_geo_ai_provider_30d to authenticated, service_role;


create or replace view public.v_seo_geo_page_intelligence_v1
with (security_invoker = true)
as
with session_bounds as materialized (
  select
    organization_id,
    max(started_at)::date as range_end,
    max(started_at)::date - 29 as range_start
  from public.web_sessions
  group by organization_id
), ai_sessions as materialized (
  select
    s.organization_id,
    b.range_start,
    b.range_end,
    lower(regexp_replace(regexp_replace(coalesce(s.landing_page,''), '[?#].*$', ''), '/+$', '')) as landing_page_key,
    case
      when lower(coalesce(s.source,'')) like '%chatgpt%'
        or lower(coalesce(s.source,'')) like '%openai%'
        or lower(coalesce(s.referrer,'')) like '%chatgpt.com%'
        or lower(coalesce(s.referrer,'')) like '%openai.com%' then 'ChatGPT'
      when lower(coalesce(s.source,'')) like '%gemini%'
        or lower(coalesce(s.source,'')) like '%bard%'
        or lower(coalesce(s.referrer,'')) like '%gemini.google.com%'
        or lower(coalesce(s.referrer,'')) like '%bard.google.com%' then 'Gemini'
      when lower(coalesce(s.source,'')) like '%perplex%'
        or lower(coalesce(s.referrer,'')) like '%perplexity.ai%' then 'Perplexity'
      when lower(coalesce(s.source,'')) like '%copilot%'
        or lower(coalesce(s.referrer,'')) like '%copilot.microsoft.com%'
        or lower(coalesce(s.referrer,'')) like '%copilot.com%' then 'Copilot'
      when lower(coalesce(s.source,'')) like '%claude%'
        or lower(coalesce(s.source,'')) like '%anthropic%'
        or lower(coalesce(s.referrer,'')) like '%claude.ai%'
        or lower(coalesce(s.referrer,'')) like '%anthropic.com%' then 'Claude'
      when lower(coalesce(s.source,'')) like '%you.com%'
        or lower(coalesce(s.referrer,'')) like '%you.com%' then 'You.com'
      when lower(coalesce(s.source,'')) like '%phind%'
        or lower(coalesce(s.referrer,'')) like '%phind.com%' then 'Phind'
      when lower(coalesce(s.source,'')) like '%poe%'
        or lower(coalesce(s.referrer,'')) like '%poe.com%' then 'Poe'
      when lower(coalesce(s.source,'')) like '%mistral%'
        or lower(coalesce(s.referrer,'')) like '%mistral.ai%' then 'Mistral'
      else 'Other AI referral'
    end as provider,
    s.lead_id
  from public.web_sessions s
  join session_bounds b
    on b.organization_id = s.organization_id
   and s.started_at::date between b.range_start and b.range_end
  where
    lower(coalesce(s.source,'')) ~ '(^|[./_-])(chatgpt|openai|perplexity|gemini|bard|copilot|claude|anthropic|you|phind|poe|mistral)([./_-]|$)'
    or lower(coalesce(s.referrer,'')) ~ '(chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|copilot\.com|claude\.ai|anthropic\.com|you\.com|phind\.com|poe\.com|mistral\.ai)'
    or lower(coalesce(s.medium,'')) in ('ai-assistant','ai_assistant','assistant','generative-ai','generative_ai')
), page_ai as materialized (
  select
    organization_id,
    landing_page_key,
    min(range_start) as referral_range_start,
    max(range_end) as referral_range_end,
    count(*)::bigint as ai_referral_sessions,
    count(distinct lead_id) filter (where lead_id is not null)::bigint as ai_linked_leads,
    array_agg(distinct provider order by provider) as observed_ai_providers
  from ai_sessions
  where nullif(landing_page_key,'') is not null
  group by organization_id, landing_page_key
), entity_quality as materialized (
  select
    organization_id,
    count(*)::bigint as entity_count,
    count(*) filter (where nullif(btrim(description),'') is not null)::bigint as described_entity_count,
    count(*) filter (where nullif(btrim(external_id),'') is not null)::bigint as external_id_entity_count,
    count(*) filter (where nullif(btrim(external_source),'') is not null)::bigint as external_source_entity_count
  from public.seo_semantic_entities
  group by organization_id
), topic_quality as materialized (
  select
    organization_id,
    count(*)::bigint as topic_count,
    count(*) filter (where nullif(btrim(description),'') is not null)::bigint as described_topic_count,
    count(*) filter (where parent_topic_id is not null)::bigint as child_topic_count
  from public.seo_semantic_topics
  group by organization_id
), ai_ledger as materialized (
  select
    organization_id,
    count(*)::bigint as ai_analysis_runs,
    count(*) filter (where status='completed')::bigint as completed_ai_analysis_runs,
    max(completed_at) as last_ai_analysis_at
  from public.seo_ai_analysis_runs
  group by organization_id
)
select
  p.organization_id,
  p.site_id,
  p.page_id,
  p.hostname,
  p.normalized_url,
  p.url_path,
  p.page_type,
  p.title,
  p.is_indexable,
  p.snapshot_id,
  p.fetched_at,
  p.word_count,
  p.schema_types,
  coalesce(c.topic_count,0)::bigint as page_topic_count,
  coalesce(c.entity_count,0)::bigint as page_entity_count,
  coalesce(c.semantic_coverage_score_v1,0)::integer as semantic_coverage_score_v1,
  coalesce(a.answer_readiness_score_v1,0)::integer as answer_readiness_score_v1,
  coalesce(a.answer_query_count,0)::integer as answer_query_count,
  coalesce(a.high_opportunity_query_count,0)::integer as high_opportunity_answer_queries,
  coalesce(pa.ai_referral_sessions,0)::bigint as ai_referral_sessions,
  coalesce(pa.ai_linked_leads,0)::bigint as ai_linked_leads,
  coalesce(pa.observed_ai_providers,'{}'::text[]) as observed_ai_providers,
  pa.referral_range_start,
  pa.referral_range_end,
  coalesce(eq.entity_count,0)::bigint as organization_entity_count,
  coalesce(eq.described_entity_count,0)::bigint as described_entity_count,
  coalesce(eq.external_id_entity_count,0)::bigint as external_id_entity_count,
  coalesce(eq.external_source_entity_count,0)::bigint as external_source_entity_count,
  coalesce(tq.topic_count,0)::bigint as organization_topic_count,
  coalesce(tq.described_topic_count,0)::bigint as described_topic_count,
  coalesce(tq.child_topic_count,0)::bigint as child_topic_count,
  coalesce(al.ai_analysis_runs,0)::bigint as ai_analysis_runs,
  coalesce(al.completed_ai_analysis_runs,0)::bigint as completed_ai_analysis_runs,
  al.last_ai_analysis_at,
  least(
    100,
    (case when p.snapshot_id is not null then 15 else 0 end)
    + (case when p.is_indexable is true then 10 else 0 end)
    + least(25, floor(coalesce(c.semantic_coverage_score_v1,0)::numeric / 4)::integer)
    + (case when coalesce(c.topic_count,0) > 0 then 10 else 0 end)
    + (case when coalesce(c.entity_count,0) > 0 then 10 else 0 end)
    + least(20, floor(coalesce(a.answer_readiness_score_v1,0)::numeric / 5)::integer)
    + (case when coalesce(pa.ai_referral_sessions,0) > 0 then 10 else 0 end)
  )::integer as generative_readiness_score_v1,
  case
    when p.snapshot_id is null then 'uncrawled'
    when p.is_indexable is false then 'non_indexable'
    when coalesce(pa.ai_referral_sessions,0) > 0 then 'observed_ai_referral_entry'
    when coalesce(c.semantic_coverage_score_v1,0) >= 70
      and coalesce(c.entity_count,0) > 0
      and coalesce(c.topic_count,0) > 0
      and coalesce(a.answer_readiness_score_v1,0) >= 70 then 'strong_discoverability_readiness'
    when coalesce(c.entity_count,0) = 0 then 'weak_entity_clarity'
    when coalesce(c.topic_count,0) = 0 then 'weak_topic_clarity'
    when coalesce(a.answer_readiness_score_v1,0) < 50 then 'weak_answer_clarity'
    else 'developing_discoverability_readiness'
  end as geo_state,
  case
    when p.snapshot_id is null then 'crawl_page'
    when p.is_indexable is false then 'fix_indexability'
    when coalesce(pa.ai_referral_sessions,0) > 0
      and coalesce(c.semantic_coverage_score_v1,0) < 70 then 'strengthen_observed_ai_entry'
    when coalesce(pa.ai_referral_sessions,0) > 0 then 'protect_observed_ai_entry'
    when coalesce(c.entity_count,0) = 0 then 'strengthen_entity_clarity'
    when coalesce(c.topic_count,0) = 0 then 'strengthen_topic_clarity'
    when coalesce(a.answer_readiness_score_v1,0) < 50 then 'strengthen_answer_clarity'
    when coalesce(c.semantic_coverage_score_v1,0) < 70 then 'strengthen_semantic_coverage'
    else 'monitor'
  end as recommended_action,
  case
    when p.snapshot_id is null then
      'Crawl evidence is required before judging generative discoverability readiness.'
    when p.is_indexable is false then
      'Resolve indexability before investing in GEO improvements for this page.'
    when coalesce(pa.ai_referral_sessions,0) > 0 and coalesce(c.semantic_coverage_score_v1,0) < 70 then
      'Observed AI referral sessions already reach this page. Strengthen topic/entity clarity and concise answer structure without changing the evidence trail.'
    when coalesce(pa.ai_referral_sessions,0) > 0 then
      'Observed AI referral sessions already reach this page. Protect the entry page, keep facts explicit and maintain strong semantic and answer clarity.'
    when coalesce(c.entity_count,0) = 0 then
      'No page-level entity mapping is observed. Clarify the people, organizations, places, credentials and other entities that the page genuinely represents.'
    when coalesce(c.topic_count,0) = 0 then
      'No page-level topic mapping is observed. Clarify the primary topic and supporting topical relationships before expanding content.'
    when coalesce(a.answer_readiness_score_v1,0) < 50 then
      'The page has weak answer readiness. Improve concise answer-first sections using proven search demand before considering model-specific optimization.'
    when coalesce(c.semantic_coverage_score_v1,0) < 70 then
      'Semantic coverage is developing. Improve topic/entity completeness and internal evidence before making generative-visibility claims.'
    else
      'Current deterministic evidence indicates solid discoverability readiness; monitor observed AI referrals and future model-probe evidence.'
  end as recommendation
from public.v_seo_page_inventory p
left join public.v_seo_semantic_page_coverage c
  on c.organization_id=p.organization_id
 and c.page_id=p.page_id
left join public.v_seo_aeo_page_readiness_v1 a
  on a.organization_id=p.organization_id
 and a.page_id=p.page_id
left join page_ai pa
  on pa.organization_id=p.organization_id
 and pa.landing_page_key=lower(regexp_replace(p.normalized_url,'/+$',''))
left join entity_quality eq
  on eq.organization_id=p.organization_id
left join topic_quality tq
  on tq.organization_id=p.organization_id
left join ai_ledger al
  on al.organization_id=p.organization_id;

revoke all on table public.v_seo_geo_page_intelligence_v1 from public, anon;
grant select on table public.v_seo_geo_page_intelligence_v1 to authenticated, service_role;


create or replace function public.get_seo_geo_intelligence(
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

  with providers as materialized (
    select *
    from public.v_seo_geo_ai_provider_30d
    where organization_id=p_organization_id
  ),
  pages as materialized (
    select *
    from public.v_seo_geo_page_intelligence_v1
    where organization_id=p_organization_id
  ),
  provider_payload as (
    select coalesce(
      jsonb_agg(to_jsonb(x) order by x.sessions desc, x.provider asc),
      '[]'::jsonb
    ) as payload
    from providers x
  ),
  page_payload as (
    select coalesce(
      jsonb_agg(to_jsonb(x) order by x.geo_priority desc, x.ai_referral_sessions desc, x.normalized_url asc),
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
        word_count,
        schema_types,
        page_topic_count,
        page_entity_count,
        semantic_coverage_score_v1,
        answer_readiness_score_v1,
        answer_query_count,
        high_opportunity_answer_queries,
        ai_referral_sessions,
        ai_linked_leads,
        observed_ai_providers,
        generative_readiness_score_v1,
        geo_state,
        recommended_action,
        recommendation,
        least(
          100,
          generative_readiness_score_v1
          + case when ai_referral_sessions >= 20 then 20
                 when ai_referral_sessions >= 5 then 12
                 when ai_referral_sessions > 0 then 6
                 else 0 end
          + least(15, high_opportunity_answer_queries * 3)
        )::integer as geo_priority
      from pages
      where recommended_action <> 'crawl_page'
      order by geo_priority desc, ai_referral_sessions desc, normalized_url asc
      limit 40
    ) x
  ),
  summary as (
    select jsonb_build_object(
      'total_pages', count(*)::bigint,
      'crawled_pages', count(*) filter (where snapshot_id is not null)::bigint,
      'pages_with_observed_ai_referrals', count(*) filter (where ai_referral_sessions > 0)::bigint,
      'first_party_ai_referral_sessions', coalesce(sum(ai_referral_sessions),0)::bigint,
      'ai_linked_leads', coalesce(sum(ai_linked_leads),0)::bigint,
      'strong_readiness_pages', count(*) filter (where geo_state='strong_discoverability_readiness')::bigint,
      'priority_geo_actions', count(*) filter (where recommended_action not in ('monitor','crawl_page'))::bigint,
      'organization_entities', coalesce(max(organization_entity_count),0)::bigint,
      'described_entities', coalesce(max(described_entity_count),0)::bigint,
      'externally_identified_entities', coalesce(max(external_id_entity_count),0)::bigint,
      'organization_topics', coalesce(max(organization_topic_count),0)::bigint,
      'described_topics', coalesce(max(described_topic_count),0)::bigint,
      'topic_relations', (
        select count(*)::bigint from public.seo_topic_relations where organization_id=p_organization_id
      ),
      'entity_relations', (
        select count(*)::bigint from public.seo_entity_relations where organization_id=p_organization_id
      ),
      'ai_analysis_runs', coalesce(max(ai_analysis_runs),0)::bigint,
      'completed_ai_analysis_runs', coalesce(max(completed_ai_analysis_runs),0)::bigint,
      'best_generative_readiness', coalesce(max(generative_readiness_score_v1),0)::integer
    ) as payload
    from pages
  ),
  provider_summary as (
    select jsonb_build_object(
      'providers_observed', count(*)::bigint,
      'ga4_ai_sessions', coalesce(sum(sessions),0)::bigint,
      'ga4_ai_users', coalesce(sum(users),0)::bigint,
      'ga4_ai_engaged_sessions', coalesce(sum(engaged_sessions),0)::bigint,
      'ga4_ai_key_events', coalesce(sum(key_events),0)::numeric,
      'range_start', min(range_start),
      'range_end', max(range_end)
    ) as payload
    from providers
  )
  select jsonb_build_object(
    'summary', s.payload || ps.payload,
    'providers', pp.payload,
    'pages', pg.payload,
    'guardrails', jsonb_build_object(
      'referrals_are_observed', true,
      'citations_measured', false,
      'model_mentions_measured', false,
      'model_rankings_measured', false,
      'readiness_is_deterministic', true,
      'note', 'AI referral traffic is observed evidence. Generative readiness is a deterministic content/entity/topic score. No citation, mention or recommendation share is inferred without model-probe evidence.'
    )
  )
  into result_payload
  from summary s
  cross join provider_summary ps
  cross join provider_payload pp
  cross join page_payload pg;

  return coalesce(result_payload, jsonb_build_object(
    'summary','{}'::jsonb,
    'providers','[]'::jsonb,
    'pages','[]'::jsonb,
    'guardrails',jsonb_build_object(
      'referrals_are_observed',true,
      'citations_measured',false,
      'model_mentions_measured',false,
      'model_rankings_measured',false,
      'readiness_is_deterministic',true
    )
  ));
end;
$function$;

revoke all on function public.get_seo_geo_intelligence(uuid) from public, anon;
grant execute on function public.get_seo_geo_intelligence(uuid) to authenticated, service_role;

comment on function public.get_seo_geo_intelligence(uuid) is
'Tenant-scoped W6-OG7 GEO / AI visibility intelligence. Reports observed AI referral traffic separately from deterministic generative-discoverability readiness and does not infer unobserved citations or model mentions.';
