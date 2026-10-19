create table if not exists public.lead_scoring_model_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_key text not null default 'conversion_probability',
  incumbent_model_version_id uuid references public.lead_scoring_model_versions(id) on delete cascade,
  candidate_model_version_id uuid not null references public.lead_scoring_model_versions(id) on delete cascade,
  comparison_kind text not null default 'shared_realized_holdout',
  evaluated_at timestamptz not null default now(),
  evaluation_window_start timestamptz,
  evaluation_window_end timestamptz,
  shared_lead_count integer not null default 0,
  positive_count integer not null default 0,
  negative_count integer not null default 0,
  temporal_leakage_violations integer not null default 0,
  lead_overlap_violations integer not null default 0,
  incumbent_roc_auc numeric(7,6),
  candidate_roc_auc numeric(7,6),
  incumbent_brier_score numeric(7,6),
  candidate_brier_score numeric(7,6),
  incumbent_calibration_error numeric(7,6),
  candidate_calibration_error numeric(7,6),
  incumbent_log_loss numeric,
  candidate_log_loss numeric,
  candidate_noninferior boolean not null default false,
  candidate_improved boolean not null default false,
  comparison_result text not null default 'insufficient_evidence',
  reason text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_scoring_model_comparisons_kind_check check (
    comparison_kind in ('shared_realized_holdout','shared_backtest','manual_review')
  ),
  constraint lead_scoring_model_comparisons_counts_check check (
    shared_lead_count >= 0 and positive_count >= 0 and negative_count >= 0
      and positive_count + negative_count <= shared_lead_count
      and temporal_leakage_violations >= 0 and lead_overlap_violations >= 0
  ),
  constraint lead_scoring_model_comparisons_result_check check (
    comparison_result in ('insufficient_evidence','candidate_worse','noninferior','candidate_better','integrity_blocked')
  ),
  constraint lead_scoring_model_comparisons_distinct_models_check check (
    incumbent_model_version_id is null or incumbent_model_version_id <> candidate_model_version_id
  )
);

create index if not exists idx_lead_scoring_model_comparisons_org_time
  on public.lead_scoring_model_comparisons (organization_id, model_key, evaluated_at desc);
create index if not exists idx_lead_scoring_model_comparisons_candidate_time
  on public.lead_scoring_model_comparisons (candidate_model_version_id, evaluated_at desc);

alter table public.lead_scoring_model_comparisons enable row level security;
revoke all on public.lead_scoring_model_comparisons from public, anon;
grant select on public.lead_scoring_model_comparisons to authenticated;
grant all on public.lead_scoring_model_comparisons to service_role;

drop policy if exists lead_scoring_model_comparisons_member_select
  on public.lead_scoring_model_comparisons;
create policy lead_scoring_model_comparisons_member_select
  on public.lead_scoring_model_comparisons
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_r10_lead_retraining_readiness_v1
with (security_invoker = true)
as
select
  h.organization_id,
  coalesce(h.model_key, tr.model_key) as model_key,
  h.model_version_id as active_model_version_id,
  h.model_version as active_model_version,
  h.health_status,
  h.health_reason,
  h.model_age_days,
  h.stale_model,
  h.drift_suspected,
  h.retraining_recommended,
  h.realized_outcomes_30d,
  tr.training_readiness_status,
  tr.training_readiness_reason,
  tr.candidate_model_training_allowed,
  tr.latest_training_run_id,
  tr.latest_training_run_status,
  tr.latest_training_requested_at,
  case
    when tr.candidate_model_training_allowed is not true then false
    when tr.latest_training_run_status in ('queued','running') then false
    when tr.latest_training_requested_at is not null
      and tr.latest_training_requested_at > now() - interval '14 days' then false
    when h.model_version_id is null then true
    when h.retraining_recommended is true then true
    else false
  end as retraining_run_allowed,
  case
    when tr.candidate_model_training_allowed is not true then tr.training_readiness_reason
    when tr.latest_training_run_status in ('queued','running') then 'A lead-model training run is already queued or running.'
    when tr.latest_training_requested_at is not null
      and tr.latest_training_requested_at > now() - interval '14 days' then 'A model training run was requested within the last 14 days; retraining cooldown is still active.'
    when h.model_version_id is null then 'No active model exists and the dataset is ready for an initial candidate training run.'
    when h.retraining_recommended is true then h.health_reason
    else 'The active model does not currently meet the staleness or realized-performance conditions for retraining.'
  end as retraining_reason,
  now() as evaluated_at
from public.v_r10_lead_model_health_v1 h
join public.v_r10_lead_training_run_readiness_v1 tr
  on tr.organization_id = h.organization_id
 and tr.model_key = coalesce(h.model_key, 'conversion_probability');

