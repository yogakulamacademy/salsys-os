begin;

-- Calibration/evaluation is itself model-quality processing. Historical
-- outcome receipts remain append-only for audit, but a subject with a current
-- profiling restriction must disappear from the active evaluation surface.
create or replace view public.v_event_intelligence_probability_evaluation_v1
with (security_invoker = true)
as
select
  p.organization_id,
  p.id as prediction_id,
  p.subject_type,
  p.subject_key,
  p.subject_id,
  p.prediction_type,
  p.model_key,
  p.model_version,
  p.model_mode,
  p.probability,
  p.confidence_low,
  p.confidence_high,
  p.confidence_band,
  p.generated_at,
  o.id as outcome_id,
  o.occurred_at as outcome_at,
  nullif(o.outcome_value->>'label','') as outcome_label,
  nullif(o.outcome_value->>'binary_outcome','')::integer as actual_binary,
  nullif(o.outcome_value->>'resolution_kind','') as resolution_kind,
  nullif(o.outcome_value->>'authority_level','') as authority_level,
  extract(epoch from (o.occurred_at-p.generated_at))/3600.0 as hours_to_resolution,
  (p.probability-nullif(o.outcome_value->>'binary_outcome','')::numeric) as probability_error,
  abs(p.probability-nullif(o.outcome_value->>'binary_outcome','')::numeric) as absolute_error,
  power(p.probability-nullif(o.outcome_value->>'binary_outcome','')::numeric,2) as squared_error,
  -(
    nullif(o.outcome_value->>'binary_outcome','')::numeric
      * ln(greatest(0.000001,least(0.999999,p.probability)))
    + (1-nullif(o.outcome_value->>'binary_outcome','')::numeric)
      * ln(greatest(0.000001,least(0.999999,1-p.probability)))
  ) as log_loss,
  o.metadata as outcome_metadata
from public.event_intelligence_predictions p
join public.event_intelligence_prediction_outcomes o
  on o.organization_id=p.organization_id
 and o.prediction_id=p.id
 and o.outcome_key='lead_conversion_resolution_v1'
join public.v_r10_lead_signal_quality_v1 q
  on q.organization_id=p.organization_id
 and q.lead_id=p.subject_id
 and q.profiling_allowed=true
where p.subject_type='lead'
  and p.probability is not null
  and p.prediction_type='lead_conversion_probability'
  and nullif(o.outcome_value->>'binary_outcome','') in ('0','1');

revoke all on public.v_event_intelligence_probability_evaluation_v1 from public,anon;
grant select on public.v_event_intelligence_probability_evaluation_v1 to authenticated,service_role;

commit;
