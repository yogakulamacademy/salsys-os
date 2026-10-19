create table if not exists public.lead_scoring_model_health_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_version_id uuid references public.lead_scoring_model_versions(id) on delete cascade,
  checked_at timestamptz not null default now(),
  health_status text not null default 'observing',
  model_age_days numeric,
  predictions_7d integer not null default 0,
  predictions_30d integer not null default 0,
  realized_outcomes_30d integer not null default 0,
  latest_prediction_at timestamptz,
  latest_holdout_evaluated_at timestamptz,
  latest_drift_evaluated_at timestamptz,
  latest_drift_sample_count integer,
  latest_drift_roc_auc numeric(7,6),
  latest_drift_brier_score numeric(7,6),
  latest_drift_calibration_error numeric(7,6),
  stale_model boolean not null default false,
  drift_suspected boolean not null default false,
  retraining_recommended boolean not null default false,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_scoring_model_health_checks_status_check check (
    health_status in ('no_active_model','observing','healthy','warning','critical')
  ),
  constraint lead_scoring_model_health_checks_nonnegative_check check (
    predictions_7d >= 0 and predictions_30d >= 0 and realized_outcomes_30d >= 0
      and (latest_drift_sample_count is null or latest_drift_sample_count >= 0)
  )
);

create index if not exists idx_lead_scoring_model_health_checks_org_time
  on public.lead_scoring_model_health_checks (organization_id, checked_at desc);
create index if not exists idx_lead_scoring_model_health_checks_model_time
  on public.lead_scoring_model_health_checks (organization_id, model_version_id, checked_at desc);

alter table public.lead_scoring_model_health_checks enable row level security;
revoke all on public.lead_scoring_model_health_checks from public, anon;
grant select on public.lead_scoring_model_health_checks to authenticated;
grant all on public.lead_scoring_model_health_checks to service_role;

drop policy if exists lead_scoring_model_health_checks_member_select
  on public.lead_scoring_model_health_checks;
