create or replace view public.v_seo_r9_closeout_readiness_v1
with (security_invoker = true)
as
select
  h.organization_id,
  h.aeo_page_rows,
  h.pages_with_answer_demand,
  h.geo_page_rows,
  h.observed_ai_providers,
  h.ga4_ai_sessions,
  h.ai_linked_leads,
  h.probe_runs,
  h.completed_probe_runs,
  h.failed_probe_runs,
  h.model_observations,
  h.mention_observations,
  h.recommendation_observations,
  h.citations_observed,
  h.operational_status,
  h.measured_model_visibility_available,
  h.ai_referrals_are_observed,
  h.readiness_is_deterministic,
  h.citation_evidence_available,
  coalesce(i.orphan_observations, 0)::bigint as orphan_observations,
  coalesce(i.orphan_citations, 0)::bigint as orphan_citations,
  coalesce(i.observation_tenant_mismatches, 0)::bigint as observation_tenant_mismatches,
  coalesce(i.citation_tenant_mismatches, 0)::bigint as citation_tenant_mismatches,
  coalesce(i.completed_missing_completed_at, 0)::bigint as completed_missing_completed_at,
  coalesce(i.failed_missing_error, 0)::bigint as failed_missing_error,
  (
    coalesce(i.orphan_observations, 0) = 0
    and coalesce(i.orphan_citations, 0) = 0
    and coalesce(i.observation_tenant_mismatches, 0) = 0
    and coalesce(i.citation_tenant_mismatches, 0) = 0
    and coalesce(i.completed_missing_completed_at, 0) = 0
    and coalesce(i.failed_missing_error, 0) = 0
  ) as technical_integrity_clean,
  case
    when coalesce(i.orphan_observations, 0) > 0
      or coalesce(i.orphan_citations, 0) > 0
      or coalesce(i.observation_tenant_mismatches, 0) > 0
      or coalesce(i.citation_tenant_mismatches, 0) > 0
      or coalesce(i.completed_missing_completed_at, 0) > 0
      or coalesce(i.failed_missing_error, 0) > 0
      then 'integrity_attention_required'
    when h.completed_probe_runs = 0 then 'pending_first_real_probe'
    when h.model_observations = 0 then 'pending_probe_observation_validation'
    else 'ready_for_r9_closeout'
  end as r9_closeout_status,
  case
    when h.completed_probe_runs = 0 then
      'Technical R9 controls are present, but a genuine authenticated provider probe must complete before formal closeout.'
    when h.model_observations = 0 then
      'A provider probe completed without measured observation evidence; validate the ingestion path before formal closeout.'
    when coalesce(i.orphan_observations, 0) = 0
      and coalesce(i.orphan_citations, 0) = 0
      and coalesce(i.observation_tenant_mismatches, 0) = 0
      and coalesce(i.citation_tenant_mismatches, 0) = 0
      and coalesce(i.completed_missing_completed_at, 0) = 0
      and coalesce(i.failed_missing_error, 0) = 0
      then 'R9 direct-evidence integrity checks are clean and at least one genuine measured probe observation exists.'
    else 'R9 direct-evidence integrity requires attention before formal closeout.'
  end as closeout_reason
from public.v_seo_r9_health_v1 h
left join lateral (
  select
    (select count(*)
      from public.seo_ai_visibility_observations o
      left join public.seo_ai_visibility_probe_runs r
        on r.id = o.run_id
       and r.organization_id = o.organization_id
      where o.organization_id = h.organization_id
        and r.id is null) as orphan_observations,
    (select count(*)
      from public.seo_ai_visibility_citations c
      left join public.seo_ai_visibility_observations o
        on o.id = c.observation_id
       and o.organization_id = c.organization_id
      where c.organization_id = h.organization_id
        and o.id is null) as orphan_citations,
    (select count(*)
      from public.seo_ai_visibility_observations o
      join public.seo_ai_visibility_probe_runs r on r.id = o.run_id
      where o.organization_id = h.organization_id
        and o.organization_id <> r.organization_id) as observation_tenant_mismatches,
    (select count(*)
      from public.seo_ai_visibility_citations c
      join public.seo_ai_visibility_observations o on o.id = c.observation_id
      where c.organization_id = h.organization_id
        and c.organization_id <> o.organization_id) as citation_tenant_mismatches,
    (select count(*)
      from public.seo_ai_visibility_probe_runs r
      where r.organization_id = h.organization_id
        and r.status = 'completed'
        and r.completed_at is null) as completed_missing_completed_at,
    (select count(*)
      from public.seo_ai_visibility_probe_runs r
      where r.organization_id = h.organization_id
        and r.status = 'failed'
        and coalesce(r.error_message, '') = '') as failed_missing_error
) i on true;

comment on view public.v_seo_r9_closeout_readiness_v1 is
  'R9 tenant-safe closeout readiness. Formal closeout requires clean direct-evidence integrity plus at least one genuine authenticated probe observation; deterministic readiness and AI referrals are not substitutes for measured model visibility.';

grant select on public.v_seo_r9_closeout_readiness_v1 to authenticated;
