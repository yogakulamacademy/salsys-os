begin;

create table if not exists public.seo_decision_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  opportunity_weight numeric(6,4) not null default 0.2200,
  revenue_weight numeric(6,4) not null default 0.2000,
  demand_weight numeric(6,4) not null default 0.1200,
  technical_weight numeric(6,4) not null default 0.1200,
  content_weight numeric(6,4) not null default 0.1200,
  aeo_weight numeric(6,4) not null default 0.0800,
  geo_weight numeric(6,4) not null default 0.0600,
  cannibalization_weight numeric(6,4) not null default 0.0800,
  minimum_priority_score integer not null default 30 check (minimum_priority_score between 0 and 100),
  max_recommendations integer not null default 5 check (max_recommendations between 1 and 25),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_decision_settings_weights_nonnegative check (
    opportunity_weight >= 0 and revenue_weight >= 0 and demand_weight >= 0 and
    technical_weight >= 0 and content_weight >= 0 and aeo_weight >= 0 and
    geo_weight >= 0 and cannibalization_weight >= 0
  ),
  constraint seo_decision_settings_weight_sum_positive check (
    opportunity_weight + revenue_weight + demand_weight + technical_weight +
    content_weight + aeo_weight + geo_weight + cannibalization_weight > 0
  )
);

alter table public.seo_decision_settings enable row level security;
revoke all on public.seo_decision_settings from anon, authenticated;
grant select, insert, update, delete on public.seo_decision_settings to service_role;