create policy lead_scoring_model_health_checks_member_select
  on public.lead_scoring_model_health_checks
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_r10_lead_model_health_v1
with (security_invoker = true)
as
with active_model as (
  select
    m.organization_id,
    m.id as model_version_id,
    m.model_key,
    m.version,
    m.trained_at,
    m.training_rows,
    m.positive_rows,
    m.negative_rows,
    extract(epoch from (now() - coalesce(m.trained_at, m.created_at))) / 86400.0 as model_age_days
  from public.lead_scoring_model_versions m
  where m.status = 'active'
), latest_holdout as (
  select distinct on (e.organization_id, e.model_version_id)
    e.organization_id,
    e.model_version_id,
    e.evaluated_at,
    e.sample_count,
    e.roc_auc,
    e.brier_score,
    e.expected_calibration_error
  from public.lead_scoring_model_evaluations e
  where e.evaluation_kind = 'holdout'
  order by e.organization_id, e.model_version_id, e.evaluated_at desc, e.id desc
), latest_drift as (
  select distinct on (e.organization_id, e.model_version_id)
    e.organization_id,
    e.model_version_id,
    e.evaluated_at,
    e.sample_count,
    e.positive_count,
    e.negative_count,
    e.roc_auc,
    e.brier_score,
    e.expected_calibration_error
  from public.lead_scoring_model_evaluations e
  where e.evaluation_kind = 'drift'
  order by e.organization_id, e.model_version_id, e.evaluated_at desc, e.id desc
), prediction_stats as (
  select
    p.organization_id,
    p.model_version_id,
    count(*) filter (where p.generated_at >= now() - interval '7 days')::integer as predictions_7d,
    count(*) filter (where p.generated_at >= now() - interval '30 days')::integer as predictions_30d,
    max(p.generated_at) as latest_prediction_at
  from public.lead_scoring_predictions p
  group by p.organization_id, p.model_version_id
), realized as (
  select
    p.organization_id,
    p.model_version_id,
    count(distinct p.lead_id)::integer as realized_outcomes_30d
  from public.lead_scoring_predictions p
  join public.v_r10_lead_outcome_evidence_v1 o
    on o.organization_id = p.organization_id
   and o.lead_id = p.lead_id
   and o.outcome_label is not null
   and o.outcome_at is not null
   and p.generated_at < o.outcome_at
  where o.outcome_at >= now() - interval '30 days'
  group by p.organization_id, p.model_version_id
), orgs as (
  select id as organization_id from public.organizations
)
select
  o.organization_id,
  a.model_version_id,
  a.model_key,
  a.version as model_version,
  a.trained_at,
  round(a.model_age_days::numeric, 1) as model_age_days,
  coalesce(ps.predictions_7d, 0) as predictions_7d,
  coalesce(ps.predictions_30d, 0) as predictions_30d,
  coalesce(r.realized_outcomes_30d, 0) as realized_outcomes_30d,
  ps.latest_prediction_at,
  h.evaluated_at as latest_holdout_evaluated_at,
  h.sample_count as holdout_sample_count,
  h.roc_auc as holdout_roc_auc,
  h.brier_score as holdout_brier_score,
  h.expected_calibration_error as holdout_calibration_error,
  d.evaluated_at as latest_drift_evaluated_at,
  d.sample_count as latest_drift_sample_count,
  d.positive_count as latest_drift_positive_count,
  d.negative_count as latest_drift_negative_count,
  d.roc_auc as latest_drift_roc_auc,
  d.brier_score as latest_drift_brier_score,
  d.expected_calibration_error as latest_drift_calibration_error,
  case
    when a.model_version_id is null then false
    when a.model_age_days >= 120 then true
    else false
  end as stale_model,
  case
    when d.sample_count is null or d.sample_count < 20 then false
    when d.roc_auc is not null and d.roc_auc < 0.60 then true
    when d.brier_score is not null and d.brier_score > 0.30 then true
    when d.expected_calibration_error is not null and d.expected_calibration_error > 0.15 then true
    else false
  end as drift_suspected,
  case
    when a.model_version_id is null then false
    when a.model_age_days >= 90 then true
    when d.sample_count >= 20 and (
      (d.roc_auc is not null and d.roc_auc < 0.60)
      or (d.brier_score is not null and d.brier_score > 0.30)
      or (d.expected_calibration_error is not null and d.expected_calibration_error > 0.15)
    ) then true
    else false
  end as retraining_recommended,
  case
    when a.model_version_id is null then 'no_active_model'
    when a.model_age_days >= 120 then 'critical'
    when d.sample_count >= 20 and (
      (d.roc_auc is not null and d.roc_auc < 0.60)
      or (d.brier_score is not null and d.brier_score > 0.30)
      or (d.expected_calibration_error is not null and d.expected_calibration_error > 0.15)
    ) then 'critical'
    when a.model_age_days >= 90 then 'warning'
    when coalesce(r.realized_outcomes_30d, 0) < 20 then 'observing'
    when d.evaluated_at is null then 'observing'
    when d.evaluated_at < now() - interval '30 days' then 'warning'
    else 'healthy'
  end as health_status,
  case
    when a.model_version_id is null then 'No active predictive lead-scoring model exists; deterministic scoring remains the safe fallback.'
    when a.model_age_days >= 120 then 'Active model is at least 120 days old and is considered stale. Retraining should be prioritized.'
    when d.sample_count >= 20 and d.roc_auc is not null and d.roc_auc < 0.60 then 'Recent realized-outcome evaluation shows ROC-AUC below the drift threshold of 0.60.'
    when d.sample_count >= 20 and d.brier_score is not null and d.brier_score > 0.30 then 'Recent realized-outcome evaluation shows Brier score above the drift threshold of 0.30.'
    when d.sample_count >= 20 and d.expected_calibration_error is not null and d.expected_calibration_error > 0.15 then 'Recent realized-outcome evaluation shows calibration error above the drift threshold of 0.15.'
    when a.model_age_days >= 90 then 'Active model is at least 90 days old; retraining is recommended even if no degradation has been observed.'
    when coalesce(r.realized_outcomes_30d, 0) < 20 then 'Fewer than 20 realized outcomes are available in the last 30 days, so live model performance is still being observed.'
    when d.evaluated_at is null then 'No realized-outcome drift evaluation has been recorded yet.'
    when d.evaluated_at < now() - interval '30 days' then 'The latest drift evaluation is older than 30 days and should be refreshed.'
    else 'Active model currently passes the available age, recency and realized-performance health checks.'
  end as health_reason,
  now() as evaluated_at
from orgs o
left join active_model a
  on a.organization_id = o.organization_id
left join latest_holdout h
  on h.organization_id = a.organization_id
 and h.model_version_id = a.model_version_id
left join latest_drift d
  on d.organization_id = a.organization_id
 and d.model_version_id = a.model_version_id
left join prediction_stats ps
  on ps.organization_id = a.organization_id
 and ps.model_version_id = a.model_version_id
left join realized r
  on r.organization_id = a.organization_id
 and r.model_version_id = a.model_version_id;

comment on table public.lead_scoring_model_health_checks is
  'R10 append-only operational health history for active predictive lead-scoring models. Separates observed staleness/drift signals from model training and promotion state.';

comment on view public.v_r10_lead_model_health_v1 is
  'R10 live predictive-model health contract. Flags stale models, insufficient realized evidence, old drift checks and material degradation without treating sparse data as proof of drift.';

revoke all on public.v_r10_lead_model_health_v1 from public, anon;
grant select on public.v_r10_lead_model_health_v1 to authenticated, service_role;