create or replace view public.v_r10_lead_model_successor_readiness_v1
with (security_invoker = true)
as
with candidates as (
  select p.*
  from public.v_r10_lead_model_promotion_readiness_v1 p
  where p.model_status = 'candidate'
), incumbent as (
  select
    m.organization_id,
    m.model_key,
    m.id as incumbent_model_version_id,
    m.version as incumbent_version
  from public.lead_scoring_model_versions m
  where m.status = 'active'
), latest_comparison as (
  select distinct on (c.organization_id, c.model_key, c.candidate_model_version_id)
    c.organization_id,
    c.model_key,
    c.incumbent_model_version_id,
    c.candidate_model_version_id,
    c.evaluated_at,
    c.shared_lead_count,
    c.positive_count,
    c.negative_count,
    c.temporal_leakage_violations,
    c.lead_overlap_violations,
    c.incumbent_roc_auc,
    c.candidate_roc_auc,
    c.incumbent_brier_score,
    c.candidate_brier_score,
    c.incumbent_calibration_error,
    c.candidate_calibration_error,
    c.candidate_noninferior,
    c.candidate_improved,
    c.comparison_result,
    c.reason
  from public.lead_scoring_model_comparisons c
  order by c.organization_id, c.model_key, c.candidate_model_version_id, c.evaluated_at desc, c.id desc
)
select
  c.organization_id,
  c.model_version_id as candidate_model_version_id,
  c.model_key,
  c.version as candidate_version,
  i.incumbent_model_version_id,
  i.incumbent_version,
  c.model_promotion_allowed as base_promotion_allowed,
  c.promotion_reason as base_promotion_reason,
  lc.evaluated_at as latest_comparison_at,
  lc.shared_lead_count,
  lc.positive_count,
  lc.negative_count,
  lc.incumbent_roc_auc,
  lc.candidate_roc_auc,
  lc.incumbent_brier_score,
  lc.candidate_brier_score,
  lc.incumbent_calibration_error,
  lc.candidate_calibration_error,
  lc.candidate_noninferior,
  lc.candidate_improved,
  lc.comparison_result,
  case
    when c.model_promotion_allowed is not true then false
    when i.incumbent_model_version_id is null then true
    when lc.candidate_model_version_id is null then false
    when lc.incumbent_model_version_id is distinct from i.incumbent_model_version_id then false
    when lc.temporal_leakage_violations > 0 or lc.lead_overlap_violations > 0 then false
    when lc.shared_lead_count < 20 or lc.positive_count < 5 or lc.negative_count < 5 then false
    when lc.candidate_noninferior is not true then false
    when lc.comparison_result not in ('noninferior','candidate_better') then false
    else true
  end as successor_promotion_allowed,
  case
    when c.model_promotion_allowed is not true then c.promotion_reason
    when i.incumbent_model_version_id is null then 'Candidate passes base promotion guardrails and no incumbent active model exists.'
    when lc.candidate_model_version_id is null then 'An active incumbent exists; a shared realized-outcome comparison is required before successor promotion.'
    when lc.incumbent_model_version_id is distinct from i.incumbent_model_version_id then 'The latest comparison does not evaluate this candidate against the current active incumbent.'
    when lc.temporal_leakage_violations > 0 or lc.lead_overlap_violations > 0 then 'Model comparison integrity checks failed.'
    when lc.shared_lead_count < 20 or lc.positive_count < 5 or lc.negative_count < 5 then 'Shared comparison evidence is too small; at least 20 realized leads with 5 positive and 5 negative outcomes are required.'
    when lc.candidate_noninferior is not true then 'Candidate is materially worse than the active incumbent on shared realized-outcome evidence.'
    when lc.comparison_result not in ('noninferior','candidate_better') then lc.reason
    else lc.reason
  end as successor_promotion_reason,
  now() as evaluated_at
from candidates c
left join incumbent i
  on i.organization_id = c.organization_id
 and i.model_key = c.model_key
left join latest_comparison lc
  on lc.organization_id = c.organization_id
 and lc.model_key = c.model_key
 and lc.candidate_model_version_id = c.model_version_id;

comment on table public.lead_scoring_model_comparisons is
  'R10 append-only incumbent-versus-candidate comparison evidence. Successor promotion must use shared realized-outcome evidence rather than comparing unrelated evaluation windows.';
comment on view public.v_r10_lead_retraining_readiness_v1 is
  'R10 conservative retraining orchestrator contract. Training is allowed only when dataset readiness is satisfied, no run is active, cooldown has elapsed, and either no active model exists or model health recommends retraining.';
comment on view public.v_r10_lead_model_successor_readiness_v1 is
  'R10 successor-model promotion guardrail. Initial promotion can use base holdout gates; replacing an active incumbent additionally requires integrity-safe shared realized-outcome comparison evidence and candidate noninferiority.';

revoke all on public.v_r10_lead_retraining_readiness_v1 from public, anon;
grant select on public.v_r10_lead_retraining_readiness_v1 to authenticated, service_role;
revoke all on public.v_r10_lead_model_successor_readiness_v1 from public, anon;
grant select on public.v_r10_lead_model_successor_readiness_v1 to authenticated, service_role;
