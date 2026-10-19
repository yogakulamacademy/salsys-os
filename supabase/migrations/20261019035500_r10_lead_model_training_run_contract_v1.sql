create table if not exists public.lead_scoring_training_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_key text not null default 'conversion_probability',
  run_version text not null default 'r10-training-run-v1',
  status text not null default 'blocked',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  dataset_cutoff_at timestamptz not null,
  training_window_start timestamptz,
  training_window_end timestamptz,
  split_strategy text not null default 'time_holdout',
  random_seed integer,
  training_rows integer not null default 0,
  holdout_rows integer not null default 0,
  positive_rows integer not null default 0,
  negative_rows integer not null default 0,
  feature_schema jsonb not null default '[]'::jsonb,
  hyperparameters jsonb not null default '{}'::jsonb,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  block_reason text,
  model_version_id uuid references public.lead_scoring_model_versions(id) on delete set null,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  constraint lead_scoring_training_runs_status_check check (
    status in ('blocked','queued','running','completed','failed','cancelled')
  ),
  constraint lead_scoring_training_runs_split_check check (
    split_strategy in ('time_holdout','grouped_time_holdout','manual')
  ),
  constraint lead_scoring_training_runs_counts_check check (
    training_rows >= 0 and holdout_rows >= 0 and positive_rows >= 0 and negative_rows >= 0
  ),
  constraint lead_scoring_training_runs_completion_check check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create index if not exists idx_lead_scoring_training_runs_org_requested
  on public.lead_scoring_training_runs (organization_id, requested_at desc);

create index if not exists idx_lead_scoring_training_runs_org_status
  on public.lead_scoring_training_runs (organization_id, status, requested_at desc);

alter table public.lead_scoring_training_runs enable row level security;

revoke all on public.lead_scoring_training_runs from public, anon;
grant select on public.lead_scoring_training_runs to authenticated;
grant all on public.lead_scoring_training_runs to service_role;

drop policy if exists lead_scoring_training_runs_member_select
  on public.lead_scoring_training_runs;
create policy lead_scoring_training_runs_member_select
  on public.lead_scoring_training_runs
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_r10_lead_training_run_readiness_v1
with (security_invoker = true)
as
with latest_run as (
  select distinct on (r.organization_id, r.model_key)
    r.organization_id,
    r.model_key,
    r.id as latest_training_run_id,
    r.status as latest_training_run_status,
    r.requested_at as latest_training_requested_at,
    r.started_at as latest_training_started_at,
    r.completed_at as latest_training_completed_at,
    r.dataset_cutoff_at as latest_dataset_cutoff_at,
    r.block_reason as latest_block_reason,
    r.model_version_id as latest_model_version_id
  from public.lead_scoring_training_runs r
  order by r.organization_id, r.model_key, r.requested_at desc, r.id desc
)
select
  tr.organization_id,
  'conversion_probability'::text as model_key,
  tr.training_readiness_status,
  tr.training_readiness_reason,
  tr.candidate_model_training_allowed,
  tr.production_prediction_release_allowed,
  tr.training_rows,
  tr.training_leads,
  tr.positive_leads,
  tr.negative_leads,
  tr.class_balance_ratio,
  tr.temporal_leakage_violations,
  lr.latest_training_run_id,
  lr.latest_training_run_status,
  lr.latest_training_requested_at,
  lr.latest_training_started_at,
  lr.latest_training_completed_at,
  lr.latest_dataset_cutoff_at,
  lr.latest_block_reason,
  lr.latest_model_version_id,
  case
    when tr.candidate_model_training_allowed is not true then false
    when lr.latest_training_run_status in ('queued','running') then false
    else true
  end as new_training_run_allowed,
  case
    when tr.candidate_model_training_allowed is not true then tr.training_readiness_reason
    when lr.latest_training_run_status in ('queued','running') then 'A candidate model training run is already queued or running for this organization.'
    else 'Candidate model training may start with an immutable dataset cutoff and reproducible split metadata.'
  end as new_training_run_reason,
  now() as evaluated_at
from public.v_r10_lead_model_training_readiness_v1 tr
left join latest_run lr
  on lr.organization_id = tr.organization_id
 and lr.model_key = 'conversion_probability';

comment on table public.lead_scoring_training_runs is
  'R10 auditable candidate-model training run registry. Each run captures dataset cutoff, split strategy, feature schema, readiness evidence and resulting model version so training can be reproduced and reviewed.';

comment on view public.v_r10_lead_training_run_readiness_v1 is
  'R10 training-run execution gate. Candidate training is blocked until dataset readiness permits it and duplicate concurrent runs are prevented.';

revoke all on public.v_r10_lead_training_run_readiness_v1 from public, anon;
grant select on public.v_r10_lead_training_run_readiness_v1 to authenticated, service_role;
