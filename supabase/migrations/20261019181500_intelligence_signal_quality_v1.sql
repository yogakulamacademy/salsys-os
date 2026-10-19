begin;

-- ============================================================
-- INTELLIGENCE SIGNAL QUALITY V1
--
-- Goals:
-- 1. Treat missing/withheld web evidence as UNKNOWN, not negative intent.
-- 2. Keep privacy/profiling restrictions upstream of model training.
-- 3. Expose evidence availability separately from behavioral scores.
-- 4. Provide a safe V2 training dataset without silently coercing NULL to zero.
-- 5. Measure readiness without claiming model accuracy before realized outcomes exist.
-- ============================================================

create or replace view public.v_r10_lead_signal_quality_v1
with (security_invoker = true)
as
with
lead_people as (
  select distinct organization_id, lead_id, person_id
  from public.person_leads
),
lead_visitors as (
  select
    organization_id,
    lead_id,
    anonymous_visitor_id,
    count(*)::bigint as session_count,
    count(*) filter (where started_at >= now() - interval '30 days')::bigint as sessions_30d,
    max(coalesce(last_seen_at, started_at)) as latest_session_at
  from public.web_sessions
  where lead_id is not null
    and anonymous_visitor_id is not null
  group by organization_id, lead_id, anonymous_visitor_id
),
associated_subjects as (
  select l.organization_id, l.id as lead_id, 'lead:' || l.id::text as subject_key, 'lead'::text as subject_scope
  from public.leads l

  union all

  select lp.organization_id, lp.lead_id, 'person:' || lp.person_id::text, 'person'::text
  from lead_people lp

  union all

  select lv.organization_id, lv.lead_id, 'visitor:' || lv.anonymous_visitor_id, 'visitor'::text
  from lead_visitors lv
),
analytics_preferences as (
  select
    s.organization_id,
    s.lead_id,
    s.subject_scope,
    p.current_decision,
    p.effective_at
  from associated_subjects s
  join public.privacy_preferences p
    on p.organization_id = s.organization_id
   and p.subject_key = s.subject_key
   and p.purpose_key = 'analytics'
),
analytics_rollup as (
  select
    organization_id,
    lead_id,
    count(*)::bigint as preference_count,
    count(*) filter (where subject_scope in ('person','lead'))::bigint as known_subject_preference_count,
    count(*) filter (where subject_scope in ('person','lead') and current_decision = 'granted')::bigint as known_subject_grants,
    count(*) filter (where subject_scope in ('person','lead') and current_decision in ('denied','withdrawn','opted_out','limited'))::bigint as known_subject_non_grants,
    count(*) filter (where subject_scope = 'visitor')::bigint as visitor_preference_count,
    count(*) filter (where subject_scope = 'visitor' and current_decision = 'granted')::bigint as visitor_grants,
    count(*) filter (where subject_scope = 'visitor' and current_decision in ('denied','withdrawn','opted_out','limited'))::bigint as visitor_non_grants,
    max(effective_at) as latest_analytics_preference_at
  from analytics_preferences
  group by organization_id, lead_id
),
restriction_rows as (
  select
    r.organization_id,
    r.lead_id,
    r.block_optional_tracking,
    r.block_marketing,
    r.block_profiling,
    r.block_ad_exports,
    r.restrict_processing
  from public.privacy_subject_restrictions r
  where r.active = true
    and r.lead_id is not null

  union all

  select
    r.organization_id,
    lp.lead_id,
    r.block_optional_tracking,
    r.block_marketing,
    r.block_profiling,
    r.block_ad_exports,
    r.restrict_processing
  from public.privacy_subject_restrictions r
  join lead_people lp
    on lp.organization_id = r.organization_id
   and lp.person_id = r.person_id
  where r.active = true
    and r.person_id is not null

  union all

  select
    r.organization_id,
    lv.lead_id,
    r.block_optional_tracking,
    r.block_marketing,
    r.block_profiling,
    r.block_ad_exports,
    r.restrict_processing
  from public.privacy_subject_restrictions r
  join lead_visitors lv
    on lv.organization_id = r.organization_id
   and lv.anonymous_visitor_id = r.anonymous_visitor_id
  where r.active = true
    and r.anonymous_visitor_id is not null
),
restriction_rollup as (
  select
    organization_id,
    lead_id,
    bool_or(coalesce(block_optional_tracking,false)) as block_optional_tracking,
    bool_or(coalesce(block_marketing,false)) as block_marketing,
    bool_or(coalesce(block_profiling,false)) as block_profiling,
    bool_or(coalesce(block_ad_exports,false)) as block_ad_exports,
    bool_or(coalesce(restrict_processing,false)) as restrict_processing
  from restriction_rows
  group by organization_id, lead_id
),
identity_rollup as (
  select
    l.organization_id,
    l.id as lead_id,
    count(distinct lp.person_id)::bigint as linked_person_count,
    count(distinct lv.anonymous_visitor_id)::bigint as linked_visitor_count,
    coalesce(sum(lv.session_count),0)::bigint as linked_session_count,
    coalesce(sum(lv.sessions_30d),0)::bigint as linked_sessions_30d,
    max(lv.latest_session_at) as latest_linked_session_at
  from public.leads l
  left join lead_people lp
    on lp.organization_id = l.organization_id
   and lp.lead_id = l.id
  left join lead_visitors lv
    on lv.organization_id = l.organization_id
   and lv.lead_id = l.id
  group by l.organization_id, l.id
),
base as (
  select
    l.organization_id,
    l.id as lead_id,
    coalesce(i.linked_person_count,0) as linked_person_count,
    coalesce(i.linked_visitor_count,0) as linked_visitor_count,
    coalesce(i.linked_session_count,0) as linked_session_count,
    coalesce(i.linked_sessions_30d,0) as linked_sessions_30d,
    i.latest_linked_session_at,
    coalesce(a.preference_count,0) as analytics_preference_count,
    coalesce(a.known_subject_preference_count,0) as known_subject_preference_count,
    coalesce(a.known_subject_grants,0) as known_subject_grants,
    coalesce(a.known_subject_non_grants,0) as known_subject_non_grants,
    coalesce(a.visitor_preference_count,0) as visitor_preference_count,
    coalesce(a.visitor_grants,0) as visitor_grants,
    coalesce(a.visitor_non_grants,0) as visitor_non_grants,
    a.latest_analytics_preference_at,
    coalesce(r.block_optional_tracking,false) as block_optional_tracking,
    coalesce(r.block_marketing,false) as block_marketing,
    coalesce(r.block_profiling,false) as block_profiling,
    coalesce(r.block_ad_exports,false) as block_ad_exports,
    coalesce(r.restrict_processing,false) as restrict_processing
  from public.leads l
  left join identity_rollup i
    on i.organization_id = l.organization_id
   and i.lead_id = l.id
  left join analytics_rollup a
    on a.organization_id = l.organization_id
   and a.lead_id = l.id
  left join restriction_rollup r
    on r.organization_id = l.organization_id
   and r.lead_id = l.id
),
classified as (
  select
    b.*,
    case
      when b.restrict_processing or b.block_profiling then 'restricted'
      when b.known_subject_non_grants > 0 then 'unavailable_known_subject_choice'
      when b.known_subject_grants > 0 then 'available_known_subject_grant'
      when b.visitor_preference_count = 0 then 'unavailable_unknown'
      when b.visitor_grants > 0 and b.visitor_non_grants = 0 then 'available_visitor_grant'
      when b.visitor_grants = 0 and b.visitor_non_grants > 0 then 'unavailable_no_consent'
      else 'unavailable_mixed_choices'
    end as analytics_evidence_state
  from base b
)
select
  c.organization_id,
  c.lead_id,
  c.linked_person_count,
  c.linked_visitor_count,
  c.linked_session_count,
  c.linked_sessions_30d,
  c.latest_linked_session_at,
  c.analytics_preference_count,
  c.known_subject_preference_count,
  c.known_subject_grants,
  c.known_subject_non_grants,
  c.visitor_preference_count,
  c.visitor_grants,
  c.visitor_non_grants,
  c.latest_analytics_preference_at,
  c.block_optional_tracking,
  c.block_marketing,
  c.block_profiling,
  c.block_ad_exports,
  c.restrict_processing,
  not (c.restrict_processing or c.block_profiling) as profiling_allowed,
  c.analytics_evidence_state,
  c.analytics_evidence_state in ('available_known_subject_grant','available_visitor_grant') as web_behavior_usable_for_profiling,
  case
    when c.restrict_processing or c.block_profiling then 'restricted'
    when c.linked_person_count > 0 and c.analytics_evidence_state in ('available_known_subject_grant','available_visitor_grant') then 'high'
    when c.linked_person_count > 0 or c.analytics_evidence_state in ('available_known_subject_grant','available_visitor_grant') then 'medium'
    else 'low'
  end as evidence_quality_band,
  case
    when c.linked_person_count > 0 then 'person_resolved'
    when c.linked_visitor_count > 0 then 'lead_visitor_linked'
    else 'lead_only'
  end as identity_evidence_state,
  array_remove(array[
    case when c.restrict_processing then 'processing_restricted' end,
    case when c.block_profiling then 'profiling_restricted' end,
    case when c.block_optional_tracking then 'optional_tracking_restricted' end,
    case when c.known_subject_non_grants > 0 then 'known_subject_analytics_not_granted' end,
    case when c.known_subject_grants > 0 then 'known_subject_analytics_granted' end,
    case when c.visitor_grants > 0 then 'visitor_analytics_grant_present' end,
    case when c.visitor_non_grants > 0 then 'visitor_analytics_non_grant_present' end,
    case when c.analytics_preference_count = 0 then 'analytics_choice_unknown' end,
    case when c.linked_person_count > 0 then 'person_identity_resolved' end,
    case when c.linked_visitor_count > 0 then 'visitor_history_linked' end
  ]::text[], null) as evidence_quality_reasons,
  now() as evaluated_at
