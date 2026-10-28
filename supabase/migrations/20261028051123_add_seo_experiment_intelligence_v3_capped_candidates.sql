create or replace view public.v_seo_experiment_candidates_v2 as
with content_ranked as (
  select c.*, row_number() over (partition by c.organization_id order by c.action_priority_score desc,c.gsc_impressions desc,c.normalized_url asc) rn
  from public.v_seo_content_page_intelligence_v1 c
  where c.recommended_action <> 'monitor'
), revenue_ranked as (
  select r.*, row_number() over (partition by r.organization_id order by r.revenue_priority_score_v1 desc,r.gsc_clicks desc) rn
  from public.v_seo_organic_value_page_30d r
  where r.recommended_action <> 'monitor'
), aeo_ranked as (
  select a.*,
    least(100,a.answer_readiness_score_v1 + least(20,a.high_opportunity_query_count*5) + case when a.answer_impressions>=500 then 12 when a.answer_impressions>=100 then 8 when a.answer_impressions>=20 then 4 else 0 end) as action_priority,
    row_number() over (partition by a.organization_id order by least(100,a.answer_readiness_score_v1 + least(20,a.high_opportunity_query_count*5) + case when a.answer_impressions>=500 then 12 when a.answer_impressions>=100 then 8 when a.answer_impressions>=20 then 4 else 0 end) desc,a.answer_impressions desc,a.normalized_url asc) rn
  from public.v_seo_aeo_page_readiness_v1 a
  where a.recommended_action <> 'crawl_page'
), geo_ranked as (
  select g.*,
    least(100,g.generative_readiness_score_v1 + case when g.ai_referral_sessions>=20 then 20 when g.ai_referral_sessions>=5 then 12 when g.ai_referral_sessions>0 then 6 else 0 end + least(15,g.high_opportunity_answer_queries*3)) as geo_priority,
    row_number() over (partition by g.organization_id order by least(100,g.generative_readiness_score_v1 + case when g.ai_referral_sessions>=20 then 20 when g.ai_referral_sessions>=5 then 12 when g.ai_referral_sessions>0 then 6 else 0 end + least(15,g.high_opportunity_answer_queries*3)) desc,g.ai_referral_sessions desc,g.normalized_url asc) rn
  from public.v_seo_geo_page_intelligence_v1 g
  where g.recommended_action <> 'crawl_page'
)
select organization_id,'og4_content'::text source_layer,'page'::text target_kind,page_id,normalized_url,title,recommended_action,action_reason recommendation,action_priority_score priority_score,
 jsonb_build_object('semantic_coverage_score',semantic_coverage_score_v1,'technical_issue_count',technical_issue_count,'internal_link_opportunities',internal_link_opportunities,'word_count',word_count) evidence
from content_ranked where rn<=60 and recommended_action<>'crawl_page'
union all
select organization_id,'og5_revenue','page',page_id,normalized_url,title,recommended_action,recommendation,revenue_priority_score_v1,
 jsonb_build_object('gsc_clicks',gsc_clicks,'gsc_impressions',gsc_impressions,'organic_leads',organic_leads,'organic_qualified_leads',organic_qualified_leads,'organic_enrolled_leads',organic_enrolled_leads,'organic_revenue_inr',organic_revenue_inr,'organic_revenue_usd',organic_revenue_usd,'business_value_signal',business_value_signal)
from revenue_ranked where rn<=30
union all
select organization_id,'og6_aeo','page',page_id,normalized_url,title,recommended_action,recommendation,action_priority,
 jsonb_build_object('answer_readiness_score',answer_readiness_score_v1,'answer_query_count',answer_query_count,'high_opportunity_query_count',high_opportunity_query_count,'answer_impressions',answer_impressions,'answer_sections',answer_heading_count)
from aeo_ranked where rn<=40 and recommended_action<>'monitor'
union all
select organization_id,'og7_geo','page',page_id,normalized_url,title,recommended_action,recommendation,geo_priority,
 jsonb_build_object('generative_readiness_score',generative_readiness_score_v1,'ai_referral_sessions',ai_referral_sessions,'ai_linked_leads',ai_linked_leads,'semantic_coverage_score',semantic_coverage_score_v1,'answer_readiness_score',answer_readiness_score_v1,'observed_ai_providers',observed_ai_providers)
