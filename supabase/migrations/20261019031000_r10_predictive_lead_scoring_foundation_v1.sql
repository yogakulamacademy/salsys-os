create table if not exists public.lead_scoring_model_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_key text not null default 'conversion_probability',
  version text not null,
  status text not null default 'candidate',
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
  constraint lead_scoring_model_versions_status_check check (status in ('candidate','active','retired','rejected')),
  constraint lead_scoring_model_versions_counts_check check (
    training_rows >= 0 and positive_rows >= 0 and negative_rows >= 0
  ),
  constraint lead_scoring_model_versions_org_key_version_unique unique (organization_id, model_key, version)
);

create unique index if not exists idx_lead_scoring_model_versions_one_active
  on public.lead_scoring_model_versions (organization_id, model_key)
  where status = 'active';

create table if not exists public.lead_scoring_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  snapshot_version text not null default 'r10-lead-features-v1',
  feature_payload jsonb not null default '{}'::jsonb,
  observed_stage text,
  observed_status text,
  observed_at timestamptz not null default now(),
  outcome_label text,
  outcome_at timestamptz,
  outcome_source text,
  labeled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_scoring_feature_snapshots_outcome_check check (
    outcome_label is null or outcome_label in ('positive','negative')
  )
);

create index if not exists idx_lead_scoring_feature_snapshots_lead_observed
  on public.lead_scoring_feature_snapshots (organization_id, lead_id, observed_at desc);
create index if not exists idx_lead_scoring_feature_snapshots_training
  on public.lead_scoring_feature_snapshots (organization_id, outcome_label, observed_at)
  where outcome_label is not null;

create table if not exists public.lead_scoring_predictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  model_version_id uuid not null references public.lead_scoring_model_versions(id) on delete restrict,
  feature_snapshot_id uuid references public.lead_scoring_feature_snapshots(id) on delete set null,
  score_type text not null default 'conversion_probability',
  probability numeric(7,6) not null,
  confidence_low numeric(7,6),
  confidence_high numeric(7,6),
  confidence_band text not null default 'unknown',
  explanation jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_scoring_predictions_probability_check check (probability >= 0 and probability <= 1),
  constraint lead_scoring_predictions_confidence_low_check check (confidence_low is null or (confidence_low >= 0 and confidence_low <= 1)),
  constraint lead_scoring_predictions_confidence_high_check check (confidence_high is null or (confidence_high >= 0 and confidence_high <= 1)),
  constraint lead_scoring_predictions_confidence_order_check check (
    confidence_low is null or confidence_high is null or confidence_low <= confidence_high
  ),
  constraint lead_scoring_predictions_band_check check (confidence_band in ('unknown','low','medium','high'))
);

create index if not exists idx_lead_scoring_predictions_lead_generated
  on public.lead_scoring_predictions (organization_id, lead_id, generated_at desc);

alter table public.lead_scoring_model_versions enable row level security;
alter table public.lead_scoring_feature_snapshots enable row level security;
alter table public.lead_scoring_predictions enable row level security;

revoke all on public.lead_scoring_model_versions from public, anon;
revoke all on public.lead_scoring_feature_snapshots from public, anon;
revoke all on public.lead_scoring_predictions from public, anon;
grant select on public.lead_scoring_model_versions to authenticated;
grant select on public.lead_scoring_feature_snapshots to authenticated;
grant select on public.lead_scoring_predictions to authenticated;
grant all on public.lead_scoring_model_versions to service_role;
grant all on public.lead_scoring_feature_snapshots to service_role;
grant all on public.lead_scoring_predictions to service_role;

drop policy if exists lead_scoring_model_versions_member_select on public.lead_scoring_model_versions;
create policy lead_scoring_model_versions_member_select
  on public.lead_scoring_model_versions for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists lead_scoring_feature_snapshots_member_select on public.lead_scoring_feature_snapshots;
create policy lead_scoring_feature_snapshots_member_select
  on public.lead_scoring_feature_snapshots for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists lead_scoring_predictions_member_select on public.lead_scoring_predictions;
create policy lead_scoring_predictions_member_select
  on public.lead_scoring_predictions for select to authenticated
  using (public.is_organization_member(organization_id));