insert into public.seo_decision_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create or replace function public.ensure_seo_decision_settings_for_organization_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.seo_decision_settings(organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_seo_decision_settings_for_organization_v1() from public, anon, authenticated;
grant execute on function public.ensure_seo_decision_settings_for_organization_v1() to service_role;

drop trigger if exists trg_organizations_seo_decision_settings_v1 on public.organizations;
create trigger trg_organizations_seo_decision_settings_v1
after insert on public.organizations
for each row execute function public.ensure_seo_decision_settings_for_organization_v1();

create or replace view public.v_seo_decision_candidates_v1
with (security_invoker=true)
as
with topic_competition as (
  select
    ptm.organization_id,
    ptm.topic_id,
    count(distinct ptm.page_id)::integer as competing_pages
  from public.seo_page_topic_map ptm
  group by ptm.organization_id, ptm.topic_id
  having count(distinct ptm.page_id) > 1
),
page_cannibalization as (
  select
    ptm.organization_id,
    ptm.page_id,
    count(distinct ptm.topic_id)::integer as competing_topics,
    coalesce(max(tc.competing_pages),0)::integer as max_competing_pages
  from public.seo_page_topic_map ptm
  join topic_competition tc
    on tc.organization_id=ptm.organization_id
   and tc.topic_id=ptm.topic_id
  group by ptm.organization_id, ptm.page_id
),
page_experiments as (
  select
    e.organization_id,
    e.target_page_id as page_id,
    count(*) filter (where e.status in ('approved','running'))::integer as active_experiments,
    count(*) filter (where e.status='completed' and e.result_classification='positive')::integer as positive_completed_experiments,
    count(*) filter (where e.status='completed' and e.result_classification='negative')::integer as negative_completed_experiments
  from public.seo_experiments e
  where e.target_page_id is not null
  group by e.organization_id, e.target_page_id
),
page_actions as (
  select
    a.organization_id,
    a.target_page_id as page_id,
    count(*) filter (
      where a.execution_status in ('ready','queued','running')
         or a.approval_status='pending'
    )::integer as open_actions
  from public.seo_optimization_actions a
  where a.target_page_id is not null
  group by a.organization_id, a.target_page_id
),
base as (
  select
    c.organization_id,
    c.site_id,
    c.page_id,
    c.hostname,
    c.normalized_url,
    c.url_path,
    c.page_type,
    c.lifecycle_status,
    c.title,
    c.is_indexable,
    coalesce(c.gsc_clicks,0)::bigint as gsc_clicks,
    coalesce(c.gsc_impressions,0)::bigint as gsc_impressions,
    coalesce(c.gsc_ctr,0)::numeric as gsc_ctr,
    coalesce(c.gsc_avg_position,0)::numeric as gsc_avg_position,
    coalesce(c.semantic_coverage_score_v1,0)::integer as semantic_coverage_score,
    coalesce(c.semantic_topic_count,0)::bigint as semantic_topic_count,
    coalesce(c.semantic_entity_count,0)::bigint as semantic_entity_count,
    coalesce(c.technical_issue_count,0)::integer as technical_issue_count,
    coalesce(c.high_technical_issues,0)::integer as high_technical_issues,
    coalesce(c.medium_technical_issues,0)::integer as medium_technical_issues,
    coalesce(c.internal_link_opportunities,0)::integer as internal_link_opportunities,
    coalesce(c.opportunity_score_v1,0)::integer as opportunity_score,
    c.opportunity_reasons,
    c.content_state,
    c.recommended_action as content_recommended_action,
    coalesce(c.action_priority_score,0)::integer as content_action_priority_score,
    c.action_reason as content_action_reason,
    coalesce(r.organic_leads,0)::bigint as organic_leads,
    coalesce(r.organic_qualified_leads,0)::bigint as organic_qualified_leads,
    coalesce(r.organic_enrolled_leads,0)::bigint as organic_enrolled_leads,
    coalesce(r.organic_revenue_inr,0)::numeric as organic_revenue_inr,
    coalesce(r.organic_revenue_usd,0)::numeric as organic_revenue_usd,
    coalesce(r.revenue_priority_score_v1,0)::integer as revenue_priority_score,
    r.business_value_signal,
    coalesce(a.answer_readiness_score_v1,0)::integer as answer_readiness_score,
    coalesce(a.answer_query_count,0)::integer as answer_query_count,
    coalesce(a.high_opportunity_query_count,0)::integer as high_opportunity_answer_queries,
    a.answer_state,
    coalesce(g.generative_readiness_score_v1,0)::integer as generative_readiness_score,
    coalesce(g.ai_referral_sessions,0)::bigint as ai_referral_sessions,
    coalesce(g.ai_linked_leads,0)::bigint as ai_linked_leads,
    g.geo_state,
    coalesce(pc.competing_topics,0)::integer as competing_topics,
    coalesce(pc.max_competing_pages,0)::integer as max_competing_pages,
    coalesce(pe.active_experiments,0)::integer as active_experiments,
    coalesce(pe.positive_completed_experiments,0)::integer as positive_completed_experiments,
    coalesce(pe.negative_completed_experiments,0)::integer as negative_completed_experiments,
    coalesce(pa.open_actions,0)::integer as open_actions,
    s.minimum_priority_score,
    s.max_recommendations,
    s.opportunity_weight,
    s.revenue_weight,
    s.demand_weight,
    s.technical_weight,
    s.content_weight,
    s.aeo_weight,
    s.geo_weight,
    s.cannibalization_weight
  from public.v_seo_content_page_intelligence_v1 c
  join public.seo_decision_settings s
    on s.organization_id=c.organization_id
   and s.enabled=true
  left join public.v_seo_organic_value_page_30d r
    on r.organization_id=c.organization_id
   and r.page_id=c.page_id
  left join public.v_seo_aeo_page_readiness_v1 a
    on a.organization_id=c.organization_id
   and a.page_id=c.page_id
  left join public.v_seo_geo_page_intelligence_v1 g
    on g.organization_id=c.organization_id
   and g.page_id=c.page_id
  left join page_cannibalization pc
    on pc.organization_id=c.organization_id
   and pc.page_id=c.page_id
  left join page_experiments pe
    on pe.organization_id=c.organization_id
   and pe.page_id=c.page_id
  left join page_actions pa
    on pa.organization_id=c.organization_id
   and pa.page_id=c.page_id
  where coalesce(c.lifecycle_status,'active') <> 'retired'
),
scored as (
  select
    b.*,
    least(100,greatest(0,b.opportunity_score))::integer as opportunity_signal,
    least(100,greatest(0,b.revenue_priority_score))::integer as revenue_signal,
    (
      case
        when b.gsc_impressions >= 10000 then 100
        when b.gsc_impressions >= 5000 then 90
        when b.gsc_impressions >= 1000 then 75
        when b.gsc_impressions >= 250 then 55
        when b.gsc_impressions > 0 then 30
        else 0
      end
      + case
          when b.gsc_avg_position between 4 and 20 then 15
          when b.gsc_avg_position > 20 and b.gsc_avg_position <= 50 then 8
          else 0
        end
    )::integer as demand_signal_raw,
    least(100,greatest(0,
      b.high_technical_issues * 40 +
      b.medium_technical_issues * 20 +
      b.technical_issue_count * 8
    ))::integer as technical_gap_signal,
    least(100,greatest(0,
      (100 - b.semantic_coverage_score) + least(25,b.internal_link_opportunities * 5)
    ))::integer as content_gap_signal,
    least(100,greatest(0,100 - b.answer_readiness_score))::integer as aeo_gap_signal,
    least(100,greatest(0,100 - b.generative_readiness_score))::integer as geo_gap_signal,
    least(100,greatest(0,
      b.competing_topics * 35 + greatest(0,b.max_competing_pages - 1) * 15
    ))::integer as cannibalization_signal
  from base b
),
weighted as (
  select
    s.*,
    least(100,s.demand_signal_raw)::integer as demand_signal,
    (
      s.opportunity_weight + s.revenue_weight + s.demand_weight + s.technical_weight +
      s.content_weight + s.aeo_weight + s.geo_weight + s.cannibalization_weight
    )::numeric as total_weight
  from scored s
),
ranked as (
  select
    w.*,
    greatest(
      0,
      least(
        100,
        round(
          (
            w.opportunity_signal * w.opportunity_weight +
            w.revenue_signal * w.revenue_weight +
            w.demand_signal * w.demand_weight +
            w.technical_gap_signal * w.technical_weight +
            w.content_gap_signal * w.content_weight +
            w.aeo_gap_signal * w.aeo_weight +
            w.geo_gap_signal * w.geo_weight +
            w.cannibalization_signal * w.cannibalization_weight
          ) / nullif(w.total_weight,0)
          - case when w.active_experiments > 0 then 20 else 0 end
          - case when w.open_actions > 0 then 15 else 0 end
        )
      )
    )::integer as decision_priority_score
  from weighted w
)
select
  r.organization_id,
  r.site_id,
  r.page_id,
  r.hostname,
  r.normalized_url,
  r.url_path,
  r.page_type,
  r.title,
  r.is_indexable,
  r.decision_priority_score,
  r.minimum_priority_score,
  case
    when r.high_technical_issues > 0 or r.technical_gap_signal >= 70 then 'technical'
    when r.cannibalization_signal >= greatest(r.content_gap_signal,r.aeo_gap_signal,r.geo_gap_signal,55) then 'content_edit'
    when r.internal_link_opportunities > 0 and r.content_gap_signal >= 55 then 'internal_link'
    when r.aeo_gap_signal >= greatest(r.content_gap_signal,r.geo_gap_signal,65) and r.answer_query_count > 0 then 'schema_update'
    when r.geo_gap_signal >= greatest(r.content_gap_signal,70) then 'content_edit'
    when r.content_gap_signal >= 55 then 'content_edit'
    when r.gsc_impressions >= 250 and r.gsc_ctr < 0.03 then 'metadata_edit'
    else 'other'
  end as recommended_action_kind,
  case
    when r.high_technical_issues > 0 or r.technical_gap_signal >= 70 then 'Fix technical blockers on a high-value page'
    when r.cannibalization_signal >= greatest(r.content_gap_signal,r.aeo_gap_signal,r.geo_gap_signal,55) then 'Resolve topic cannibalization before publishing more content'
    when r.internal_link_opportunities > 0 and r.content_gap_signal >= 55 then 'Strengthen internal linking to this opportunity page'
    when r.aeo_gap_signal >= greatest(r.content_gap_signal,r.geo_gap_signal,65) and r.answer_query_count > 0 then 'Improve answer-engine readiness for demonstrated query demand'
    when r.geo_gap_signal >= greatest(r.content_gap_signal,70) then 'Improve generative-search readiness and entity clarity'
    when r.content_gap_signal >= 55 then 'Expand semantic coverage on an existing opportunity page'
    when r.gsc_impressions >= 250 and r.gsc_ctr < 0.03 then 'Improve search snippet relevance and click-through rate'
    else coalesce(r.content_recommended_action,'Review this page for the highest-return SEO improvement')
  end as decision_title,
  concat_ws(
    ' · ',
    'priority ' || r.decision_priority_score::text || '/100',
    case when r.opportunity_signal >= 60 then 'opportunity ' || r.opportunity_signal::text end,
    case when r.revenue_signal >= 40 then 'revenue ' || r.revenue_signal::text end,
    case when r.demand_signal >= 40 then 'demand ' || r.demand_signal::text end,
    case when r.technical_gap_signal >= 40 then 'technical gap ' || r.technical_gap_signal::text end,
    case when r.content_gap_signal >= 40 then 'content gap ' || r.content_gap_signal::text end,
    case when r.aeo_gap_signal >= 50 then 'AEO gap ' || r.aeo_gap_signal::text end,
    case when r.geo_gap_signal >= 50 then 'GEO gap ' || r.geo_gap_signal::text end,
    case when r.cannibalization_signal >= 40 then 'cannibalization ' || r.cannibalization_signal::text end,
    case when r.active_experiments > 0 then 'active experiment penalty applied' end,
    case when r.open_actions > 0 then 'open action penalty applied' end
  ) as decision_reason,
  case
    when r.high_technical_issues > 0 then 'high'
    when r.technical_gap_signal >= 50 or r.cannibalization_signal >= 60 then 'medium'
    else 'low'
  end as risk_level,
  'human_approved'::text as execution_gate,
  r.gsc_clicks,
  r.gsc_impressions,
  r.gsc_ctr,
  r.gsc_avg_position,
  r.organic_leads,
  r.organic_qualified_leads,
  r.organic_enrolled_leads,
  r.organic_revenue_inr,
  r.organic_revenue_usd,
  r.opportunity_signal,
  r.revenue_signal,
  r.demand_signal,
  r.technical_gap_signal,
  r.content_gap_signal,
  r.aeo_gap_signal,
  r.geo_gap_signal,
  r.cannibalization_signal,
  r.semantic_coverage_score,
  r.answer_readiness_score,
  r.generative_readiness_score,
  r.technical_issue_count,
  r.high_technical_issues,
  r.medium_technical_issues,
  r.internal_link_opportunities,
  r.competing_topics,
  r.max_competing_pages,
  r.active_experiments,
  r.open_actions,
  jsonb_build_object(
    'scores', jsonb_build_object(
      'opportunity',r.opportunity_signal,
      'revenue',r.revenue_signal,
      'demand',r.demand_signal,
      'technical_gap',r.technical_gap_signal,
      'content_gap',r.content_gap_signal,
      'aeo_gap',r.aeo_gap_signal,
      'geo_gap',r.geo_gap_signal,
      'cannibalization',r.cannibalization_signal,
      'final_priority',r.decision_priority_score
    ),
    'business', jsonb_build_object(
      'organic_leads',r.organic_leads,
      'qualified_leads',r.organic_qualified_leads,
      'enrolled_leads',r.organic_enrolled_leads,
      'revenue_inr',r.organic_revenue_inr,
      'revenue_usd',r.organic_revenue_usd,
      'business_value_signal',r.business_value_signal
    ),
    'search', jsonb_build_object(
      'clicks',r.gsc_clicks,
      'impressions',r.gsc_impressions,
      'ctr',r.gsc_ctr,
      'avg_position',r.gsc_avg_position
    ),
    'quality', jsonb_build_object(
      'semantic_coverage',r.semantic_coverage_score,
      'answer_readiness',r.answer_readiness_score,
      'generative_readiness',r.generative_readiness_score,
      'technical_issues',r.technical_issue_count,
      'internal_link_opportunities',r.internal_link_opportunities,
      'competing_topics',r.competing_topics
    ),
    'guardrails', jsonb_build_object(
      'active_experiments',r.active_experiments,
      'open_actions',r.open_actions,
      'execution_gate','human_approved'
    )
  ) as evidence,
  now() as evaluated_at
from ranked r
where r.is_indexable=true
  and r.decision_priority_score >= r.minimum_priority_score;

revoke all on public.v_seo_decision_candidates_v1 from anon, authenticated;
grant select on public.v_seo_decision_candidates_v1 to service_role;

create or replace function public.get_seo_next_best_actions_v1(
  p_organization_id uuid,
  p_site_id uuid default null,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'organization_id', p_organization_id,
    'generated_at', now(),
    'recommendations', coalesce(
      jsonb_agg(to_jsonb(x) order by x.decision_priority_score desc, x.gsc_impressions desc),
      '[]'::jsonb
    )
  )
  from (
    select *
    from public.v_seo_decision_candidates_v1 v
    where v.organization_id=p_organization_id
      and (p_site_id is null or v.site_id=p_site_id)
    order by v.decision_priority_score desc, v.gsc_impressions desc, v.page_id
    limit greatest(1,least(coalesce(p_limit,5),25))
  ) x;
$$;

revoke all on function public.get_seo_next_best_actions_v1(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.get_seo_next_best_actions_v1(uuid,uuid,integer) to service_role;

commit;
