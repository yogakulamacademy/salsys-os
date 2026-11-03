-- Recovery-only baseline for the production-ledger migration:
-- 20261019023002 r10_predictive_lead_scoring_foundation_v1
--
-- This file is not part of the normal production migration chain. Migration Replay
-- stages it only when reconstructing a clean database from historical source gaps.
-- The definitions below are recovered from the live production catalog.

begin;

create table if not exists public.lead_scoring_feature_snapshots (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  snapshot_version text not null default 'r10-lead-features-v1'::text,
  feature_payload jsonb not null default '{}'::jsonb,
  observed_stage text,
  observed_status text,
  observed_at timestamptz not null default now(),
  outcome_label text,
  outcome_at timestamptz,
  outcome_source text,
  labeled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_scoring_feature_snapshots_pkey primary key (id),
  constraint lead_scoring_feature_snapshots_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint lead_scoring_feature_snapshots_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete cascade,
  constraint lead_scoring_feature_snapshots_outcome_check check (outcome_label is null or outcome_label = any (array['positive'::text,'negative'::text]))
);

create index if not exists idx_lead_scoring_feature_snapshots_lead_observed
  on public.lead_scoring_feature_snapshots (organization_id, lead_id, observed_at desc);
create index if not exists idx_lead_scoring_feature_snapshots_training
  on public.lead_scoring_feature_snapshots (organization_id, outcome_label, observed_at)
  where outcome_label is not null;

alter table public.lead_scoring_feature_snapshots enable row level security;
create policy lead_scoring_feature_snapshots_member_select
  on public.lead_scoring_feature_snapshots for select to authenticated
  using (public.is_organization_member(organization_id));
revoke all on table public.lead_scoring_feature_snapshots from anon;
grant all on table public.lead_scoring_feature_snapshots to authenticated, service_role;

create table if not exists public.lead_scoring_model_versions (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  model_key text not null default 'conversion_probability'::text,
  version text not null,
  status text not null default 'candidate'::text,
  trained_at timestamptz,
  training_window_start timestamptz,
  training_window_end timestamptz,
  training_rows integer not null default 0,
  positive_rows integer not null default 0,
  negative_rows integer not null default 0,
  feature_schema jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  constraint lead_scoring_model_versions_pkey primary key (id),
  constraint lead_scoring_model_versions_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint lead_scoring_model_versions_org_key_version_unique unique (organization_id, model_key, version),
  constraint lead_scoring_model_versions_status_check check (status = any (array['candidate'::text,'active'::text,'retired'::text,'rejected'::text])),
  constraint lead_scoring_model_versions_counts_check check (training_rows >= 0 and positive_rows >= 0 and negative_rows >= 0)
);

create unique index if not exists idx_lead_scoring_model_versions_one_active
  on public.lead_scoring_model_versions (organization_id, model_key)
  where status = 'active'::text;

alter table public.lead_scoring_model_versions enable row level security;
create policy lead_scoring_model_versions_member_select
  on public.lead_scoring_model_versions for select to authenticated
  using (public.is_organization_member(organization_id));
revoke all on table public.lead_scoring_model_versions from anon;
grant all on table public.lead_scoring_model_versions to authenticated, service_role;

create table if not exists public.lead_scoring_predictions (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  model_version_id uuid not null,
  feature_snapshot_id uuid,
  score_type text not null default 'conversion_probability'::text,
  probability numeric not null,
  confidence_low numeric,
  confidence_high numeric,
  confidence_band text not null default 'unknown'::text,
  explanation jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_scoring_predictions_pkey primary key (id),
  constraint lead_scoring_predictions_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint lead_scoring_predictions_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete cascade,
  constraint lead_scoring_predictions_model_version_id_fkey foreign key (model_version_id) references public.lead_scoring_model_versions(id) on delete restrict,
  constraint lead_scoring_predictions_feature_snapshot_id_fkey foreign key (feature_snapshot_id) references public.lead_scoring_feature_snapshots(id) on delete set null,
  constraint lead_scoring_predictions_probability_check check (probability >= 0::numeric and probability <= 1::numeric),
  constraint lead_scoring_predictions_confidence_low_check check (confidence_low is null or (confidence_low >= 0::numeric and confidence_low <= 1::numeric)),
  constraint lead_scoring_predictions_confidence_high_check check (confidence_high is null or (confidence_high >= 0::numeric and confidence_high <= 1::numeric)),
  constraint lead_scoring_predictions_confidence_order_check check (confidence_low is null or confidence_high is null or confidence_low <= confidence_high),
  constraint lead_scoring_predictions_band_check check (confidence_band = any (array['unknown'::text,'low'::text,'medium'::text,'high'::text]))
);

create index if not exists idx_lead_scoring_predictions_lead_generated
  on public.lead_scoring_predictions (organization_id, lead_id, generated_at desc);

alter table public.lead_scoring_predictions enable row level security;
create policy lead_scoring_predictions_member_select
  on public.lead_scoring_predictions for select to authenticated
  using (public.is_organization_member(organization_id));
revoke all on table public.lead_scoring_predictions from anon;
grant all on table public.lead_scoring_predictions to authenticated, service_role;

commit;
