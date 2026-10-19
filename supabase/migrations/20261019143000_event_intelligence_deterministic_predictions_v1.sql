begin;

create or replace function public.refresh_event_intelligence_predictions_v1(
  p_organization_id uuid,
  p_limit_per_family integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  r record;
  v_score numeric;
  v_confidence text;
  v_reasons text[];
  v_count_session integer := 0;
  v_count_traffic integer := 0;
  v_count_seo integer := 0;
  v_count_paid integer := 0;
  v_count_lead integer := 0;
  v_change_web numeric;
  v_change_search numeric;
  v_impressions numeric;
  v_position numeric;
  v_visitors numeric;
  v_spend numeric;
  v_clicks numeric;
  v_leads integer;
  v_qualified integer;
  v_enrolled integer;
begin
  if not exists (select 1 from public.organizations where id=p_organization_id) then
    raise exception 'organization not found';
  end if;

  -- ---------------------------------------------------------------------------
  -- Session intent: deterministic behavior score, explicitly not a calibrated
  -- probability. Converted sessions are excluded from active propensity scoring.
  -- ---------------------------------------------------------------------------
  for r in
    select *
    from public.event_intelligence_feature_state
    where organization_id=p_organization_id
      and subject_type='session'
      and feature_family='journey_behavior'
      and coalesce((feature_payload->>'converted')::boolean,false)=false
    order by observed_at desc
    limit greatest(1,least(coalesce(p_limit_per_family,500),5000))
  loop
    v_score := least(1::numeric,
      0.05
      + least(coalesce((r.feature_payload->>'page_views')::numeric,0),5) * 0.06
      + least(coalesce((r.feature_payload->>'high_intent_events')::numeric,0),3) * 0.16
      + least(coalesce((r.feature_payload->>'contact_clicks')::numeric,0),2) * 0.12
      + case when coalesce((r.feature_payload->>'returning_visitor')::boolean,false) then 0.12 else 0 end
      + case when coalesce((r.feature_payload->>'lead_linked')::boolean,false) then 0.12 else 0 end
    );

    v_reasons := array[]::text[];
    if coalesce((r.feature_payload->>'returning_visitor')::boolean,false) then v_reasons:=array_append(v_reasons,'returning_visitor'); end if;
    if coalesce((r.feature_payload->>'form_submits')::int,0)>0 then v_reasons:=array_append(v_reasons,'form_submitted'); end if;
    if coalesce((r.feature_payload->>'contact_clicks')::int,0)>0 then v_reasons:=array_append(v_reasons,'contact_intent'); end if;
    if coalesce((r.feature_payload->>'page_views')::int,0)>=3 then v_reasons:=array_append(v_reasons,'multi_page_engagement'); end if;
    if coalesce((r.feature_payload->>'lead_linked')::boolean,false) then v_reasons:=array_append(v_reasons,'known_lead'); end if;

    v_confidence := case
      when coalesce((r.feature_payload->>'touchpoints')::int,0)>=8 then 'medium'
      when coalesce((r.feature_payload->>'touchpoints')::int,0)>=3 then 'low'
      else 'very_low'
    end;

    perform public.record_event_intelligence_prediction_v1(
      p_organization_id,r.subject_type,r.subject_key,r.subject_id,
      'session_conversion_intent','session-intent-rules','v1','deterministic',r.id,
      v_score,null,null,null,v_confidence,v_reasons,
      jsonb_build_object(
        'kind','behavior_score',
        'calibrated_probability',false,
        'score',v_score,
        'note','Deterministic intent ranking only; it becomes a probability only after outcome calibration.'
      ),
      jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),
      now(),now()+interval '24 hours'
    );
    v_count_session:=v_count_session+1;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Page traffic + SEO opportunity signals.
  -- ---------------------------------------------------------------------------
  for r in
    select *
    from public.event_intelligence_feature_state
    where organization_id=p_organization_id
      and subject_type='page'
      and feature_family='traffic_seo_conversion'
    order by observed_at desc
    limit greatest(1,least(coalesce(p_limit_per_family,500),5000))
  loop
    v_change_web := nullif(r.feature_payload->>'page_views_change_7d','')::numeric;
    v_change_search := nullif(r.feature_payload->>'organic_clicks_change_7d','')::numeric;
    v_impressions := coalesce(nullif(r.feature_payload->>'organic_impressions_30d','')::numeric,0);
    v_position := nullif(r.feature_payload->>'weighted_position_30d','')::numeric;
    v_visitors := coalesce(nullif(r.feature_payload->>'visitors_30d','')::numeric,0);

    if (v_change_web is not null and v_change_web<0) or (v_change_search is not null and v_change_search<0) then
      v_score := least(1::numeric,greatest(
        coalesce(case when v_change_web<0 then -v_change_web else 0 end,0),
        coalesce(case when v_change_search<0 then -v_change_search else 0 end,0)
      ));
      v_reasons := array[]::text[];
      if v_change_web is not null and v_change_web<0 then v_reasons:=array_append(v_reasons,'website_traffic_down_vs_previous_7d'); end if;
      if v_change_search is not null and v_change_search<0 then v_reasons:=array_append(v_reasons,'organic_clicks_down_vs_previous_7d'); end if;
      v_confidence := case when v_visitors>=100 or v_impressions>=1000 then 'high' when v_visitors>=30 or v_impressions>=250 then 'medium' else 'low' end;

      perform public.record_event_intelligence_prediction_v1(
        p_organization_id,'page',r.subject_key,r.subject_id,'traffic_decline_risk','page-traffic-rules','v1','deterministic',r.id,
        v_score,null,null,null,v_confidence,v_reasons,
        jsonb_build_object('calibrated_probability',false,'risk_score',v_score,'page_views_change_7d',v_change_web,'organic_clicks_change_7d',v_change_search),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '24 hours'
      );
      v_count_traffic:=v_count_traffic+1;
    end if;

    if v_impressions>0 and v_position is not null then
      v_score := least(1::numeric,
        least(v_impressions/2000.0,1.0)*0.45
        + case when v_position between 4 and 20 then 0.35 when v_position between 20 and 40 then 0.18 else 0 end
        + least(coalesce((r.feature_payload->>'linked_leads_30d')::numeric,0)/5.0,1.0)*0.10
        + least(coalesce((r.feature_payload->>'assisted_enrolled_leads_30d')::numeric,0)/2.0,1.0)*0.10
      );
      v_reasons:=array['organic_demand_present']::text[];
      if v_position between 4 and 20 then v_reasons:=array_append(v_reasons,'ranking_within_near_term_growth_range'); end if;
      if coalesce((r.feature_payload->>'linked_leads_30d')::int,0)>0 then v_reasons:=array_append(v_reasons,'page_has_crm_lead_evidence'); end if;
      if coalesce((r.feature_payload->>'assisted_enrolled_leads_30d')::int,0)>0 then v_reasons:=array_append(v_reasons,'page_has_enrollment_evidence'); end if;
      v_confidence := case when v_impressions>=1000 then 'high' when v_impressions>=250 then 'medium' else 'low' end;

      perform public.record_event_intelligence_prediction_v1(
        p_organization_id,'page',r.subject_key,r.subject_id,'seo_growth_opportunity','seo-opportunity-rules','v1','deterministic',r.id,
        v_score,null,null,null,v_confidence,v_reasons,
        jsonb_build_object(
          'calibrated_probability',false,'opportunity_score',v_score,'organic_impressions_30d',v_impressions,'weighted_position_30d',v_position,
          'business_evidence',jsonb_build_object('linked_leads_30d',coalesce((r.feature_payload->>'linked_leads_30d')::int,0),'assisted_enrolled_leads_30d',coalesce((r.feature_payload->>'assisted_enrolled_leads_30d')::int,0))
        ),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '7 days'
      );
      v_count_seo:=v_count_seo+1;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Paid media: distinguish attribution health from campaign performance.
  -- Zero attributed leads is never treated as proof that the campaign is bad.
  -- ---------------------------------------------------------------------------
  for r in
    select *
    from public.event_intelligence_feature_state
    where organization_id=p_organization_id
      and subject_type='campaign'
      and feature_family='paid_media_conversion'
    order by observed_at desc
    limit greatest(1,least(coalesce(p_limit_per_family,500),5000))
  loop
    v_spend := coalesce(nullif(r.feature_payload#>>'{media,spend_30d}','')::numeric,0);
    v_clicks := coalesce(nullif(r.feature_payload#>>'{media,clicks_30d}','')::numeric,0);
    v_leads := coalesce(nullif(r.feature_payload#>>'{crm,crm_leads_30d}','')::int,0);
    v_qualified := coalesce(nullif(r.feature_payload#>>'{crm,qualified_leads_30d}','')::int,0);
    v_enrolled := coalesce(nullif(r.feature_payload#>>'{crm,enrolled_leads_30d}','')::int,0);

    if v_spend>0 and v_clicks>0 and v_leads=0 then
      v_score := least(1::numeric,0.40 + least(v_clicks/200.0,1.0)*0.35 + least(v_spend/10000.0,1.0)*0.25);
      perform public.record_event_intelligence_prediction_v1(
        p_organization_id,'campaign',r.subject_key,r.subject_id,'paid_attribution_gap_risk','paid-attribution-rules','v1','deterministic',r.id,
        v_score,null,null,null,'low',array['paid_clicks_without_attributed_crm_leads','tracking_or_attribution_gap_possible'],
        jsonb_build_object(
          'calibrated_probability',false,'risk_score',v_score,'spend_30d',v_spend,'clicks_30d',v_clicks,'crm_leads_30d',v_leads,
          'note','This is an attribution-health warning, not evidence that campaign performance is poor.'
        ),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '24 hours'
      );
      v_count_paid:=v_count_paid+1;
    elsif v_leads>0 then
      v_score := case when v_leads>0 then v_qualified::numeric/v_leads else 0 end;
      v_confidence := case when v_leads>=30 then 'high' when v_leads>=10 then 'medium' else 'low' end;
      v_reasons:=array['crm_attribution_present']::text[];
      if v_qualified>0 then v_reasons:=array_append(v_reasons,'qualified_lead_evidence'); end if;
      if v_enrolled>0 then v_reasons:=array_append(v_reasons,'enrollment_evidence'); end if;
      perform public.record_event_intelligence_prediction_v1(
        p_organization_id,'campaign',r.subject_key,r.subject_id,'paid_lead_quality','paid-quality-rules','v1','deterministic',r.id,
        v_score,null,null,null,v_confidence,v_reasons,
        jsonb_build_object('calibrated_probability',false,'quality_score',v_score,'crm_leads_30d',v_leads,'qualified_leads_30d',v_qualified,'enrolled_leads_30d',v_enrolled),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '24 hours'
      );
      v_count_paid:=v_count_paid+1;
    end if;
  end loop;

  -- Bridge the existing lead model into the universal prediction ledger without
  -- pretending that a newer model exists. We reuse its persisted probability,
  -- confidence and explanation exactly as current evidence.
  for r in
    select distinct on (p.lead_id)
      p.*,m.version_key as model_version_key
    from public.lead_scoring_predictions p
    left join public.lead_scoring_model_versions m on m.id=p.model_version_id and m.organization_id=p.organization_id
    where p.organization_id=p_organization_id
    order by p.lead_id,p.generated_at desc,p.created_at desc
    limit greatest(1,least(coalesce(p_limit_per_family,500),5000))
  loop
    perform public.record_event_intelligence_prediction_v1(
      p_organization_id,'lead',r.lead_id::text,r.lead_id,
      'lead_conversion_probability','lead-scoring-model',coalesce(r.model_version_key,'existing-model'),'statistical',
      (select f.id from public.event_intelligence_feature_state f where f.organization_id=p_organization_id and f.subject_type='lead' and f.subject_id=r.lead_id and f.feature_family='lead_conversion' limit 1),
      r.probability,r.probability,r.confidence_low,r.confidence_high,r.confidence_band,
      array['existing_lead_scoring_model']::text[],coalesce(r.explanation,'{}'::jsonb),
      jsonb_build_object('source_prediction_id',r.id,'generated_at',r.generated_at),r.generated_at,r.expires_at
    );
    v_count_lead:=v_count_lead+1;
  end loop;

  return jsonb_build_object(
    'ok',true,'organization_id',p_organization_id,
    'session_intent_predictions',v_count_session,
    'traffic_risk_predictions',v_count_traffic,
    'seo_opportunity_predictions',v_count_seo,
    'paid_media_predictions',v_count_paid,
    'lead_predictions_bridged',v_count_lead,
    'generated_at',now()
  );
end;
$function$;

revoke all on function public.refresh_event_intelligence_predictions_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.refresh_event_intelligence_predictions_v1(uuid,integer) to service_role;

commit;
