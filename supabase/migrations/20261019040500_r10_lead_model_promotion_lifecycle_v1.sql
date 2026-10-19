create table if not exists public.lead_scoring_model_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_version_id uuid not null references public.lead_scoring_model_versions(id) on delete cascade,
  event_type text not null,
  previous_status text,
  new_status text,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  actor text not null default 'system',
  created_at timestamptz not null default now(),
  constraint lead_scoring_model_lifecycle_events_type_check check (
    event_type in ('promoted','retired','rejected','promotion_blocked')
  )
);

create index if not exists idx_lead_scoring_model_lifecycle_events_org_time
  on public.lead_scoring_model_lifecycle_events (organization_id, occurred_at desc);
create index if not exists idx_lead_scoring_model_lifecycle_events_model_time
  on public.lead_scoring_model_lifecycle_events (model_version_id, occurred_at desc);

alter table public.lead_scoring_model_lifecycle_events enable row level security;

revoke all on public.lead_scoring_model_lifecycle_events from public, anon;
grant select on public.lead_scoring_model_lifecycle_events to authenticated;
grant all on public.lead_scoring_model_lifecycle_events to service_role;

drop policy if exists lead_scoring_model_lifecycle_events_member_select
  on public.lead_scoring_model_lifecycle_events;
create policy lead_scoring_model_lifecycle_events_member_select
  on public.lead_scoring_model_lifecycle_events
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create or replace function public.promote_r10_lead_scoring_model_v1(
  p_model_version_id uuid,
  p_actor text default 'system_model_promoter'
)
returns table (
  promoted boolean,
  organization_id uuid,
  model_version_id uuid,
  model_key text,
  version text,
  previous_active_model_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_readiness public.v_r10_lead_model_promotion_readiness_v1%rowtype;
  v_previous_active uuid;
begin
  select *
  into v_readiness
  from public.v_r10_lead_model_promotion_readiness_v1
  where model_version_id = p_model_version_id;

  if not found then
    raise exception 'Model version is not present in the R10 promotion-readiness view.';
  end if;

  if v_readiness.model_status <> 'candidate' then
    insert into public.lead_scoring_model_lifecycle_events (
      organization_id, model_version_id, event_type, previous_status, new_status,
      reason, evidence, actor
    ) values (
      v_readiness.organization_id,
      p_model_version_id,
      'promotion_blocked',
      v_readiness.model_status,
      v_readiness.model_status,
      'Only candidate models can be promoted.',
      jsonb_build_object(
        'promotion_reason', v_readiness.promotion_reason,
        'production_prediction_release_allowed', v_readiness.production_prediction_release_allowed
      ),
      p_actor
    );

    return query select false, v_readiness.organization_id, p_model_version_id,
      v_readiness.model_key, v_readiness.version, null::uuid,
      'Only candidate models can be promoted.'::text;
    return;
  end if;

  if v_readiness.model_promotion_allowed is not true then
    insert into public.lead_scoring_model_lifecycle_events (
      organization_id, model_version_id, event_type, previous_status, new_status,
      reason, evidence, actor
    ) values (
      v_readiness.organization_id,
      p_model_version_id,
      'promotion_blocked',
      'candidate',
      'candidate',
      v_readiness.promotion_reason,
      jsonb_build_object(
        'holdout_sample_count', v_readiness.holdout_sample_count,
        'holdout_positive_count', v_readiness.holdout_positive_count,
        'holdout_negative_count', v_readiness.holdout_negative_count,
        'roc_auc', v_readiness.roc_auc,
        'precision_score', v_readiness.precision_score,
        'recall_score', v_readiness.recall_score,
        'brier_score', v_readiness.brier_score,
        'expected_calibration_error', v_readiness.expected_calibration_error,
        'training_readiness_status', v_readiness.training_readiness_status,
        'production_prediction_release_allowed', v_readiness.production_prediction_release_allowed
      ),
      p_actor
    );

    return query select false, v_readiness.organization_id, p_model_version_id,
      v_readiness.model_key, v_readiness.version, null::uuid,
      v_readiness.promotion_reason;
    return;
  end if;

  select id
  into v_previous_active
  from public.lead_scoring_model_versions
  where organization_id = v_readiness.organization_id
    and model_key = v_readiness.model_key
    and status = 'active'
    and id <> p_model_version_id
  order by trained_at desc nulls last, created_at desc
  limit 1
  for update;

  if v_previous_active is not null then
    update public.lead_scoring_model_versions
    set status = 'retired',
        notes = concat_ws(' ', notes, 'Retired automatically when a validated successor model was promoted.')
    where id = v_previous_active;

    insert into public.lead_scoring_model_lifecycle_events (
      organization_id, model_version_id, event_type, previous_status, new_status,
      reason, evidence, actor
    ) values (
      v_readiness.organization_id,
      v_previous_active,
      'retired',
      'active',
      'retired',
      'Retired because a validated successor model was promoted.',
      jsonb_build_object('successor_model_version_id', p_model_version_id),
      p_actor
    );
  end if;

  update public.lead_scoring_model_versions
  set status = 'active',
      notes = concat_ws(' ', notes, 'Promoted to active after passing R10 production-readiness and holdout guardrails.')
  where id = p_model_version_id
    and status = 'candidate';

  if not found then
    raise exception 'Candidate model status changed during promotion; no activation was performed.';
  end if;

  insert into public.lead_scoring_model_lifecycle_events (
    organization_id, model_version_id, event_type, previous_status, new_status,
    reason, evidence, actor
  ) values (
    v_readiness.organization_id,
    p_model_version_id,
    'promoted',
    'candidate',
    'active',
    'Model passed the current R10 holdout-quality, calibration and predictive-readiness promotion guardrails.',
    jsonb_build_object(
      'holdout_sample_count', v_readiness.holdout_sample_count,
      'holdout_positive_count', v_readiness.holdout_positive_count,
      'holdout_negative_count', v_readiness.holdout_negative_count,
      'roc_auc', v_readiness.roc_auc,
      'precision_score', v_readiness.precision_score,
      'recall_score', v_readiness.recall_score,
      'f1_score', v_readiness.f1_score,
      'brier_score', v_readiness.brier_score,
      'expected_calibration_error', v_readiness.expected_calibration_error,
      'production_prediction_release_allowed', v_readiness.production_prediction_release_allowed,
      'previous_active_model_id', v_previous_active
    ),
    p_actor
  );

  return query select true, v_readiness.organization_id, p_model_version_id,
    v_readiness.model_key, v_readiness.version, v_previous_active,
    'Model promoted to active.'::text;
end;
$$;

revoke all on function public.promote_r10_lead_scoring_model_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.promote_r10_lead_scoring_model_v1(uuid, text) to service_role;

create or replace view public.v_r10_lead_model_lifecycle_v1
with (security_invoker = true)
as
select
  m.organization_id,
  m.id as model_version_id,
  m.model_key,
  m.version,
  m.status as model_status,
  m.trained_at,
  e.event_type as latest_lifecycle_event,
  e.occurred_at as latest_lifecycle_event_at,
  e.reason as latest_lifecycle_reason,
  e.evidence as latest_lifecycle_evidence,
  e.actor as latest_lifecycle_actor
from public.lead_scoring_model_versions m
left join lateral (
  select le.event_type, le.occurred_at, le.reason, le.evidence, le.actor
  from public.lead_scoring_model_lifecycle_events le
  where le.model_version_id = m.id
  order by le.occurred_at desc, le.id desc
  limit 1
) e on true;

comment on table public.lead_scoring_model_lifecycle_events is
  'R10 append-only audit trail for predictive lead-model promotion, retirement and blocked promotion attempts.';
comment on function public.promote_r10_lead_scoring_model_v1(uuid, text) is
  'R10 transactional model-promotion gate. Re-checks promotion readiness at execution time, retires an existing active model, activates only an eligible candidate, and records an append-only lifecycle audit.';
comment on view public.v_r10_lead_model_lifecycle_v1 is
  'R10 tenant-safe model lifecycle summary for operators and the Owner Command Center.';

revoke all on public.v_r10_lead_model_lifecycle_v1 from public, anon;
grant select on public.v_r10_lead_model_lifecycle_v1 to authenticated, service_role;