from geo_ranked where rn<=40 and recommended_action<>'monitor';

create or replace function public.get_seo_experiment_intelligence_v3(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare v_payload jsonb;
begin
  if p_organization_id is null or not public.is_organization_member(p_organization_id) then raise exception 'Not authorized for organization'; end if;
  with experiments as materialized (
    select * from public.v_seo_experiment_outcomes_v1 where organization_id=p_organization_id
  ), candidates as materialized (
    select c.* from public.v_seo_experiment_candidates_v2 c
    where c.organization_id=p_organization_id
      and not exists (
        select 1 from public.seo_experiments e
        where e.organization_id=c.organization_id and e.target_page_id=c.page_id and e.source_layer=c.source_layer
          and coalesce(e.source_action,'')=coalesce(c.recommended_action,'') and e.status in ('draft','approved','running')
      )
  ), changes as materialized (
    select c.* from public.seo_experiment_changes c where c.organization_id=p_organization_id
  ), summary as (
    select jsonb_build_object(
      'total_experiments',count(*)::bigint,'draft_experiments',count(*) filter (where status='draft')::bigint,
      'approved_experiments',count(*) filter (where status='approved')::bigint,'running_experiments',count(*) filter (where status='running')::bigint,
      'completed_experiments',count(*) filter (where status='completed')::bigint,'cancelled_experiments',count(*) filter (where status='cancelled')::bigint,
      'experiments_with_baseline',count(*) filter (where has_baseline)::bigint,'experiments_with_outcome',count(*) filter (where has_outcome)::bigint,
      'positive_learnings',count(*) filter (where result_classification='positive')::bigint,'negative_learnings',count(*) filter (where result_classification='negative')::bigint,
      'mixed_learnings',count(*) filter (where result_classification='mixed')::bigint,'inconclusive_learnings',count(*) filter (where result_classification='inconclusive')::bigint,
      'applied_changes',(select count(*)::bigint from changes where status='applied'),'candidate_actions',(select count(*)::bigint from candidates)
    ) as payload from experiments
  ), experiment_payload as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) as payload
    from (
      select o.*,e.created_at,e.updated_at,(select count(*)::bigint from changes c where c.experiment_id=o.experiment_id) as change_count
      from experiments o join public.seo_experiments e on e.organization_id=o.organization_id and e.id=o.experiment_id
      order by e.created_at desc limit 50
    ) x
  ), candidate_payload as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score desc,x.source_layer,x.normalized_url),'[]'::jsonb) as payload
    from (select * from candidates order by priority_score desc,source_layer,normalized_url limit 40) x
  )
  select jsonb_build_object(
    'summary',s.payload,'experiments',e.payload,'candidates',c.payload,
    'guardrails',jsonb_build_object('human_approval_required',true,'automatic_publishing',false,'raw_evidence_overwritten',false,'causality_claimed',false,
      'note','Experiment outcomes compare observed windows. Deltas are evidence, not proof of causality; seasonality, ranking volatility and external changes can affect results.')
  ) into v_payload from summary s cross join experiment_payload e cross join candidate_payload c;
  return coalesce(v_payload,jsonb_build_object('summary','{}'::jsonb,'experiments','[]'::jsonb,'candidates','[]'::jsonb));
end;
$function$;
revoke all on function public.get_seo_experiment_intelligence_v3(uuid) from public, anon, authenticated, service_role;

create or replace function public.get_seo_experiment_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
begin
  if p_organization_id is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;
  begin
    return public.get_seo_experiment_intelligence_v3(p_organization_id);
  exception when others then
    begin
      return public.get_seo_experiment_intelligence_v2(p_organization_id);
    exception when others then
      return public.get_seo_experiment_intelligence_legacy_v1(p_organization_id);
    end;
  end;
end;
$function$;
