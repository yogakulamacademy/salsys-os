create or replace view public.v_r10_recommendation_effectiveness_v1
with (security_invoker = true)
as
with event_rollup as (
  select
    e.organization_id,
    e.recommendation_id,
    count(*) filter (where e.event_type = 'shown')::integer as shown_events,
    count(*) filter (where e.event_type = 'accepted')::integer as accepted_events,
    count(*) filter (where e.event_type = 'dismissed')::integer as dismissed_events,
    count(*) filter (where e.event_type = 'action_started')::integer as action_started_events,
    count(*) filter (where e.event_type = 'action_completed')::integer as action_completed_events,
    count(*) filter (where e.event_type = 'outcome_observed')::integer as outcome_events,
    count(*) filter (where e.event_type = 'business_outcome_observed')::integer as business_outcome_events,
    count(*) filter (where e.outcome_class = 'positive')::integer as positive_outcomes,
    count(*) filter (where e.outcome_class = 'neutral')::integer as neutral_outcomes,
    count(*) filter (where e.outcome_class = 'negative')::integer as negative_outcomes,
    count(*) filter (where e.outcome_class = 'mixed')::integer as mixed_outcomes,
    count(*) filter (where e.outcome_class = 'inconclusive')::integer as inconclusive_outcomes,
    max(e.created_at) as latest_event_at
  from public.system_intelligence_recommendation_events e
  group by e.organization_id, e.recommendation_id
), recommendation_rollup as (
  select
    r.organization_id,
    count(*)::integer as recommendations_total,
    count(*) filter (where r.shown_count > 0)::integer as recommendations_shown,
    count(*) filter (where r.accepted_at is not null)::integer as recommendations_accepted,
    count(*) filter (where r.dismissed_at is not null)::integer as recommendations_dismissed,
    count(*) filter (where r.acted_at is not null)::integer as recommendations_acted,
    count(*) filter (where r.completed_at is not null)::integer as recommendations_completed,
    coalesce(sum(r.shown_count), 0)::integer as shown_count,
    max(r.updated_at) as latest_recommendation_at
  from public.system_intelligence_recommendations r
  group by r.organization_id
), event_totals as (
  select
    organization_id,
    coalesce(sum(shown_events), 0)::integer as shown_events,
    coalesce(sum(accepted_events), 0)::integer as accepted_events,
    coalesce(sum(dismissed_events), 0)::integer as dismissed_events,
    coalesce(sum(action_started_events), 0)::integer as action_started_events,
    coalesce(sum(action_completed_events), 0)::integer as action_completed_events,
    coalesce(sum(outcome_events), 0)::integer as outcome_events,
    coalesce(sum(business_outcome_events), 0)::integer as business_outcome_events,
    coalesce(sum(positive_outcomes), 0)::integer as positive_outcomes,
    coalesce(sum(neutral_outcomes), 0)::integer as neutral_outcomes,
    coalesce(sum(negative_outcomes), 0)::integer as negative_outcomes,
    coalesce(sum(mixed_outcomes), 0)::integer as mixed_outcomes,
    coalesce(sum(inconclusive_outcomes), 0)::integer as inconclusive_outcomes,
    max(latest_event_at) as latest_event_at
  from event_rollup
  group by organization_id
), orgs as (
  select id as organization_id from public.organizations
)
select
  o.organization_id,
  coalesce(r.recommendations_total, 0) as recommendations_total,
  coalesce(r.recommendations_shown, 0) as recommendations_shown,
  coalesce(r.recommendations_accepted, 0) as recommendations_accepted,
  coalesce(r.recommendations_dismissed, 0) as recommendations_dismissed,
  coalesce(r.recommendations_acted, 0) as recommendations_acted,
  coalesce(r.recommendations_completed, 0) as recommendations_completed,
  coalesce(r.shown_count, 0) as shown_count,
  coalesce(e.outcome_events, 0) + coalesce(e.business_outcome_events, 0) as observed_outcome_events,
  coalesce(e.positive_outcomes, 0) as positive_outcomes,
  coalesce(e.neutral_outcomes, 0) as neutral_outcomes,
  coalesce(e.negative_outcomes, 0) as negative_outcomes,
  coalesce(e.mixed_outcomes, 0) as mixed_outcomes,
  coalesce(e.inconclusive_outcomes, 0) as inconclusive_outcomes,
  case
    when coalesce(r.recommendations_shown, 0) = 0 then null
    else round((100.0 * coalesce(r.recommendations_accepted, 0) / r.recommendations_shown)::numeric, 1)
  end as observed_acceptance_rate_pct,
  case
    when coalesce(r.recommendations_accepted, 0) = 0 then null
    else round((100.0 * coalesce(r.recommendations_completed, 0) / r.recommendations_accepted)::numeric, 1)
  end as observed_completion_rate_pct,
  case
    when (coalesce(e.positive_outcomes, 0) + coalesce(e.neutral_outcomes, 0) + coalesce(e.negative_outcomes, 0) + coalesce(e.mixed_outcomes, 0) + coalesce(e.inconclusive_outcomes, 0)) = 0 then null
    else round((100.0 * coalesce(e.positive_outcomes, 0) /
      (coalesce(e.positive_outcomes, 0) + coalesce(e.neutral_outcomes, 0) + coalesce(e.negative_outcomes, 0) + coalesce(e.mixed_outcomes, 0) + coalesce(e.inconclusive_outcomes, 0)))::numeric, 1)
  end as observed_positive_outcome_rate_pct,
  case
    when coalesce(r.recommendations_total, 0) = 0 then 'no_recommendations'
    when (coalesce(e.positive_outcomes, 0) + coalesce(e.neutral_outcomes, 0) + coalesce(e.negative_outcomes, 0) + coalesce(e.mixed_outcomes, 0) + coalesce(e.inconclusive_outcomes, 0)) = 0 then 'collecting_outcomes'
    when (coalesce(e.positive_outcomes, 0) + coalesce(e.neutral_outcomes, 0) + coalesce(e.negative_outcomes, 0) + coalesce(e.mixed_outcomes, 0) + coalesce(e.inconclusive_outcomes, 0)) < 10 then 'early_observation'
    when (coalesce(e.positive_outcomes, 0) + coalesce(e.neutral_outcomes, 0) + coalesce(e.negative_outcomes, 0) + coalesce(e.mixed_outcomes, 0) + coalesce(e.inconclusive_outcomes, 0)) < 20 then 'maturing'
    else 'established'
  end as learning_status,
  greatest(r.latest_recommendation_at, e.latest_event_at) as latest_learning_activity_at,
  now() as evaluated_at
