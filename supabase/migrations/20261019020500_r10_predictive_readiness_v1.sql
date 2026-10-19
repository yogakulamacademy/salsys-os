create or replace view public.v_r10_predictive_readiness_v1
with (security_invoker = true)
as
with thresholds as (
  select
    100::bigint as min_total_leads,
    20::bigint as min_positive_outcomes,
    20::bigint as min_negative_outcomes,
    50::numeric as min_labeled_outcome_rate_pct,
    20::bigint as min_recommendation_outcome_samples
),
lead_labels as (
  select
    l.organization_id,
    l.id as lead_id,
    case
      when l.current_stage::text = 'enrolled'
        or exists (
          select 1
          from public.payments p
          where p.organization_id = l.organization_id
            and p.lead_id = l.id
            and p.status::text = 'paid'
        )
        or exists (
          select 1
          from public.enrollments e
          where e.organization_id = l.organization_id
            and e.lead_id = l.id
            and e.status::text not in ('cancelled', 'refunded')
        )
      then 'positive'
      when l.current_stage::text in ('lost', 'unqualified') then 'negative'
      else 'unlabeled'
    end as outcome_label
  from public.leads l
),
lead_rollup as (
  select
    organization_id,
    count(*)::bigint as total_leads,
    count(*) filter (where outcome_label = 'positive')::bigint as positive_outcomes,
    count(*) filter (where outcome_label = 'negative')::bigint as negative_outcomes,
    count(*) filter (where outcome_label <> 'unlabeled')::bigint as labeled_outcomes,
    count(*) filter (where outcome_label = 'unlabeled')::bigint as unlabeled_leads
  from lead_labels
  group by organization_id
),
sales_intelligence_rollup as (
  select
    organization_id,
    count(*)::bigint as sales_intelligence_rows,
    count(*) filter (where priority_score is not null)::bigint as rows_with_priority,
    count(*) filter (where next_best_action is not null)::bigint as rows_with_next_best_action,
    count(*) filter (where person_id is not null)::bigint as rows_with_person_resolution
  from public.v_lead_sales_intelligence_v1
  group by organization_id
),
recommendation_rollup as (
  select
    o.id as organization_id,
    count(distinct r.id)::bigint as recommendation_rows,
    count(distinct e.id)::bigint as recommendation_event_rows,
    count(distinct e.id) filter (where e.outcome_class is not null)::bigint as recommendation_outcome_events,
    coalesce(sum(lp.outcome_samples), 0)::bigint as learning_outcome_samples,
    count(distinct lp.id)::bigint as learning_profile_rows
  from public.organizations o
  left join public.system_intelligence_recommendations r
    on r.organization_id = o.id
  left join public.system_intelligence_recommendation_events e
    on e.organization_id = o.id
  left join public.system_intelligence_learning_profiles lp
    on lp.organization_id = o.id
  group by o.id
)
select
  o.id as organization_id,
  coalesce(lr.total_leads, 0)::bigint as total_leads,
  coalesce(lr.positive_outcomes, 0)::bigint as positive_outcomes,
  coalesce(lr.negative_outcomes, 0)::bigint as negative_outcomes,
  coalesce(lr.labeled_outcomes, 0)::bigint as labeled_outcomes,
  coalesce(lr.unlabeled_leads, 0)::bigint as unlabeled_leads,
  case
    when coalesce(lr.total_leads, 0) = 0 then 0::numeric
    else round((coalesce(lr.labeled_outcomes, 0)::numeric / lr.total_leads::numeric) * 100, 1)
  end as labeled_outcome_rate_pct,
  coalesce(si.sales_intelligence_rows, 0)::bigint as sales_intelligence_rows,
  coalesce(si.rows_with_priority, 0)::bigint as rows_with_priority,
  coalesce(si.rows_with_next_best_action, 0)::bigint as rows_with_next_best_action,
  coalesce(si.rows_with_person_resolution, 0)::bigint as rows_with_person_resolution,
  coalesce(rr.recommendation_rows, 0)::bigint as recommendation_rows,
  coalesce(rr.recommendation_event_rows, 0)::bigint as recommendation_event_rows,
  coalesce(rr.recommendation_outcome_events, 0)::bigint as recommendation_outcome_events,
  coalesce(rr.learning_outcome_samples, 0)::bigint as learning_outcome_samples,
  coalesce(rr.learning_profile_rows, 0)::bigint as learning_profile_rows,
  t.min_total_leads,
  t.min_positive_outcomes,
  t.min_negative_outcomes,
  t.min_labeled_outcome_rate_pct,
  t.min_recommendation_outcome_samples,
  case
    when coalesce(lr.total_leads, 0) < t.min_total_leads then 'insufficient_history'
    when coalesce(lr.positive_outcomes, 0) < t.min_positive_outcomes then 'insufficient_positive_outcomes'
    when coalesce(lr.negative_outcomes, 0) < t.min_negative_outcomes then 'insufficient_negative_outcomes'
    when (
      case
        when coalesce(lr.total_leads, 0) = 0 then 0::numeric
        else (coalesce(lr.labeled_outcomes, 0)::numeric / lr.total_leads::numeric) * 100
      end
    ) < t.min_labeled_outcome_rate_pct then 'low_label_coverage'
    else 'ready_for_baseline_model'
  end as predictive_readiness_status,
  (
    coalesce(lr.total_leads, 0) >= t.min_total_leads
    and coalesce(lr.positive_outcomes, 0) >= t.min_positive_outcomes
    and coalesce(lr.negative_outcomes, 0) >= t.min_negative_outcomes
    and (
      case
        when coalesce(lr.total_leads, 0) = 0 then 0::numeric
        else (coalesce(lr.labeled_outcomes, 0)::numeric / lr.total_leads::numeric) * 100
      end
    ) >= t.min_labeled_outcome_rate_pct
  ) as prediction_generation_allowed,
  (
    coalesce(rr.learning_outcome_samples, 0) >= t.min_recommendation_outcome_samples
  ) as recommendation_calibration_ready,
  case
    when coalesce(lr.total_leads, 0) < t.min_total_leads
      then 'Collect more historical lead outcomes before training or publishing conversion probabilities.'
    when coalesce(lr.positive_outcomes, 0) < t.min_positive_outcomes
      then 'Positive outcome history is too small for a defensible conversion model.'
    when coalesce(lr.negative_outcomes, 0) < t.min_negative_outcomes
      then 'Negative outcome history is too small for a defensible conversion model.'
    when (
      case
        when coalesce(lr.total_leads, 0) = 0 then 0::numeric
        else (coalesce(lr.labeled_outcomes, 0)::numeric / lr.total_leads::numeric) * 100
      end
    ) < t.min_labeled_outcome_rate_pct
      then 'Outcome labels are incomplete; improve terminal outcome capture before model training.'
    else 'Historical outcome volume meets the minimum R10 baseline-model readiness guardrail.'
  end as readiness_reason
from public.organizations o
cross join thresholds t
left join lead_rollup lr on lr.organization_id = o.id
left join sales_intelligence_rollup si on si.organization_id = o.id
left join recommendation_rollup rr on rr.organization_id = o.id;

comment on view public.v_r10_predictive_readiness_v1 is
  'R10 predictive-readiness guardrail. Reports historical label volume, deterministic sales-intelligence coverage, and recommendation-learning samples. prediction_generation_allowed must remain false until minimum historical outcome thresholds are met; this view does not itself produce predictive probabilities.';

revoke all on public.v_r10_predictive_readiness_v1 from public, anon;
grant select on public.v_r10_predictive_readiness_v1 to authenticated, service_role;