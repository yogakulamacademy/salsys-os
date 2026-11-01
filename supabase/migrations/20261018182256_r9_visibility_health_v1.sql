-- R9 AEO / GEO / AI visibility operational health v1
-- Evidence-first health surface. Keeps deterministic readiness separate from directly observed model visibility.

create or replace view public.v_seo_r9_health_v1
with (security_invoker = true)
as
with aeo_pages as materialized (
  select
    organization_id,
    count(*)::bigint as aeo_page_rows,
    count(*) filter (where snapshot_id is not null)::bigint as aeo_crawled_pages,
    count(*) filter (where has_answer_sections)::bigint as pages_with_answer_sections,
    count(*) filter (where answer_query_count > 0)::bigint as pages_with_answer_demand,
    count(*) filter (where high_opportunity_query_count > 0)::bigint as pages_with_high_opportunity_answers,
    round(avg(answer_readiness_score_v1)::numeric, 1) as avg_answer_readiness_score
  from public.v_seo_aeo_page_readiness_v1
  group by organization_id
),
aeo_queries as materialized (
  select
    organization_id,
    count(*)::bigint as answer_query_rows,
    count(*) filter (where answer_opportunity_score_v1 >= 70)::bigint as high_opportunity_answer_queries,
    coalesce(sum(clicks),0)::bigint as answer_query_clicks,
    coalesce(sum(impressions),0)::bigint as answer_query_impressions
  from public.v_seo_aeo_query_demand_30d
  group by organization_id
),
geo_pages as materialized (
  select
    organization_id,
    count(*)::bigint as geo_page_rows,
    count(*) filter (where snapshot_id is not null)::bigint as geo_crawled_pages,
    count(*) filter (where ai_referral_sessions > 0)::bigint as pages_with_ai_referrals,
    coalesce(sum(ai_referral_sessions),0)::bigint as ai_referral_sessions,
    coalesce(sum(ai_linked_leads),0)::bigint as ai_linked_leads,
    count(*) filter (where geo_state='strong_discoverability_readiness')::bigint as strong_geo_readiness_pages,
    count(*) filter (where recommended_action not in ('monitor','crawl_page'))::bigint as geo_action_pages,
    round(avg(generative_readiness_score_v1)::numeric, 1) as avg_generative_readiness_score,
    coalesce(max(ai_analysis_runs),0)::bigint as ai_analysis_runs,
    coalesce(max(completed_ai_analysis_runs),0)::bigint as completed_ai_analysis_runs,
    max(last_ai_analysis_at) as last_ai_analysis_at
  from public.v_seo_geo_page_intelligence_v1
  group by organization_id
),
providers as materialized (
  select
    organization_id,
    count(*)::bigint as observed_ai_providers,
    coalesce(sum(sessions),0)::bigint as ga4_ai_sessions,
    coalesce(sum(users),0)::bigint as ga4_ai_users,
    coalesce(sum(engaged_sessions),0)::bigint as ga4_ai_engaged_sessions,
    coalesce(sum(key_events),0)::numeric as ga4_ai_key_events,
    min(range_start) as ai_referral_range_start,
    max(range_end) as ai_referral_range_end
  from public.v_seo_geo_ai_provider_30d
  group by organization_id
),
probe_runs as materialized (
  select
    organization_id,
    count(*)::bigint as probe_runs,
    count(*) filter (where status='completed')::bigint as completed_probe_runs,
    count(*) filter (where status='failed')::bigint as failed_probe_runs,
    count(*) filter (where status in ('queued','running'))::bigint as pending_probe_runs,
    count(distinct provider) filter (where status='completed')::bigint as probed_providers,
    max(completed_at) filter (where status='completed') as last_probe_completed_at,
    max(completed_at) filter (where status='failed') as last_probe_failed_at
  from public.seo_ai_visibility_probe_runs
  group by organization_id
),
observations as materialized (
  select
    organization_id,
    count(*)::bigint as model_observations,
    count(*) filter (where brand_mentioned)::bigint as mention_observations,
    count(*) filter (where brand_recommended)::bigint as recommendation_observations,
    coalesce(sum(mention_count),0)::bigint as total_brand_mentions,
    min(recommendation_position) filter (where brand_recommended) as best_recommendation_position,
    max(observed_at) as last_model_observation_at
  from public.seo_ai_visibility_observations
  group by organization_id
),
citations as materialized (
  select
    organization_id,
    count(*)::bigint as citations_observed,
    count(*) filter (where is_owned_domain)::bigint as owned_domain_citations,
    count(distinct cited_domain)::bigint as cited_domains,
    max(observed_at) as last_citation_observed_at
  from public.seo_ai_visibility_citations
  group by organization_id
)
select
  o.id as organization_id,
  coalesce(ap.aeo_page_rows,0)::bigint as aeo_page_rows,
  coalesce(ap.aeo_crawled_pages,0)::bigint as aeo_crawled_pages,
  coalesce(ap.pages_with_answer_sections,0)::bigint as pages_with_answer_sections,
  coalesce(ap.pages_with_answer_demand,0)::bigint as pages_with_answer_demand,
  coalesce(ap.pages_with_high_opportunity_answers,0)::bigint as pages_with_high_opportunity_answers,
  coalesce(ap.avg_answer_readiness_score,0)::numeric as avg_answer_readiness_score,
  coalesce(aq.answer_query_rows,0)::bigint as answer_query_rows,
  coalesce(aq.high_opportunity_answer_queries,0)::bigint as high_opportunity_answer_queries,
  coalesce(aq.answer_query_clicks,0)::bigint as answer_query_clicks,
  coalesce(aq.answer_query_impressions,0)::bigint as answer_query_impressions,
  coalesce(gp.geo_page_rows,0)::bigint as geo_page_rows,
  coalesce(gp.geo_crawled_pages,0)::bigint as geo_crawled_pages,
  coalesce(gp.pages_with_ai_referrals,0)::bigint as pages_with_ai_referrals,
  coalesce(gp.ai_referral_sessions,0)::bigint as ai_referral_sessions,
  coalesce(gp.ai_linked_leads,0)::bigint as ai_linked_leads,
  coalesce(gp.strong_geo_readiness_pages,0)::bigint as strong_geo_readiness_pages,
  coalesce(gp.geo_action_pages,0)::bigint as geo_action_pages,
  coalesce(gp.avg_generative_readiness_score,0)::numeric as avg_generative_readiness_score,
  coalesce(gp.ai_analysis_runs,0)::bigint as ai_analysis_runs,
  coalesce(gp.completed_ai_analysis_runs,0)::bigint as completed_ai_analysis_runs,
  gp.last_ai_analysis_at,
  coalesce(pr.observed_ai_providers,0)::bigint as observed_ai_providers,
  coalesce(pr.ga4_ai_sessions,0)::bigint as ga4_ai_sessions,
  coalesce(pr.ga4_ai_users,0)::bigint as ga4_ai_users,
  coalesce(pr.ga4_ai_engaged_sessions,0)::bigint as ga4_ai_engaged_sessions,
  coalesce(pr.ga4_ai_key_events,0)::numeric as ga4_ai_key_events,
  pr.ai_referral_range_start,
  pr.ai_referral_range_end,
  coalesce(r.probe_runs,0)::bigint as probe_runs,
  coalesce(r.completed_probe_runs,0)::bigint as completed_probe_runs,
  coalesce(r.failed_probe_runs,0)::bigint as failed_probe_runs,
  coalesce(r.pending_probe_runs,0)::bigint as pending_probe_runs,
  coalesce(r.probed_providers,0)::bigint as probed_providers,
  r.last_probe_completed_at,
  r.last_probe_failed_at,
  coalesce(ob.model_observations,0)::bigint as model_observations,
  coalesce(ob.mention_observations,0)::bigint as mention_observations,
  coalesce(ob.recommendation_observations,0)::bigint as recommendation_observations,
  coalesce(ob.total_brand_mentions,0)::bigint as total_brand_mentions,
  ob.best_recommendation_position,
  ob.last_model_observation_at,
  coalesce(c.citations_observed,0)::bigint as citations_observed,
  coalesce(c.owned_domain_citations,0)::bigint as owned_domain_citations,
  coalesce(c.cited_domains,0)::bigint as cited_domains,
  c.last_citation_observed_at,
  case
    when coalesce(ap.aeo_page_rows,0)=0 and coalesce(gp.geo_page_rows,0)=0 then 'foundation_missing'
    when coalesce(r.probe_runs,0)=0 then 'probe_evidence_not_started'
    when coalesce(r.failed_probe_runs,0)>0 and coalesce(r.completed_probe_runs,0)=0 then 'probe_execution_attention'
    when coalesce(r.pending_probe_runs,0)>0 then 'probe_execution_pending'
    when coalesce(r.completed_probe_runs,0)>0 and coalesce(ob.model_observations,0)=0 then 'probe_observation_attention'
    else 'healthy'
  end as operational_status,
  case
    when coalesce(r.probe_runs,0)=0 then false
    else coalesce(r.completed_probe_runs,0)>0
  end as measured_model_visibility_available,
  true as ai_referrals_are_observed,
  true as readiness_is_deterministic,
  (coalesce(c.citations_observed,0)>0) as citation_evidence_available
from public.organizations o
left join aeo_pages ap on ap.organization_id=o.id
left join aeo_queries aq on aq.organization_id=o.id
left join geo_pages gp on gp.organization_id=o.id
left join providers pr on pr.organization_id=o.id
left join probe_runs r on r.organization_id=o.id
left join observations ob on ob.organization_id=o.id
left join citations c on c.organization_id=o.id;

revoke all on table public.v_seo_r9_health_v1 from public, anon;
grant select on table public.v_seo_r9_health_v1 to authenticated, service_role;

comment on view public.v_seo_r9_health_v1 is
'Canonical R9 AEO/GEO/AI visibility health model. Separates observed AI referrals, deterministic readiness, and directly measured model-probe evidence; it does not infer unobserved mentions, recommendations, rankings, or citations.';
