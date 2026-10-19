begin;

-- ============================================================
-- EVENT INTELLIGENCE PREDICTION FRESHNESS V1
--
-- A prediction is actionable only while its underlying evidence is fresh.
-- This migration prevents old feature states from being emitted as new/live
-- predictions and expires previously active predictions that violate the same
-- freshness contract.
-- ============================================================

create or replace function public.event_intelligence_prediction_max_feature_age_v1(
  p_prediction_type text
)
returns interval
language sql
immutable
set search_path = public,pg_temp
as $function$
  select case lower(btrim(coalesce(p_prediction_type,'')))
    when 'session_conversion_intent' then interval '24 hours'
    when 'traffic_decline_risk' then interval '72 hours'
    when 'seo_growth_opportunity' then interval '7 days'
    when 'paid_attribution_gap_risk' then interval '72 hours'
    when 'paid_lead_quality' then interval '72 hours'
    when 'lead_conversion_probability' then interval '24 hours'
    else null::interval
  end;
$function$;

create or replace function public.record_event_intelligence_prediction_v1(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_key text,
  p_subject_id uuid,
  p_prediction_type text,
  p_model_key text,
  p_model_version text,
  p_model_mode text,
  p_feature_state_id uuid,
  p_score numeric,
  p_probability numeric,
  p_confidence_low numeric,
  p_confidence_high numeric,
  p_confidence_band text,
  p_reason_codes text[],
  p_explanation jsonb,
  p_evidence jsonb,
  p_generated_at timestamptz default now(),
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  v_id uuid;
  v_feature_observed_at timestamptz;
  v_max_feature_age interval;
  v_generated_at timestamptz := coalesce(p_generated_at,now());
  v_feature_age_seconds numeric;
  v_evidence jsonb := coalesce(p_evidence,'{}'::jsonb);
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;
  if nullif(btrim(coalesce(p_subject_type,'')),'') is null or nullif(btrim(coalesce(p_subject_key,'')),'') is null then raise exception 'prediction subject is required'; end if;
  if nullif(btrim(coalesce(p_prediction_type,'')),'') is null then raise exception 'prediction_type is required'; end if;
  if p_model_mode not in ('deterministic','statistical','ml','ai_synthesis') then raise exception 'invalid model_mode'; end if;

  if p_expires_at is not null and p_expires_at <= v_generated_at then
    return null;
  end if;

  if p_feature_state_id is not null then
    select observed_at
      into v_feature_observed_at
    from public.event_intelligence_feature_state
    where id=p_feature_state_id
      and organization_id=p_organization_id;

    if not found then raise exception 'feature_state tenant mismatch'; end if;

    v_max_feature_age := public.event_intelligence_prediction_max_feature_age_v1(p_prediction_type);

    if v_feature_observed_at is null then
      return null;
    end if;

    -- Future evidence usually means source-clock or source-date corruption.
    if v_feature_observed_at > v_generated_at + interval '5 minutes' then
      return null;
    end if;

    v_feature_age_seconds := greatest(0,extract(epoch from (v_generated_at-v_feature_observed_at)));

    if v_max_feature_age is not null
       and v_generated_at-v_feature_observed_at > v_max_feature_age then
      return null;
    end if;

    v_evidence := v_evidence || jsonb_build_object(
      'feature_freshness',jsonb_strip_nulls(jsonb_build_object(
        'feature_observed_at',v_feature_observed_at,
        'prediction_generated_at',v_generated_at,
        'feature_age_seconds',round(v_feature_age_seconds),
        'max_feature_age_seconds',case when v_max_feature_age is null then null else extract(epoch from v_max_feature_age)::bigint end,
        'fresh',true
      ))
    );
  end if;

  update public.event_intelligence_predictions
  set status='superseded',updated_at=now()
  where organization_id=p_organization_id
    and subject_type=lower(btrim(p_subject_type))
    and subject_key=btrim(p_subject_key)
    and prediction_type=lower(btrim(p_prediction_type))
    and model_key=btrim(p_model_key)
    and status='active';

  insert into public.event_intelligence_predictions(
    organization_id,subject_type,subject_key,subject_id,prediction_type,model_key,model_version,model_mode,feature_state_id,score,probability,
    confidence_low,confidence_high,confidence_band,reason_codes,explanation,evidence,status,generated_at,expires_at
  ) values (
    p_organization_id,lower(btrim(p_subject_type)),btrim(p_subject_key),p_subject_id,lower(btrim(p_prediction_type)),btrim(p_model_key),btrim(p_model_version),p_model_mode,
    p_feature_state_id,p_score,p_probability,p_confidence_low,p_confidence_high,nullif(btrim(coalesce(p_confidence_band,'')),''),coalesce(p_reason_codes,'{}'::text[]),
    coalesce(p_explanation,'{}'::jsonb),v_evidence,'active',v_generated_at,p_expires_at
  ) returning id into v_id;

  return v_id;
end;
$function$;

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
  v_prediction_id uuid;
  v_score numeric;
  v_confidence text;
  v_reasons text[];
  v_count_session integer := 0;
  v_count_traffic integer := 0;
  v_count_seo integer := 0;
  v_count_paid integer := 0;
  v_count_lead integer := 0;
  v_skip_session integer := 0;
  v_skip_traffic integer := 0;
  v_skip_seo integer := 0;
  v_skip_paid integer := 0;
  v_skip_lead integer := 0;
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

    select public.record_event_intelligence_prediction_v1(
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
    ) into v_prediction_id;

    if v_prediction_id is null then v_skip_session:=v_skip_session+1; else v_count_session:=v_count_session+1; end if;
  end loop;

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

      select public.record_event_intelligence_prediction_v1(
        p_organization_id,'page',r.subject_key,r.subject_id,'traffic_decline_risk','page-traffic-rules','v1','deterministic',r.id,
        v_score,null,null,null,v_confidence,v_reasons,
        jsonb_build_object('calibrated_probability',false,'risk_score',v_score,'page_views_change_7d',v_change_web,'organic_clicks_change_7d',v_change_search),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '24 hours'
      ) into v_prediction_id;
      if v_prediction_id is null then v_skip_traffic:=v_skip_traffic+1; else v_count_traffic:=v_count_traffic+1; end if;
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

      select public.record_event_intelligence_prediction_v1(
        p_organization_id,'page',r.subject_key,r.subject_id,'seo_growth_opportunity','seo-opportunity-rules','v1','deterministic',r.id,
        v_score,null,null,null,v_confidence,v_reasons,
        jsonb_build_object(
          'calibrated_probability',false,'opportunity_score',v_score,'organic_impressions_30d',v_impressions,'weighted_position_30d',v_position,
          'business_evidence',jsonb_build_object('linked_leads_30d',coalesce((r.feature_payload->>'linked_leads_30d')::int,0),'assisted_enrolled_leads_30d',coalesce((r.feature_payload->>'assisted_enrolled_leads_30d')::int,0))
        ),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '7 days'
      ) into v_prediction_id;
      if v_prediction_id is null then v_skip_seo:=v_skip_seo+1; else v_count_seo:=v_count_seo+1; end if;
    end if;
  end loop;

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
      select public.record_event_intelligence_prediction_v1(
        p_organization_id,'campaign',r.subject_key,r.subject_id,'paid_attribution_gap_risk','paid-attribution-rules','v1','deterministic',r.id,
        v_score,null,null,null,'low',array['paid_clicks_without_attributed_crm_leads','tracking_or_attribution_gap_possible'],
        jsonb_build_object(
          'calibrated_probability',false,'risk_score',v_score,'spend_30d',v_spend,'clicks_30d',v_clicks,'crm_leads_30d',v_leads,
          'note','This is an attribution-health warning, not evidence that campaign performance is poor.'
        ),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '24 hours'
      ) into v_prediction_id;
      if v_prediction_id is null then v_skip_paid:=v_skip_paid+1; else v_count_paid:=v_count_paid+1; end if;
    elsif v_leads>0 then
      v_score := case when v_leads>0 then v_qualified::numeric/v_leads else 0 end;
      v_confidence := case when v_leads>=30 then 'high' when v_leads>=10 then 'medium' else 'low' end;
      v_reasons:=array['crm_attribution_present']::text[];
      if v_qualified>0 then v_reasons:=array_append(v_reasons,'qualified_lead_evidence'); end if;
      if v_enrolled>0 then v_reasons:=array_append(v_reasons,'enrollment_evidence'); end if;
      select public.record_event_intelligence_prediction_v1(
        p_organization_id,'campaign',r.subject_key,r.subject_id,'paid_lead_quality','paid-quality-rules','v1','deterministic',r.id,
        v_score,null,null,null,v_confidence,v_reasons,
        jsonb_build_object('calibrated_probability',false,'quality_score',v_score,'crm_leads_30d',v_leads,'qualified_leads_30d',v_qualified,'enrolled_leads_30d',v_enrolled),
        jsonb_build_object('feature_revision',r.revision,'observed_at',r.observed_at),now(),now()+interval '24 hours'
      ) into v_prediction_id;
      if v_prediction_id is null then v_skip_paid:=v_skip_paid+1; else v_count_paid:=v_count_paid+1; end if;
    end if;
  end loop;

  for r in
    select distinct on (p.lead_id)
      p.*,
      case when m.id is null then null else concat_ws(':',m.model_key,m.version) end as model_version_key
    from public.lead_scoring_predictions p
    left join public.lead_scoring_model_versions m on m.id=p.model_version_id and m.organization_id=p.organization_id
    where p.organization_id=p_organization_id
      and (p.expires_at is null or p.expires_at>now())
      and (m.id is null or m.status='active')
    order by p.lead_id,p.generated_at desc,p.created_at desc
    limit greatest(1,least(coalesce(p_limit_per_family,500),5000))
  loop
    select public.record_event_intelligence_prediction_v1(
      p_organization_id,'lead',r.lead_id::text,r.lead_id,
      'lead_conversion_probability','lead-scoring-model',coalesce(r.model_version_key,'existing-model'),'statistical',
      (select f.id from public.event_intelligence_feature_state f where f.organization_id=p_organization_id and f.subject_type='lead' and f.subject_id=r.lead_id and f.feature_family='lead_conversion' order by f.observed_at desc limit 1),
      r.probability,r.probability,r.confidence_low,r.confidence_high,r.confidence_band,
      array['existing_lead_scoring_model']::text[],coalesce(r.explanation,'{}'::jsonb),
      jsonb_build_object('source_prediction_id',r.id,'generated_at',r.generated_at),r.generated_at,r.expires_at
    ) into v_prediction_id;
    if v_prediction_id is null then v_skip_lead:=v_skip_lead+1; else v_count_lead:=v_count_lead+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'organization_id',p_organization_id,
    'session_intent_predictions',v_count_session,
    'traffic_risk_predictions',v_count_traffic,
    'seo_opportunity_predictions',v_count_seo,
    'paid_media_predictions',v_count_paid,
    'lead_predictions_bridged',v_count_lead,
    'freshness_skips',jsonb_build_object(
      'session_intent',v_skip_session,
      'traffic_risk',v_skip_traffic,
      'seo_opportunity',v_skip_seo,
      'paid_media',v_skip_paid,
      'lead',v_skip_lead
    ),
    'feature_freshness_guard',true,
    'generated_at',now()
  );