from orgs o
left join recommendation_rollup r on r.organization_id = o.organization_id
left join event_totals e on e.organization_id = o.organization_id;

comment on view public.v_r10_recommendation_effectiveness_v1 is
  'R10 recommendation learning summary. Rates describe observed user actions and observed downstream outcome associations only; they do not claim that a recommendation caused an outcome.';

revoke all on public.v_r10_recommendation_effectiveness_v1 from public, anon;
grant select on public.v_r10_recommendation_effectiveness_v1 to authenticated, service_role;

create or replace view public.v_r10_owner_command_center_v1
with (security_invoker = true)
as
with scoring as (
  select
    organization_id,
    count(*)::integer as scored_leads,
    count(*) filter (where scoring_mode = 'predictive')::integer as predictive_leads,
    count(*) filter (where scoring_mode = 'awaiting_prediction')::integer as awaiting_prediction_leads,
    count(*) filter (where scoring_mode = 'deterministic_guarded')::integer as deterministic_guarded_leads,
    round(avg(conversion_probability_pct) filter (where scoring_mode = 'predictive'), 1) as avg_conversion_probability_pct,
    max(prediction_generated_at) as latest_prediction_generated_at
  from public.v_r10_smart_lead_scoring_v1
  group by organization_id
), orgs as (
  select id as organization_id from public.organizations
)
select
  o.organization_id,
  a.awareness_status,
  a.urgency_score,
  a.top_issue_code,
  a.top_issue_summary,
  a.active_leads,
  a.needs_reply,
  a.overdue_followups,
  a.high_intent_leads,
  a.payment_pending_leads,
  a.unowned_active_leads,
  a.critical_priority_leads,
  a.high_priority_leads,
  a.reengaged_leads,
  a.system_failures_24h,
  a.system_pending_24h,
  t.trend_status,
  t.trend_summary,
  t.directional_evidence_available,
  a.predictive_readiness_status,
  a.prediction_generation_allowed,
  coalesce(s.scored_leads, 0) as scored_leads,
  coalesce(s.predictive_leads, 0) as predictive_leads,
  coalesce(s.awaiting_prediction_leads, 0) as awaiting_prediction_leads,
  coalesce(s.deterministic_guarded_leads, 0) as deterministic_guarded_leads,
  s.avg_conversion_probability_pct,
  s.latest_prediction_generated_at,
  h.model_version_id as active_model_version_id,
  h.model_version as active_model_version,
  h.health_status as model_health_status,
  h.health_reason as model_health_reason,
  h.model_age_days,
  h.predictions_7d,
  h.realized_outcomes_30d,
  h.stale_model,
  h.drift_suspected,
  h.retraining_recommended,
  rr.retraining_run_allowed,
  rr.retraining_reason,
  re.recommendations_total,
  re.recommendations_accepted,
  re.recommendations_completed,
  re.observed_outcome_events,
  re.observed_acceptance_rate_pct,
  re.observed_completion_rate_pct,
  re.observed_positive_outcome_rate_pct,
  re.learning_status as recommendation_learning_status,
  case
    when a.awareness_status = 'urgent' or h.health_status = 'critical' then 'critical'
    when a.awareness_status = 'attention' or h.health_status = 'warning' or coalesce(a.needs_reply, 0) > 0 or coalesce(a.overdue_followups, 0) > 0 then 'attention'
    when a.awareness_status = 'opportunity' then 'opportunity'
    when h.model_version_id is null or a.prediction_generation_allowed is not true or re.learning_status in ('no_recommendations','collecting_outcomes','early_observation') then 'learning'
    else 'healthy'
  end as command_status,
  case
    when a.awareness_status = 'urgent' then coalesce(a.top_issue_summary, 'Immediate operating attention is required.')
    when h.health_status = 'critical' then coalesce(h.health_reason, 'The active predictive model requires attention.')
    when coalesce(a.needs_reply, 0) > 0 then concat(a.needs_reply, ' lead conversations currently need a reply.')
    when coalesce(a.overdue_followups, 0) > 0 then concat(a.overdue_followups, ' follow-ups are overdue.')
    when h.model_version_id is null and a.prediction_generation_allowed is not true then 'Predictive scoring is safely collecting outcome history; operational priority scoring remains active.'
    when h.model_version_id is null then 'Predictive readiness is sufficient, but no validated active model exists yet.'
    when h.health_status in ('warning','observing') then coalesce(h.health_reason, 'Predictive model evidence is still being observed.')
    when a.awareness_status = 'opportunity' then coalesce(a.top_issue_summary, 'The system currently sees opportunity without a dominant critical risk.')
    else 'Current operating, predictive-model and recommendation-learning checks are within available guardrails.'
  end as command_summary,
  case
    when h.model_version_id is null and a.prediction_generation_allowed is not true then 'collecting_predictive_history'
    when h.model_version_id is null then 'awaiting_validated_model'
    when h.health_status = 'critical' then 'active_model_attention'
    when coalesce(s.predictive_leads, 0) > 0 then 'predictive_active'
    else 'active_model_waiting_predictions'
  end as predictive_operating_state,
  now() as evaluated_at
from orgs o
left join public.v_r10_system_awareness_v1 a on a.organization_id = o.organization_id
left join public.v_r10_system_awareness_trend_v1 t on t.organization_id = o.organization_id
left join public.v_r10_lead_model_health_v1 h on h.organization_id = o.organization_id
left join public.v_r10_lead_retraining_readiness_v1 rr on rr.organization_id = o.organization_id and rr.model_key = 'conversion_probability'
left join public.v_r10_recommendation_effectiveness_v1 re on re.organization_id = o.organization_id
left join scoring s on s.organization_id = o.organization_id;

comment on view public.v_r10_owner_command_center_v1 is
  'R10 owner command-center contract. Consolidates current operating pressure, directional trend, smart scoring mode, predictive model health/retraining and recommendation-learning evidence without converting deterministic scores or sparse observations into fake probabilities or causal claims.';

revoke all on public.v_r10_owner_command_center_v1 from public, anon;
grant select on public.v_r10_owner_command_center_v1 to authenticated, service_role;