from classified c;

create or replace view public.v_r10_lead_training_dataset_safe_v2
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
  nullif(s.feature_payload->>'stored_intent','') as stored_intent,
  nullif(s.feature_payload->>'derived_intent','') as derived_intent,
  nullif(s.feature_payload->>'intent_confidence','') as intent_confidence,
  nullif(s.feature_payload->>'behaviour_temperature','') as behaviour_temperature,
  nullif(s.feature_payload->>'engagement_score','')::numeric as engagement_score,
  nullif(s.feature_payload->>'high_intent_events_7d','')::numeric as high_intent_events_7d,
  nullif(s.feature_payload->>'whatsapp_clicks_7d','')::numeric as whatsapp_clicks_7d,
  nullif(s.feature_payload->>'reservation_starts_7d','')::numeric as reservation_starts_7d,
  nullif(s.feature_payload->>'payment_starts_7d','')::numeric as payment_starts_7d,
  nullif(s.feature_payload->>'enquiry_clicks_7d','')::numeric as enquiry_clicks_7d,
  nullif(s.feature_payload->>'brochure_downloads_7d','')::numeric as brochure_downloads_7d,
  nullif(s.feature_payload->>'sessions_7d','')::numeric as sessions_7d,
  nullif(s.feature_payload->>'page_views_7d','')::numeric as page_views_7d,
  nullif(s.feature_payload->>'days_since_last_visit','')::numeric as days_since_last_visit,
  nullif(s.feature_payload->>'has_returned_after_becoming_lead','')::boolean as has_returned_after_becoming_lead,
  nullif(s.feature_payload->>'is_reengaged','')::boolean as is_reengaged,
  nullif(s.feature_payload->>'payment_status','') as payment_status,
  nullif(s.feature_payload->>'net_paid','')::numeric as net_paid,
  nullif(s.feature_payload->>'outstanding_balance','')::numeric as outstanding_balance,
  nullif(s.feature_payload->>'owner_assigned','')::boolean as owner_assigned,
  nullif(s.feature_payload->>'lead_age_hours','')::numeric as lead_age_hours,
  nullif(s.feature_payload->>'hours_since_last_contact','')::numeric as hours_since_last_contact,
  nullif(s.feature_payload->>'hours_since_last_inbound','')::numeric as hours_since_last_inbound,
  nullif(s.feature_payload->>'followup_due','')::boolean as followup_due,
  nullif(s.feature_payload#>>'{operational_context,priority_score}','')::numeric as operational_priority_score,
  nullif(s.feature_payload#>>'{operational_context,priority_band}','') as operational_priority_band,
  nullif(s.feature_payload#>>'{operational_context,next_action_code}','') as next_action_code,
  coalesce((s.feature_payload#>>'{feature_availability,web_behavior_usable}')::boolean,false) as web_behavior_usable,
  coalesce((s.feature_payload#>>'{feature_availability,profiling_allowed}')::boolean,false) as profiling_allowed,
  nullif(s.feature_payload#>>'{evidence_quality,band}','') as evidence_quality_band,
  nullif(s.feature_payload#>>'{evidence_quality,analytics_evidence_state}','') as analytics_evidence_state,
  s.feature_payload#>'{evidence_quality,reasons}' as evidence_quality_reasons
from public.lead_scoring_feature_snapshots s
where s.snapshot_version = 'r10-lead-features-safe-v2'
  and s.outcome_label in ('positive','negative')
  and s.outcome_at is not null
  and s.observed_at < s.outcome_at
  and coalesce((s.feature_payload#>>'{feature_availability,profiling_allowed}')::boolean,false) = true;

create or replace view public.v_r10_lead_model_training_readiness_safe_v2
with (security_invoker = true)
as
with stats as (
  select
    o.id as organization_id,
    count(d.feature_snapshot_id)::bigint as usable_labeled_snapshots,
    count(distinct d.lead_id)::bigint as labeled_leads,
    count(distinct d.lead_id) filter (where d.outcome_label='positive')::bigint as positive_leads,
    count(distinct d.lead_id) filter (where d.outcome_label='negative')::bigint as negative_leads,
    count(*) filter (where d.web_behavior_usable)::bigint as web_observable_snapshots,
    count(*) filter (where not d.web_behavior_usable)::bigint as crm_only_or_web_unavailable_snapshots,
    count(*) filter (where d.observed_at >= d.outcome_at)::bigint as temporal_leakage_violations,
    min(d.observed_at) as first_training_observation_at,
    max(d.observed_at) as last_training_observation_at
  from public.organizations o
  left join public.v_r10_lead_training_dataset_safe_v2 d
    on d.organization_id=o.id
  group by o.id
)
select
  s.*,
  case
    when s.positive_leads=0 or s.negative_leads=0 then 0::numeric
    else round(least(s.positive_leads,s.negative_leads)::numeric / greatest(s.positive_leads,s.negative_leads)::numeric,3)
  end as class_balance_ratio,
  40::bigint as min_labeled_leads,
  20::bigint as min_positive_leads,
  20::bigint as min_negative_leads,
  case
    when s.temporal_leakage_violations > 0 then false
    when s.labeled_leads < 40 then false
    when s.positive_leads < 20 then false
    when s.negative_leads < 20 then false
    else true
  end as candidate_training_allowed,
  case
    when s.temporal_leakage_violations > 0 then 'data_integrity_blocked'
    when s.labeled_leads < 40 then 'collecting_safe_labels'
    when s.positive_leads < 20 then 'needs_positive_examples'
    when s.negative_leads < 20 then 'needs_negative_examples'
    else 'safe_training_ready'
  end as training_readiness_status,
  case
    when s.temporal_leakage_violations > 0 then 'At least one safe-V2 feature row is not strictly earlier than its outcome.'
    when s.labeled_leads < 40 then 'Collect at least 40 distinct labeled leads using privacy-aware safe-V2 snapshots.'
    when s.positive_leads < 20 then 'Collect at least 20 positive realized outcomes before candidate training.'
    when s.negative_leads < 20 then 'Collect at least 20 negative realized outcomes before candidate training.'
    else 'Safe-V2 evidence volume meets the minimum candidate-training guardrail. Holdout calibration is still required before production probabilities.'
  end as training_readiness_reason,
  now() as evaluated_at
from stats s;

create or replace view public.v_intelligence_accuracy_health_v1
with (security_invoker = true)
as
with signal as (
  select
    organization_id,
    count(*)::bigint as total_leads,
    count(*) filter (where profiling_allowed=false)::bigint as profiling_restricted_leads,
    count(*) filter (where web_behavior_usable_for_profiling=true)::bigint as web_behavior_usable_leads,
    count(*) filter (where analytics_evidence_state='unavailable_unknown')::bigint as analytics_choice_unknown_leads,
    count(*) filter (where analytics_evidence_state='unavailable_mixed_choices')::bigint as mixed_analytics_choice_leads,
    count(*) filter (where linked_person_count>0)::bigint as person_resolved_leads
  from public.v_r10_lead_signal_quality_v1
  group by organization_id
), snapshots as (
  select
    organization_id,
    count(*) filter (where snapshot_version='r10-lead-features-safe-v2')::bigint as safe_v2_snapshots,
    count(*) filter (where snapshot_version='r10-lead-features-safe-v2' and outcome_label is not null)::bigint as safe_v2_labeled_snapshots,
    count(distinct lead_id) filter (where snapshot_version='r10-lead-features-safe-v2')::bigint as safe_v2_leads
  from public.lead_scoring_feature_snapshots
  group by organization_id
), predictions as (
  select
    organization_id,
    count(*)::bigint as event_predictions,
    count(*) filter (where probability is not null)::bigint as probability_predictions,
    count(*) filter (where probability is not null and actual_outcome is not null)::bigint as observed_probability_predictions,
    count(*) filter (where probability is null and score is not null)::bigint as ranking_score_predictions
  from public.event_intelligence_predictions
  group by organization_id
), outcomes as (
  select organization_id,count(*)::bigint as prediction_outcome_rows
  from public.event_intelligence_prediction_outcomes
  group by organization_id
)
select
  o.id as organization_id,
  coalesce(s.total_leads,0) as total_leads,
  coalesce(s.profiling_restricted_leads,0) as profiling_restricted_leads,
  coalesce(s.web_behavior_usable_leads,0) as web_behavior_usable_leads,
  coalesce(s.analytics_choice_unknown_leads,0) as analytics_choice_unknown_leads,
  coalesce(s.mixed_analytics_choice_leads,0) as mixed_analytics_choice_leads,
  coalesce(s.person_resolved_leads,0) as person_resolved_leads,
  coalesce(ss.safe_v2_snapshots,0) as safe_v2_snapshots,
  coalesce(ss.safe_v2_labeled_snapshots,0) as safe_v2_labeled_snapshots,
  coalesce(ss.safe_v2_leads,0) as safe_v2_leads,
  coalesce(p.event_predictions,0) as event_predictions,
  coalesce(p.ranking_score_predictions,0) as ranking_score_predictions,
  coalesce(p.probability_predictions,0) as probability_predictions,
  coalesce(p.observed_probability_predictions,0) as observed_probability_predictions,
  coalesce(po.prediction_outcome_rows,0) as prediction_outcome_rows,
  tr.candidate_training_allowed as safe_v2_candidate_training_allowed,
  tr.training_readiness_status as safe_v2_training_readiness_status,
  case
    when coalesce(s.total_leads,0)=0 then 'collecting_leads'
    when coalesce(ss.safe_v2_snapshots,0)=0 then 'collecting_privacy_aware_features'
    when coalesce(ss.safe_v2_labeled_snapshots,0)<40 then 'collecting_realized_outcomes'
    when coalesce(p.probability_predictions,0)=0 then 'ready_for_candidate_model_work'
    when coalesce(p.observed_probability_predictions,0)<20 then 'observing_probability_accuracy'
    else 'outcome_learning_active'
  end as accuracy_learning_status,
  case
    when coalesce(s.total_leads,0)=0 then 'No lead evidence exists yet.'
    when coalesce(ss.safe_v2_snapshots,0)=0 then 'Collect privacy-aware feature snapshots before training or claiming predictive accuracy.'
    when coalesce(ss.safe_v2_labeled_snapshots,0)<40 then 'More realized positive/negative outcomes are required before model training.'
    when coalesce(p.probability_predictions,0)=0 then 'Safe evidence is accumulating; no calibrated probability model is active yet.'
    when coalesce(p.observed_probability_predictions,0)<20 then 'Probability predictions exist but realized outcomes are still too sparse for a stable live accuracy claim.'
    else 'Realized prediction outcomes are available for calibration/drift evaluation.'
  end as accuracy_learning_reason,
  now() as checked_at
from public.organizations o
left join signal s on s.organization_id=o.id
left join snapshots ss on ss.organization_id=o.id
left join predictions p on p.organization_id=o.id
left join outcomes po on po.organization_id=o.id
left join public.v_r10_lead_model_training_readiness_safe_v2 tr on tr.organization_id=o.id;

grant select on public.v_r10_lead_signal_quality_v1 to authenticated, service_role;
grant select on public.v_r10_lead_training_dataset_safe_v2 to authenticated, service_role;
grant select on public.v_r10_lead_model_training_readiness_safe_v2 to authenticated, service_role;
grant select on public.v_intelligence_accuracy_health_v1 to authenticated, service_role;

commit;
