create or replace view public.v_r10_lead_training_dataset_v1
with (security_invoker = true)
as
select
  s.organization_id,
  s.lead_id,
  s.id as feature_snapshot_id,
  s.snapshot_version,
  s.observed_at,
  s.observed_stage,
  s.observed_status,
  s.outcome_label,
  s.outcome_at,
  s.outcome_source,
  extract(epoch from (s.outcome_at - s.observed_at)) / 3600.0 as hours_before_outcome,
  s.feature_payload,
  nullif(s.feature_payload ->> 'stored_intent', '') as stored_intent,
  nullif(s.feature_payload ->> 'derived_intent', '') as derived_intent,
  nullif(s.feature_payload ->> 'intent_confidence', '') as intent_confidence,
  nullif(s.feature_payload ->> 'behaviour_temperature', '') as behaviour_temperature,
  coalesce((s.feature_payload ->> 'engagement_score')::numeric, 0) as engagement_score,
  coalesce((s.feature_payload ->> 'high_intent_events_7d')::numeric, 0) as high_intent_events_7d,
  coalesce((s.feature_payload ->> 'whatsapp_clicks_7d')::numeric, 0) as whatsapp_clicks_7d,
  coalesce((s.feature_payload ->> 'reservation_starts_7d')::numeric, 0) as reservation_starts_7d,
  coalesce((s.feature_payload ->> 'payment_starts_7d')::numeric, 0) as payment_starts_7d,
  coalesce((s.feature_payload ->> 'enquiry_clicks_7d')::numeric, 0) as enquiry_clicks_7d,
  coalesce((s.feature_payload ->> 'brochure_downloads_7d')::numeric, 0) as brochure_downloads_7d,
  coalesce((s.feature_payload ->> 'sessions_7d')::numeric, 0) as sessions_7d,
  coalesce((s.feature_payload ->> 'page_views_7d')::numeric, 0) as page_views_7d,
  coalesce((s.feature_payload ->> 'days_since_last_visit')::numeric, 0) as days_since_last_visit,
  coalesce((s.feature_payload ->> 'has_returned_after_becoming_lead')::boolean, false) as has_returned_after_becoming_lead,
  coalesce((s.feature_payload ->> 'is_reengaged')::boolean, false) as is_reengaged,
  nullif(s.feature_payload ->> 'payment_status', '') as payment_status,
  coalesce((s.feature_payload ->> 'net_paid')::numeric, 0) as net_paid,
  coalesce((s.feature_payload ->> 'outstanding_balance')::numeric, 0) as outstanding_balance,
  coalesce((s.feature_payload ->> 'owner_assigned')::boolean, false) as owner_assigned,
  nullif(s.feature_payload ->> 'lead_age_hours', '')::numeric as lead_age_hours,
  nullif(s.feature_payload ->> 'hours_since_last_contact', '')::numeric as hours_since_last_contact,
  nullif(s.feature_payload ->> 'hours_since_last_inbound', '')::numeric as hours_since_last_inbound,
  coalesce((s.feature_payload ->> 'followup_due')::boolean, false) as followup_due,
  coalesce((s.feature_payload #>> '{operational_context,priority_score}')::numeric, 0) as operational_priority_score,
  nullif(s.feature_payload #>> '{operational_context,priority_band}', '') as operational_priority_band,
  nullif(s.feature_payload #>> '{operational_context,next_action_code}', '') as next_action_code
from public.lead_scoring_feature_snapshots s
where s.outcome_label in ('positive', 'negative')
  and s.outcome_at is not null
  and s.observed_at < s.outcome_at;

create or replace view public.v_r10_lead_model_training_readiness_v1
with (security_invoker = true)
as
with snapshot_stats as (
  select
    s.organization_id,
    count(*)::bigint as total_snapshots,
    count(*) filter (where s.outcome_label is not null)::bigint as labeled_snapshots,
    count(*) filter (where s.outcome_label is null)::bigint as unlabeled_snapshots,
    count(distinct s.lead_id)::bigint as leads_with_snapshots,
    count(distinct s.lead_id) filter (where s.outcome_label is not null)::bigint as labeled_leads,
    count(distinct s.lead_id) filter (where s.outcome_label = 'positive')::bigint as positive_leads,
    count(distinct s.lead_id) filter (where s.outcome_label = 'negative')::bigint as negative_leads,
    count(*) filter (where s.outcome_label = 'positive')::bigint as positive_snapshots,
    count(*) filter (where s.outcome_label = 'negative')::bigint as negative_snapshots,
    count(*) filter (
      where s.outcome_label is not null
        and (s.outcome_at is null or s.observed_at >= s.outcome_at)
    )::bigint as temporal_leakage_violations,
    count(*) filter (
      where s.outcome_label is not null
        and s.outcome_at is not null
        and s.observed_at < s.outcome_at
        and s.snapshot_version = 'r10-lead-features-v1'
        and s.feature_payload ? 'engagement_score'
        and s.feature_payload ? 'sessions_7d'
        and s.feature_payload ? 'page_views_7d'
    )::bigint as usable_labeled_snapshots,
    min(s.observed_at) as first_snapshot_at,
    max(s.observed_at) as last_snapshot_at
  from public.lead_scoring_feature_snapshots s
  group by s.organization_id
), training_stats as (
  select
    d.organization_id,
    count(*)::bigint as training_rows,
    count(distinct d.lead_id)::bigint as training_leads,
    min(d.observed_at) as first_training_observation_at,
    max(d.observed_at) as last_training_observation_at,
    avg(d.hours_before_outcome)::numeric as avg_hours_before_outcome
  from public.v_r10_lead_training_dataset_v1 d
  group by d.organization_id
)
select
  o.id as organization_id,
  coalesce(s.total_snapshots, 0)::bigint as total_snapshots,
  coalesce(s.labeled_snapshots, 0)::bigint as labeled_snapshots,
  coalesce(s.unlabeled_snapshots, 0)::bigint as unlabeled_snapshots,
  coalesce(s.leads_with_snapshots, 0)::bigint as leads_with_snapshots,
  coalesce(s.labeled_leads, 0)::bigint as labeled_leads,
  coalesce(s.positive_leads, 0)::bigint as positive_leads,
  coalesce(s.negative_leads, 0)::bigint as negative_leads,
  coalesce(s.positive_snapshots, 0)::bigint as positive_snapshots,
  coalesce(s.negative_snapshots, 0)::bigint as negative_snapshots,
  coalesce(s.usable_labeled_snapshots, 0)::bigint as usable_labeled_snapshots,
  coalesce(s.temporal_leakage_violations, 0)::bigint as temporal_leakage_violations,
  coalesce(t.training_rows, 0)::bigint as training_rows,
  coalesce(t.training_leads, 0)::bigint as training_leads,
  s.first_snapshot_at,
  s.last_snapshot_at,
  t.first_training_observation_at,
  t.last_training_observation_at,
  round(coalesce(t.avg_hours_before_outcome, 0), 1) as avg_hours_before_outcome,
  case
    when coalesce(s.positive_leads, 0) = 0 or coalesce(s.negative_leads, 0) = 0 then 0::numeric
    else round(
      least(s.positive_leads, s.negative_leads)::numeric
      / greatest(s.positive_leads, s.negative_leads)::numeric,
      3
    )
  end as class_balance_ratio,
  40::integer as min_labeled_leads,
  20::integer as min_positive_leads,
  20::integer as min_negative_leads,
  case
    when coalesce(s.total_snapshots, 0) = 0 then false
    when coalesce(s.temporal_leakage_violations, 0) > 0 then false
    when coalesce(s.labeled_leads, 0) < 40 then false
    when coalesce(s.positive_leads, 0) < 20 then false
    when coalesce(s.negative_leads, 0) < 20 then false
    when coalesce(s.usable_labeled_snapshots, 0) < 40 then false
    else true
  end as candidate_model_training_allowed,
  coalesce(r.prediction_generation_allowed, false) as production_prediction_release_allowed,
  case
    when coalesce(s.total_snapshots, 0) = 0 then 'collecting_snapshots'
    when coalesce(s.temporal_leakage_violations, 0) > 0 then 'data_integrity_blocked'
    when coalesce(s.labeled_leads, 0) < 40 then 'collecting_labels'
    when coalesce(s.positive_leads, 0) < 20 then 'needs_positive_examples'
    when coalesce(s.negative_leads, 0) < 20 then 'needs_negative_examples'
    when coalesce(s.usable_labeled_snapshots, 0) < 40 then 'insufficient_usable_features'
    when coalesce(r.prediction_generation_allowed, false) is not true then 'candidate_training_ready_release_blocked'
    else 'candidate_training_ready'
  end as training_readiness_status,
  case
    when coalesce(s.total_snapshots, 0) = 0 then 'No point-in-time lead feature snapshots exist yet. Keep the scheduled collector running.'
    when coalesce(s.temporal_leakage_violations, 0) > 0 then 'At least one labeled snapshot is not strictly earlier than its outcome. Resolve temporal leakage before model training.'
    when coalesce(s.labeled_leads, 0) < 40 then 'Collect more terminal outcomes so at least 40 distinct leads have pre-outcome feature history.'
    when coalesce(s.positive_leads, 0) < 20 then 'Collect more positive outcomes before training a conversion model.'
    when coalesce(s.negative_leads, 0) < 20 then 'Collect more negative outcomes before training a conversion model.'
    when coalesce(s.usable_labeled_snapshots, 0) < 40 then 'More labeled snapshots with the required feature schema are needed.'
    when coalesce(r.prediction_generation_allowed, false) is not true then 'The dataset can support candidate-model experimentation, but production probabilities remain blocked by the broader predictive-readiness gate.'
    else 'The dataset is eligible for candidate model training and production-release evaluation. Model quality still requires holdout testing, calibration, and drift checks.'
  end as training_readiness_reason,
  now() as evaluated_at
from public.organizations o
left join snapshot_stats s on s.organization_id = o.id
left join training_stats t on t.organization_id = o.id
left join public.v_r10_predictive_readiness_v1 r on r.organization_id = o.id;

comment on view public.v_r10_lead_training_dataset_v1 is
  'R10 leakage-safe labeled lead-scoring dataset. Only point-in-time feature snapshots strictly earlier than observed outcomes are eligible for candidate model training.';
comment on view public.v_r10_lead_model_training_readiness_v1 is
  'R10 tenant-safe model-training readiness. Candidate training and production probability release are separate gates; readiness does not imply model quality.';

revoke all on public.v_r10_lead_training_dataset_v1 from public, anon;
revoke all on public.v_r10_lead_model_training_readiness_v1 from public, anon;
grant select on public.v_r10_lead_training_dataset_v1 to authenticated, service_role;
grant select on public.v_r10_lead_model_training_readiness_v1 to authenticated, service_role;
