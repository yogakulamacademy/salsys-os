begin;

create table if not exists public.seo_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid not null references public.seo_experiments(id) on delete cascade,
  action_id uuid references public.seo_optimization_actions(id) on delete set null,
  page_id uuid references public.seo_pages(id) on delete set null,
  model text not null default 'observed_funnel_scenario_v1',
  scenario_name text not null default 'base' check (scenario_name in ('low','base','high')),
  confidence text not null check (confidence in ('low','medium','high')),
  predicted_effect_pct numeric not null,
  predicted_incremental_clicks numeric,
  predicted_incremental_leads numeric,
  predicted_incremental_revenue_inr numeric,
  predicted_incremental_revenue_usd numeric,
  forecast_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, experiment_id)
);

create index if not exists seo_forecast_snapshots_org_captured_idx
  on public.seo_forecast_snapshots (organization_id, captured_at desc);

alter table public.seo_forecast_snapshots enable row level security;

revoke all on public.seo_forecast_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.seo_forecast_snapshots to service_role;

create or replace view public.v_seo_forecast_calibration_v1
with (security_invoker=true)
as
select
  s.organization_id,
  count(*)::integer as forecast_snapshots,
  count(le.id)::integer as evaluated_snapshots,
  count(le.id) filter (
    where (s.predicted_effect_pct >= 0 and le.normalized_effect_pct >= 0)
       or (s.predicted_effect_pct < 0 and le.normalized_effect_pct < 0)
  )::integer as direction_correct,
  round(avg(abs(le.normalized_effect_pct - s.predicted_effect_pct)) filter (where le.id is not null), 2) as mean_absolute_error_pct,
  round(avg(le.normalized_effect_pct - s.predicted_effect_pct) filter (where le.id is not null), 2) as mean_signed_error_pct,
  round(avg(s.predicted_effect_pct) filter (where le.id is not null), 2) as mean_predicted_effect_pct,
  round(avg(le.normalized_effect_pct) filter (where le.id is not null), 2) as mean_actual_effect_pct,
  count(*) filter (where s.confidence='low')::integer as low_confidence_snapshots,
  count(*) filter (where s.confidence='medium')::integer as medium_confidence_snapshots,
  count(*) filter (where s.confidence='high')::integer as high_confidence_snapshots,
  max(le.evaluated_at) as last_evaluated_at
from public.seo_forecast_snapshots s
left join public.seo_experiment_learning_events le
  on le.organization_id=s.organization_id
 and le.experiment_id=s.experiment_id
group by s.organization_id;

revoke all on public.v_seo_forecast_calibration_v1 from public, anon, authenticated;
grant select on public.v_seo_forecast_calibration_v1 to service_role;

commit;
