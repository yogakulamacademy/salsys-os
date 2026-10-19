create table if not exists public.lead_scoring_model_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_version_id uuid not null references public.lead_scoring_model_versions(id) on delete cascade,
  evaluation_kind text not null default 'holdout',
  evaluated_at timestamptz not null default now(),
  evaluation_window_start timestamptz,
  evaluation_window_end timestamptz,
  sample_count integer not null default 0,
  positive_count integer not null default 0,
  negative_count integer not null default 0,
  decision_threshold numeric(7,6),
  roc_auc numeric(7,6),
  pr_auc numeric(7,6),
  precision_score numeric(7,6),
  recall_score numeric(7,6),
  f1_score numeric(7,6),
  brier_score numeric(7,6),
  log_loss numeric,
  expected_calibration_error numeric(7,6),
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  constraint lead_scoring_model_evaluations_kind_check check (
    evaluation_kind in ('holdout','backtest','calibration','drift')
  ),
  constraint lead_scoring_model_evaluations_counts_check check (
    sample_count >= 0 and positive_count >= 0 and negative_count >= 0
      and positive_count + negative_count <= sample_count
  ),
  constraint lead_scoring_model_evaluations_threshold_check check (
    decision_threshold is null or (decision_threshold >= 0 and decision_threshold <= 1)
  ),
  constraint lead_scoring_model_evaluations_metric_range_check check (
    (roc_auc is null or (roc_auc >= 0 and roc_auc <= 1))
    and (pr_auc is null or (pr_auc >= 0 and pr_auc <= 1))
    and (precision_score is null or (precision_score >= 0 and precision_score <= 1))
    and (recall_score is null or (recall_score >= 0 and recall_score <= 1))
    and (f1_score is null or (f1_score >= 0 and f1_score <= 1))
    and (brier_score is null or (brier_score >= 0 and brier_score <= 1))
    and (expected_calibration_error is null or (expected_calibration_error >= 0 and expected_calibration_error <= 1))
  )
);

create index if not exists idx_lead_scoring_model_evaluations_model_time
  on public.lead_scoring_model_evaluations (organization_id, model_version_id, evaluated_at desc);

alter table public.lead_scoring_model_evaluations enable row level security;

revoke all on public.lead_scoring_model_evaluations from public, anon;
grant select on public.lead_scoring_model_evaluations to authenticated;
grant all on public.lead_scoring_model_evaluations to service_role;

drop policy if exists lead_scoring_model_evaluations_member_select
  on public.lead_scoring_model_evaluations;
create policy lead_scoring_model_evaluations_member_select
  on public.lead_scoring_model_evaluations
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_r10_lead_model_promotion_readiness_v1
with (security_invoker = true)
as
with latest_holdout as (
  select distinct on (e.organization_id, e.model_version_id)
    e.organization_id,
    e.model_version_id,
    e.evaluated_at,
    e.sample_count,
    e.positive_count,
    e.negative_count,
    e.decision_threshold,
    e.roc_auc,
    e.pr_auc,
    e.precision_score,
    e.recall_score,
    e.f1_score,
    e.brier_score,
    e.log_loss,
    e.expected_calibration_error,
    e.metrics
  from public.lead_scoring_model_evaluations e
  where e.evaluation_kind = 'holdout'
  order by e.organization_id, e.model_version_id, e.evaluated_at desc, e.id desc
)
select
  m.organization_id,
  m.id as model_version_id,
  m.model_key,
  m.version,
  m.status as model_status,
  m.training_rows,
  m.positive_rows,
  m.negative_rows,
  m.trained_at,
  h.evaluated_at as latest_holdout_evaluated_at,
  h.sample_count as holdout_sample_count,
  h.positive_count as holdout_positive_count,
  h.negative_count as holdout_negative_count,
  h.decision_threshold,
  h.roc_auc,
  h.pr_auc,
  h.precision_score,
  h.recall_score,
  h.f1_score,
  h.brier_score,
  h.log_loss,
  h.expected_calibration_error,
  tr.training_readiness_status,
  tr.candidate_model_training_allowed,
  tr.production_prediction_release_allowed,
  case
    when m.status <> 'candidate' then false
    when tr.production_prediction_release_allowed is not true then false
    when h.model_version_id is null then false
    when h.sample_count < 20 then false
    when h.positive_count < 5 or h.negative_count < 5 then false
    when h.roc_auc is null or h.roc_auc < 0.65 then false
    when h.brier_score is null or h.brier_score > 0.25 then false
    when h.expected_calibration_error is null or h.expected_calibration_error > 0.10 then false
    when h.precision_score is null or h.precision_score < 0.50 then false
    when h.recall_score is null or h.recall_score < 0.50 then false
    else true
  end as model_promotion_allowed,
  case
    when m.status <> 'candidate' then 'Only candidate models are evaluated for promotion.'
    when tr.production_prediction_release_allowed is not true then 'Production prediction release is blocked by the broader predictive-readiness gate.'
    when h.model_version_id is null then 'No holdout evaluation exists for this model version.'
    when h.sample_count < 20 then 'Holdout sample is too small; at least 20 labeled examples are required.'
    when h.positive_count < 5 or h.negative_count < 5 then 'Holdout evaluation needs at least 5 positive and 5 negative examples.'
    when h.roc_auc is null or h.roc_auc < 0.65 then 'ROC-AUC does not meet the baseline promotion threshold of 0.65.'
    when h.brier_score is null or h.brier_score > 0.25 then 'Brier score does not meet the baseline calibration threshold of 0.25 or lower.'
    when h.expected_calibration_error is null or h.expected_calibration_error > 0.10 then 'Expected calibration error must be 0.10 or lower.'
    when h.precision_score is null or h.precision_score < 0.50 then 'Precision does not meet the baseline threshold of 0.50.'
    when h.recall_score is null or h.recall_score < 0.50 then 'Recall does not meet the baseline threshold of 0.50.'
    else 'Candidate model meets the current baseline holdout and predictive-readiness promotion guardrails.'
  end as promotion_reason,
  now() as evaluated_at
from public.lead_scoring_model_versions m
left join latest_holdout h
  on h.organization_id = m.organization_id
 and h.model_version_id = m.id
left join public.v_r10_lead_model_training_readiness_v1 tr
  on tr.organization_id = m.organization_id;

comment on table public.lead_scoring_model_evaluations is
  'R10 append-only model evaluation registry for predictive lead scoring. Holdout, backtest, calibration and drift metrics are stored separately from model training metadata.';

comment on view public.v_r10_lead_model_promotion_readiness_v1 is
  'R10 conservative model-promotion guardrail. A model cannot become production-ready solely because training succeeded; it must also satisfy holdout quality, calibration, class-support and tenant predictive-readiness checks.';

revoke all on public.v_r10_lead_model_promotion_readiness_v1 from public, anon;
grant select on public.v_r10_lead_model_promotion_readiness_v1 to authenticated, service_role;
