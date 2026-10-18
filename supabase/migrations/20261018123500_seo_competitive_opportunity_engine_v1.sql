-- Competitive Opportunity Engine v1
-- Deterministically ranks observed SEO/AEO/GEO gaps using fresh ranking evidence,
-- tracked priority, page business value and page-level SEO readiness.

create or replace view public.v_seo_competitive_opportunities_v1
with (security_invoker=true)
as
with latest as (
  select
    r.*,
    case
      when r.surface='seo' then
        case
          when r.own_position is null then 100
          when r.own_position > 20 then 90
          when r.own_position > 10 then 75
          when r.own_position > 5 then 55
          when r.own_position > 3 then 35
          else 10
        end
      when r.surface='aeo' then
        case when r.answer_visibility=false then 90 when r.answer_visibility=true then 10 else 0 end
      when r.surface='geo' then
        case when r.ai_cited=false then 90 when r.ai_cited=true then 10 else 0 end
      else 0
    end::integer as gap_score,
    least(100, jsonb_array_length(case when jsonb_typeof(r.competitor_results)='array' then r.competitor_results else '[]'::jsonb end) * 20)::integer as competitor_pressure_score,
    jsonb_array_length(case when jsonb_typeof(r.competitor_results)='array' then r.competitor_results else '[]'::jsonb end)::integer as competitor_count,
    coalesce((
      select array_agg(distinct domain order by domain)
      from (
        select nullif(coalesce(x->>'domain',x->>'display_name',x->>'name'),'') as domain
        from jsonb_array_elements(case when jsonb_typeof(r.competitor_results)='array' then r.competitor_results else '[]'::jsonb end) x
      ) d
      where domain is not null
    ),array[]::text[]) as competitor_domains
  from public.v_seo_rank_latest_v1 r
  where r.observed_at is not null
), mapped as (
  select
    l.*,
    p.id as page_id,
    coalesce(p.normalized_url,p.canonical_url,l.own_url) as mapped_url,
    cv.title as page_title,
    coalesce(ov.revenue_priority_score_v1,0)::integer as business_score,
    coalesce(ov.organic_leads,0)::bigint as organic_leads,
    coalesce(ov.organic_qualified_leads,0)::bigint as organic_qualified_leads,
    coalesce(ov.organic_enrolled_leads,0)::bigint as organic_enrolled_leads,
    coalesce(ov.organic_revenue_inr,0)::numeric as organic_revenue_inr,
    coalesce(ov.organic_revenue_usd,0)::numeric as organic_revenue_usd,
    coalesce(cv.technical_issue_count,0)::integer as technical_issue_count,
    coalesce(cv.semantic_coverage_score_v1,0)::integer as semantic_coverage_score,
    coalesce(cv.internal_link_opportunities,0)::integer as internal_link_opportunities,
    cv.recommended_action as content_recommended_action,
    cv.action_reason as content_action_reason,
    coalesce(aeo.answer_readiness_score_v1,0)::integer as answer_readiness_score,
    aeo.recommended_action as aeo_recommended_action,
    aeo.recommendation as aeo_recommendation,
    coalesce(geo.generative_readiness_score_v1,0)::integer as generative_readiness_score,
    geo.recommended_action as geo_recommended_action,
    geo.recommendation as geo_recommendation
  from latest l
  left join lateral (
    select sp.*
    from public.seo_pages sp
    where sp.organization_id=l.organization_id
      and l.own_url is not null
      and (sp.normalized_url=l.own_url or sp.canonical_url=l.own_url)
    order by case when sp.normalized_url=l.own_url then 0 else 1 end, sp.updated_at desc
    limit 1
  ) p on true
  left join lateral (
    select c.* from public.v_seo_content_page_intelligence_v1 c
    where c.organization_id=l.organization_id and c.page_id=p.id
    limit 1
  ) cv on true
  left join lateral (
    select o.* from public.v_seo_organic_value_page_30d o
    where o.organization_id=l.organization_id and o.page_id=p.id
    limit 1
  ) ov on true
  left join lateral (
    select a.* from public.v_seo_aeo_page_readiness_v1 a
    where a.organization_id=l.organization_id and a.page_id=p.id
    limit 1
  ) aeo on true
  left join lateral (
    select g.* from public.v_seo_geo_page_intelligence_v1 g
    where g.organization_id=l.organization_id and g.page_id=p.id
    limit 1
  ) geo on true
), scored as (
  select
    m.*,
    least(100,greatest(0,round(
      (m.gap_score * 0.45) +
      (coalesce(m.priority,50) * 0.25) +
      (m.business_score * 0.20) +
      (m.competitor_pressure_score * 0.10)
    )))::integer as competitive_priority_score,
    case
      when m.observed_at >= now()-interval '24 hours' then 'high'
      when m.observed_at >= now()-interval '72 hours' then 'medium'
      else 'low'
    end::text as evidence_confidence,
    case
      when m.surface='seo' and m.gap_score >= 35 and m.technical_issue_count > 0 then 'technical_fix'
      when m.surface='seo' and m.gap_score >= 35 and m.semantic_coverage_score < 60 then 'content_depth'
      when m.surface='seo' and m.gap_score >= 35 and m.internal_link_opportunities > 0 then 'internal_linking'
      when m.surface='seo' and m.gap_score >= 35 then 'content_metadata_improvement'
      when m.surface='aeo' and m.answer_visibility=false and m.answer_readiness_score < 60 then 'answer_first_content'
      when m.surface='aeo' and m.answer_visibility=false then 'aeo_structure'
      when m.surface='geo' and m.ai_cited=false and m.generative_readiness_score < 60 then 'entity_evidence'
      when m.surface='geo' and m.ai_cited=false then 'geo_citation_readiness'
      else 'monitor'
    end::text as action_class
  from mapped m
)
select
  s.organization_id,
  s.target_id,
  s.site_id,
  s.query,
  s.surface,
  s.locale,
  s.country_code,
  s.device,
  s.engine,
  s.priority as target_priority,
  s.observed_at,
  s.own_position,
  s.own_url,
  s.answer_visibility,
  s.ai_cited,
  s.ai_citation_position,
  s.ai_provider,
  s.competitor_count,
  s.competitor_domains,
  s.gap_score,
  s.competitor_pressure_score,
  s.page_id,
  s.mapped_url,
  s.page_title,
  s.business_score,
  s.organic_leads,
  s.organic_qualified_leads,
  s.organic_enrolled_leads,
  s.organic_revenue_inr,
  s.organic_revenue_usd,
  s.technical_issue_count,
  s.semantic_coverage_score,
  s.internal_link_opportunities,
  s.answer_readiness_score,
  s.generative_readiness_score,
  s.competitive_priority_score,
  s.evidence_confidence,
  s.action_class,
  case
    when s.action_class='technical_fix' then coalesce(s.content_recommended_action,'Resolve technical issues on the ranking page before expanding content.')
    when s.action_class='content_depth' then coalesce(s.content_recommended_action,'Strengthen topical depth and semantic coverage on the existing page.')
    when s.action_class='internal_linking' then 'Add relevant internal links to strengthen authority and discovery for this page.'
    when s.action_class='content_metadata_improvement' then coalesce(s.content_recommended_action,'Improve the existing page content and search snippet before creating another competing page.')
    when s.action_class='answer_first_content' then coalesce(s.aeo_recommended_action,'Add a concise answer-first section that directly resolves the tracked question or intent.')
    when s.action_class='aeo_structure' then coalesce(s.aeo_recommended_action,'Improve answer structure, headings and supported structured data for answer-engine extraction.')
    when s.action_class='entity_evidence' then coalesce(s.geo_recommended_action,'Strengthen explicit entities, credentials, facts and citation-friendly evidence on the target page.')
    when s.action_class='geo_citation_readiness' then coalesce(s.geo_recommended_action,'Improve generative-engine citation readiness and explicit evidence signals.')
    else 'Keep monitoring this target; current observed gap does not justify a high-priority change.'
  end::text as recommended_action,
  case
    when s.surface='seo' then concat_ws(' ',
      case when s.own_position is null then 'No owned organic result was observed.' else 'Observed organic position: '||s.own_position::text||'.' end,
      case when s.competitor_count>0 then s.competitor_count::text||' competitor result(s) were observed.' end,
      case when s.business_score>0 then 'Mapped page business priority: '||s.business_score::text||'/100.' end
    )
    when s.surface='aeo' then concat_ws(' ',
      case when s.answer_visibility=false then 'No owned answer-engine visibility was observed.' when s.answer_visibility=true then 'Owned answer visibility was observed.' end,
      case when s.competitor_count>0 then s.competitor_count::text||' competitor result(s) were observed.' end,
      case when s.page_id is not null then 'Mapped page answer readiness: '||s.answer_readiness_score::text||'/100.' end
    )
    when s.surface='geo' then concat_ws(' ',
      case when s.ai_cited=false then 'No owned AI citation was observed.' when s.ai_cited=true then 'Owned AI citation was observed.' end,
      case when s.competitor_count>0 then s.competitor_count::text||' competitor result(s) were observed.' end,
      case when s.page_id is not null then 'Mapped page GEO readiness: '||s.generative_readiness_score::text||'/100.' end
    )
  end::text as reason
from scored s
where s.gap_score > 10
order by s.competitive_priority_score desc,s.observed_at desc;

revoke all on public.v_seo_competitive_opportunities_v1 from public,anon,authenticated;
grant select on public.v_seo_competitive_opportunities_v1 to service_role;