create or replace view public.v_r10_smart_lead_scoring_v1
with (security_invoker = true)
as
with latest_prediction as (
  select distinct on (p.organization_id, p.lead_id)
    p.organization_id,
    p.lead_id,
    p.id as prediction_id,
    p.model_version_id,
    p.probability,
    p.confidence_low,
    p.confidence_high,
    p.confidence_band,
    p.explanation,
    p.generated_at,
    p.expires_at
  from public.lead_scoring_predictions p
  join public.lead_scoring_model_versions m
    on m.id = p.model_version_id
   and m.organization_id = p.organization_id
   and m.status = 'active'
  where p.score_type = 'conversion_probability'
    and (p.expires_at is null or p.expires_at > now())
  order by p.organization_id, p.lead_id, p.generated_at desc, p.id desc
)
select
  s.organization_id,
  s.lead_id,
  s.lead_code,
  s.lead_name,
  s.current_stage,
  s.lead_status,
  s.stored_intent,
  s.derived_intent,
  s.intent_confidence,
  s.intent_basis,
  s.engagement_score,
  s.behaviour_temperature,
  s.high_intent_events_7d,
  s.whatsapp_clicks_7d,
  s.reservation_starts_7d,
  s.payment_starts_7d,
  s.enquiry_clicks_7d,
  s.brochure_downloads_7d,
  s.sessions_7d,
  s.page_views_7d,
  s.days_since_last_visit,
  s.has_returned_after_becoming_lead,
  s.is_reengaged,
  s.payment_status,
  s.net_paid,
  s.outstanding_balance,
  s.priority_score as operational_priority_score,
  s.priority_band as operational_priority_band,
  s.priority_reason as operational_priority_reason,
  s.next_action_code,
  s.next_best_action,
  r.predictive_readiness_status,
  r.prediction_generation_allowed,
  case
    when r.prediction_generation_allowed is true and lp.prediction_id is not null then 'predictive'
    when r.prediction_generation_allowed is true then 'awaiting_prediction'
    else 'deterministic_guarded'
  end as scoring_mode,
  case
    when r.prediction_generation_allowed is true and lp.prediction_id is not null
      then round((lp.probability * 100)::numeric, 1)
    else s.priority_score::numeric
  end as smart_rank_score,
  case
    when r.prediction_generation_allowed is true and lp.prediction_id is not null
      then round((lp.probability * 100)::numeric, 1)
    else null
  end as conversion_probability_pct,
  case
    when r.prediction_generation_allowed is true and lp.prediction_id is not null then true
    else false
  end as smart_score_is_probability,
  lp.confidence_band as predictive_confidence_band,
  case when lp.confidence_low is not null then round((lp.confidence_low * 100)::numeric, 1) end as probability_low_pct,
  case when lp.confidence_high is not null then round((lp.confidence_high * 100)::numeric, 1) end as probability_high_pct,
  lp.explanation as predictive_explanation,
  lp.generated_at as prediction_generated_at,
  lp.expires_at as prediction_expires_at,
  case
    when r.prediction_generation_allowed is not true then r.readiness_reason
    when lp.prediction_id is null then 'Predictive generation is allowed but no current active-model prediction exists for this lead.'
    else 'Prediction generated from an active trained model and exposed separately from the operational priority score.'
  end as scoring_reason,
  s.owner_user_id,
  s.lead_created_at,
  s.last_contacted_at,
  s.last_inbound_at,
  s.last_outbound_at,
  s.next_followup_at
from public.v_lead_sales_intelligence s
left join public.v_r10_predictive_readiness_v1 r
  on r.organization_id = s.organization_id
left join latest_prediction lp
  on lp.organization_id = s.organization_id
 and lp.lead_id = s.lead_id;

comment on table public.lead_scoring_feature_snapshots is
  'R10 point-in-time feature history for predictive lead scoring. Historical snapshots prevent training on future information and support reproducible backtesting.';
comment on table public.lead_scoring_model_versions is
  'R10 tenant-scoped predictive model registry. Only validated models may be marked active.';
comment on table public.lead_scoring_predictions is
  'R10 append-only predictive lead score outputs. Probabilities are only surfaced through the smart scoring view when tenant predictive-readiness permits them.';
comment on view public.v_r10_smart_lead_scoring_v1 is
  'R10 smart lead scoring contract. Keeps deterministic operational priority separate from learned conversion probability and refuses to present fallback scores as probabilities.';

revoke all on public.v_r10_smart_lead_scoring_v1 from public, anon;
grant select on public.v_r10_smart_lead_scoring_v1 to authenticated, service_role;