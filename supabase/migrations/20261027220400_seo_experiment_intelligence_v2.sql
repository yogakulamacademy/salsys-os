create or replace function public.get_seo_experiment_intelligence_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb;
begin
  if p_organization_id is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;

  with
  content_payload as materialized (select public.get_seo_content_intelligence(p_organization_id) as j),
  revenue_payload as materialized (select public.get_seo_revenue_intelligence(p_organization_id) as j),
  aeo_payload as materialized (select public.get_seo_aeo_intelligence(p_organization_id) as j),
  geo_payload as materialized (select public.get_seo_geo_intelligence(p_organization_id) as j),
  candidate_source as materialized (
    select p_organization_id as organization_id,'og4_content'::text as source_layer,'page'::text as target_kind,(x->>'page_id')::uuid as page_id,x->>'normalized_url' as normalized_url,x->>'title' as title,x->>'recommended_action' as recommended_action,x->>'action_reason' as recommendation,coalesce((x->>'action_priority_score')::integer,0) as priority_score,
      jsonb_build_object('semantic_coverage_score',nullif(x->>'semantic_coverage_score_v1','')::integer,'technical_issue_count',nullif(x->>'technical_issue_count','')::integer,'internal_link_opportunities',nullif(x->>'internal_link_opportunities','')::integer,'word_count',nullif(x->>'word_count','')::integer) as evidence
    from content_payload cp cross join lateral jsonb_array_elements(coalesce(cp.j->'page_actions','[]'::jsonb)) x
    where coalesce(x->>'recommended_action','') <> all(array['monitor','crawl_page'])
    union all
    select p_organization_id,'og5_revenue'::text,'page'::text,(x->>'page_id')::uuid,x->>'normalized_url',x->>'title',x->>'recommended_action',x->>'recommendation',coalesce((x->>'revenue_priority_score_v1')::integer,0),
      jsonb_build_object('gsc_clicks',nullif(x->>'gsc_clicks','')::bigint,'gsc_impressions',nullif(x->>'gsc_impressions','')::bigint,'organic_leads',nullif(x->>'organic_leads','')::bigint,'organic_qualified_leads',nullif(x->>'organic_qualified_leads','')::bigint,'organic_enrolled_leads',nullif(x->>'organic_enrolled_leads','')::bigint,'organic_revenue_inr',nullif(x->>'organic_revenue_inr','')::numeric,'organic_revenue_usd',nullif(x->>'organic_revenue_usd','')::numeric,'business_value_signal',x->>'business_value_signal')
    from revenue_payload rp cross join lateral jsonb_array_elements(coalesce(rp.j->'priority_actions','[]'::jsonb)) x
    where coalesce(x->>'recommended_action','') <> 'monitor'
    union all
    select p_organization_id,'og6_aeo'::text,'page'::text,(x->>'page_id')::uuid,x->>'normalized_url',x->>'title',x->>'recommended_action',x->>'recommendation',
      least(100,coalesce((x->>'answer_readiness_score_v1')::integer,0)+least(20,coalesce((x->>'high_opportunity_query_count')::integer,0)*5)+case when coalesce((x->>'answer_impressions')::bigint,0)>=500 then 12 when coalesce((x->>'answer_impressions')::bigint,0)>=100 then 8 when coalesce((x->>'answer_impressions')::bigint,0)>=20 then 4 else 0 end),
      jsonb_build_object('answer_readiness_score',nullif(x->>'answer_readiness_score_v1','')::integer,'answer_query_count',nullif(x->>'answer_query_count','')::bigint,'high_opportunity_query_count',nullif(x->>'high_opportunity_query_count','')::bigint,'answer_impressions',nullif(x->>'answer_impressions','')::bigint,'answer_sections',nullif(x->>'answer_heading_count','')::integer)
    from aeo_payload ap cross join lateral jsonb_array_elements(coalesce(ap.j->'page_readiness','[]'::jsonb)) x
    where coalesce(x->>'recommended_action','') <> all(array['monitor','crawl_page'])
    union all
    select p_organization_id,'og7_geo'::text,'page'::text,(x->>'page_id')::uuid,x->>'normalized_url',x->>'title',x->>'recommended_action',x->>'recommendation',
      least(100,coalesce((x->>'generative_readiness_score_v1')::integer,0)+case when coalesce((x->>'ai_referral_sessions')::bigint,0)>=20 then 20 when coalesce((x->>'ai_referral_sessions')::bigint,0)>=5 then 12 when coalesce((x->>'ai_referral_sessions')::bigint,0)>0 then 6 else 0 end+least(15,coalesce((x->>'high_opportunity_answer_queries')::integer,0)*3)),
      jsonb_build_object('generative_readiness_score',nullif(x->>'generative_readiness_score_v1','')::integer,'ai_referral_sessions',nullif(x->>'ai_referral_sessions','')::bigint,'ai_linked_leads',nullif(x->>'ai_linked_leads','')::bigint,'semantic_coverage_score',nullif(x->>'semantic_coverage_score_v1','')::integer,'answer_readiness_score',nullif(x->>'answer_readiness_score_v1','')::integer,'observed_ai_providers',coalesce(x->'observed_ai_providers','[]'::jsonb))
    from geo_payload gp cross join lateral jsonb_array_elements(coalesce(gp.j->'pages','[]'::jsonb)) x
    where coalesce(x->>'recommended_action','') <> all(array['monitor','crawl_page'])
  ),
  candidates as materialized (
    select c.* from candidate_source c
    where not exists (
      select 1 from public.seo_experiments e
      where e.organization_id=c.organization_id and e.target_page_id=c.page_id and e.source_layer=c.source_layer
        and coalesce(e.source_action,'')=coalesce(c.recommended_action,'') and e.status in ('draft','approved','running')
    )
  ),
  experiments as materialized (select * from public.v_seo_experiment_outcomes_v1 where organization_id=p_organization_id),
  changes as materialized (select c.* from public.seo_experiment_changes c where c.organization_id=p_organization_id),
  summary as (
    select jsonb_build_object('total_experiments',count(*)::bigint,'draft_experiments',count(*) filter (where status='draft')::bigint,'approved_experiments',count(*) filter (where status='approved')::bigint,'running_experiments',count(*) filter (where status='running')::bigint,'completed_experiments',count(*) filter (where status='completed')::bigint,'cancelled_experiments',count(*) filter (where status='cancelled')::bigint,'experiments_with_baseline',count(*) filter (where has_baseline)::bigint,'experiments_with_outcome',count(*) filter (where has_outcome)::bigint,'positive_learnings',count(*) filter (where result_classification='positive')::bigint,'negative_learnings',count(*) filter (where result_classification='negative')::bigint,'mixed_learnings',count(*) filter (where result_classification='mixed')::bigint,'inconclusive_learnings',count(*) filter (where result_classification='inconclusive')::bigint,'applied_changes',(select count(*)::bigint from changes where status='applied'),'candidate_actions',(select count(*)::bigint from candidates)) as payload from experiments
  ),
  experiment_payload as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) as payload
    from (select o.*,e.created_at,e.updated_at,(select count(*)::bigint from changes c where c.experiment_id=o.experiment_id) as change_count from experiments o join public.seo_experiments e on e.organization_id=o.organization_id and e.id=o.experiment_id order by e.created_at desc limit 50) x
  ),
  candidate_payload as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.priority_score desc,x.source_layer,x.normalized_url),'[]'::jsonb) as payload
    from (select * from candidates order by priority_score desc,source_layer,normalized_url limit 40) x
  )
  select jsonb_build_object('summary',s.payload,'experiments',e.payload,'candidates',c.payload,'guardrails',jsonb_build_object('human_approval_required',true,'automatic_publishing',false,'raw_evidence_overwritten',false,'causality_claimed',false,'note','Experiment outcomes compare observed windows. Deltas are evidence, not proof of causality; seasonality, ranking volatility and external changes can affect results.')) into v_payload
  from summary s cross join experiment_payload e cross join candidate_payload c;

  return coalesce(v_payload,jsonb_build_object('summary','{}'::jsonb,'experiments','[]'::jsonb,'candidates','[]'::jsonb));
end;
$function$;

alter function public.get_seo_experiment_intelligence(uuid) rename to get_seo_experiment_intelligence_legacy_v1;

create function public.get_seo_experiment_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
begin
  if p_organization_id is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;
  begin
    return public.get_seo_experiment_intelligence_v2(p_organization_id);
  exception when others then
    return public.get_seo_experiment_intelligence_legacy_v1(p_organization_id);
  end;
end;
$function$;

revoke all on function public.get_seo_experiment_intelligence_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_seo_experiment_intelligence_legacy_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_seo_experiment_intelligence(uuid) from public, anon;
grant execute on function public.get_seo_experiment_intelligence(uuid) to authenticated, service_role;
grant execute on function public.get_seo_experiment_intelligence_v2(uuid) to service_role;
grant execute on function public.get_seo_experiment_intelligence_legacy_v1(uuid) to service_role;