end;
$function$;

-- Expire active predictions that were previously emitted from stale evidence.
update public.event_intelligence_predictions p
set status='expired',updated_at=now()
from public.event_intelligence_feature_state f
where p.status='active'
  and p.feature_state_id=f.id
  and f.organization_id=p.organization_id
  and (
    (p.expires_at is not null and p.expires_at<=now())
    or f.observed_at is null
    or f.observed_at>p.generated_at+interval '5 minutes'
    or (
      public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) is not null
      and p.generated_at-f.observed_at>public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type)
    )
  );

create or replace view public.v_event_intelligence_prediction_freshness_health_v1
with (security_invoker = true)
as
with base as (
  select
    p.organization_id,
    p.prediction_type,
    p.status,
    p.generated_at,
    p.expires_at,
    f.observed_at as feature_observed_at,
    public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) as max_feature_age,
    case
      when f.id is null then null
      else greatest(0,extract(epoch from (p.generated_at-f.observed_at)))
    end as feature_age_seconds,
    case
      when p.status<>'active' then false
      when p.expires_at is not null and p.expires_at<=now() then true
      when f.id is null then false
      when f.observed_at is null then true
      when f.observed_at>p.generated_at+interval '5 minutes' then true
      when public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) is not null
       and p.generated_at-f.observed_at>public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) then true
      else false
    end as stale_active
  from public.event_intelligence_predictions p
  left join public.event_intelligence_feature_state f
    on f.id=p.feature_state_id
   and f.organization_id=p.organization_id
)
select
  organization_id,
  prediction_type,
  count(*)::bigint as total_predictions,
  count(*) filter (where status='active')::bigint as active_predictions,
  count(*) filter (where status='active' and not stale_active)::bigint as fresh_active_predictions,
  count(*) filter (where stale_active)::bigint as stale_active_predictions,
  count(*) filter (where status='expired')::bigint as expired_predictions,
  count(*) filter (where status='observed')::bigint as observed_predictions,
  round(avg(feature_age_seconds) filter (where status='active' and feature_age_seconds is not null)::numeric,2) as avg_active_feature_age_seconds,
  round(max(feature_age_seconds) filter (where status='active' and feature_age_seconds is not null)::numeric,2) as max_active_feature_age_seconds,
  extract(epoch from max(max_feature_age))::bigint as configured_max_feature_age_seconds,
  case
    when count(*) filter (where stale_active)>0 then 'stale_active_predictions_present'
    when count(*) filter (where status='active')=0 then 'no_active_predictions'
    else 'healthy'
  end as freshness_status,
  now() as checked_at
from base
group by organization_id,prediction_type;

revoke all on function public.event_intelligence_prediction_max_feature_age_v1(text) from public,anon,authenticated;
revoke all on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.refresh_event_intelligence_predictions_v1(uuid,integer) from public,anon,authenticated;

grant execute on function public.event_intelligence_prediction_max_feature_age_v1(text) to service_role;
grant execute on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.refresh_event_intelligence_predictions_v1(uuid,integer) to service_role;
grant select on public.v_event_intelligence_prediction_freshness_health_v1 to authenticated,service_role;

commit;
