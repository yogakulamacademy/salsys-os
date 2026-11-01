create or replace view public.v_seo_ai_visibility_probe_history_v1
with (security_invoker = true)
as
select
  r.organization_id,
  r.id as run_id,
  r.site_id,
  r.provider,
  r.model_name,
  r.probe_kind,
  r.prompt_text,
  r.locale,
  r.country_code,
  r.status,
  r.requested_at,
  r.started_at,
  r.completed_at,
  r.error_message,
  r.created_by,
  o.id as observation_id,
  o.observed_at,
  o.brand_mentioned,
  o.brand_recommended,
  o.mention_count,
  o.recommendation_position,
  o.response_excerpt,
  o.evidence_hash,
  coalesce(c.citation_count, 0)::bigint as citation_count,
  coalesce(c.owned_domain_citation_count, 0)::bigint as owned_domain_citation_count,
  c.cited_domains,
  case
    when r.status = 'failed' then 'failed'
    when r.status in ('pending', 'running') then 'in_progress'
    when r.status = 'completed' and o.id is null then 'completed_without_observation'
    when r.status = 'completed' and o.brand_recommended then 'recommended'
    when r.status = 'completed' and o.brand_mentioned then 'mentioned'
    when r.status = 'completed' then 'not_observed'
    else coalesce(r.status, 'unknown')
  end as measured_result
from public.seo_ai_visibility_probe_runs r
left join lateral (
  select obs.*
  from public.seo_ai_visibility_observations obs
  where obs.organization_id = r.organization_id
    and obs.run_id = r.id
  order by obs.observed_at desc, obs.created_at desc
  limit 1
) o on true
left join lateral (
  select
    count(*) as citation_count,
    count(*) filter (where cit.is_owned_domain) as owned_domain_citation_count,
    array_agg(distinct cit.cited_domain order by cit.cited_domain)
      filter (where cit.cited_domain is not null) as cited_domains
  from public.seo_ai_visibility_citations cit
  where cit.organization_id = r.organization_id
    and cit.observation_id = o.id
) c on true;

comment on view public.v_seo_ai_visibility_probe_history_v1 is
  'R9 tenant-safe AI visibility probe history. Direct model observations are measured evidence; AEO/GEO readiness and AI-referral traffic are separate evidence classes.';

grant select on public.v_seo_ai_visibility_probe_history_v1 to authenticated;
