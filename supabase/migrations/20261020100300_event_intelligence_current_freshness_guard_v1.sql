begin;

-- The public prediction writer must reject a source prediction whose evidence
-- has already become stale NOW, even when the source's historical generated_at
-- was valid. This matters particularly when bridging older statistical lead
-- predictions into Event Intelligence.

alter function public.record_event_intelligence_prediction_v1(
  uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz
) rename to record_event_intelligence_prediction_freshness_inner_v1;

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
  v_feature_observed_at timestamptz;
  v_max_feature_age interval;
  v_now timestamptz := now();
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;

  -- Never create an active row whose requested validity has already ended.
  if p_expires_at is not null and p_expires_at<=v_now then
    return null;
  end if;

  if p_feature_state_id is not null then
    select observed_at
      into v_feature_observed_at
    from public.event_intelligence_feature_state
    where id=p_feature_state_id
      and organization_id=p_organization_id;

    if not found then raise exception 'feature_state tenant mismatch'; end if;
    if v_feature_observed_at is null then return null; end if;
    if v_feature_observed_at>v_now+interval '5 minutes' then return null; end if;

    v_max_feature_age := public.event_intelligence_prediction_max_feature_age_v1(p_prediction_type);
    if v_max_feature_age is not null
       and v_feature_observed_at+v_max_feature_age<=v_now then
      return null;
    end if;
  end if;

  return public.record_event_intelligence_prediction_freshness_inner_v1(
    p_organization_id,
    p_subject_type,
    p_subject_key,
    p_subject_id,
    p_prediction_type,
    p_model_key,
    p_model_version,
    p_model_mode,
    p_feature_state_id,
    p_score,
    p_probability,
    p_confidence_low,
    p_confidence_high,
    p_confidence_band,
    p_reason_codes,
    p_explanation,
    p_evidence,
    p_generated_at,
    p_expires_at
  );
end;
$function$;

revoke all on function public.record_event_intelligence_prediction_freshness_inner_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) from public,anon,authenticated;

grant execute on function public.record_event_intelligence_prediction_freshness_inner_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) to service_role;

commit;
