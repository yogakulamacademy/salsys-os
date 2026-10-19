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
), active_model as (
  select organization_id, model_key, id as active_model_version_id
  from public.lead_scoring_model_versions
  where status = 'active'
), health as (
  select organization_id, model_key, retraining_recommended, health_status, health_reason
  from public.v_r10_lead_model_health_v1
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
    when lr.latest_training_run_status in ('completed','failed','cancelled')
      and lr.latest_training_requested_at > now() - interval '14 days' then false
    when am.active_model_version_id is null then true
    when coalesce(h.retraining_recommended, false) is true then true
    else false
  end as new_training_run_allowed,
  case
    when tr.candidate_model_training_allowed is not true then tr.training_readiness_reason
    when lr.latest_training_run_status in ('queued','running') then 'A candidate model training run is already queued or running for this organization.'
    when lr.latest_training_run_status in ('completed','failed','cancelled')
      and lr.latest_training_requested_at > now() - interval '14 days' then 'A substantive model training run was requested within the last 14 days; retraining cooldown is active.'
    when am.active_model_version_id is null then 'Dataset is ready and no active model exists; an initial candidate model may be trained.'
    when coalesce(h.retraining_recommended, false) is true then coalesce(h.health_reason, 'Active model health recommends retraining.')
    else coalesce(h.health_reason, 'The active model does not currently require retraining.')
  end as new_training_run_reason,
  now() as evaluated_at
from public.v_r10_lead_model_training_readiness_v1 tr
left join latest_run lr
  on lr.organization_id = tr.organization_id
 and lr.model_key = 'conversion_probability'
left join active_model am
  on am.organization_id = tr.organization_id
 and am.model_key = 'conversion_probability'
left join health h
  on h.organization_id = tr.organization_id
 and coalesce(h.model_key, 'conversion_probability') = 'conversion_probability';

comment on view public.v_r10_lead_training_run_readiness_v1 is
  'R10 candidate-training execution gate. Initial training requires dataset readiness; retraining additionally requires active-model health to recommend it, no concurrent run, and a 14-day substantive-run cooldown.';

revoke all on public.v_r10_lead_training_run_readiness_v1 from public, anon;
grant select on public.v_r10_lead_training_run_readiness_v1 to authenticated, service_role;

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
  v_successor public.v_r10_lead_model_successor_readiness_v1%rowtype;
  v_previous_active uuid;
  v_block_reason text;
begin
  select *
  into v_readiness
  from public.v_r10_lead_model_promotion_readiness_v1
  where model_version_id = p_model_version_id;

  if not found then
    raise exception 'Model version is not present in the R10 promotion-readiness view.';
  end if;

  if v_readiness.model_status <> 'candidate' then
    v_block_reason := 'Only candidate models can be promoted.';
  elsif v_readiness.model_promotion_allowed is not true then
    v_block_reason := v_readiness.promotion_reason;
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

  if v_block_reason is null and v_previous_active is not null then
    select *
    into v_successor
    from public.v_r10_lead_model_successor_readiness_v1
    where candidate_model_version_id = p_model_version_id;

    if not found then
      v_block_reason := 'A current incumbent exists, but successor-comparison readiness is unavailable.';
    elsif v_successor.successor_promotion_allowed is not true then
      v_block_reason := v_successor.successor_promotion_reason;
    end if;
  end if;

  if v_block_reason is not null then
    insert into public.lead_scoring_model_lifecycle_events (
      organization_id, model_version_id, event_type, previous_status, new_status,
      reason, evidence, actor
    ) values (
      v_readiness.organization_id,
      p_model_version_id,
      'promotion_blocked',
      v_readiness.model_status,
      v_readiness.model_status,
      v_block_reason,
      jsonb_build_object(
        'base_promotion_allowed', v_readiness.model_promotion_allowed,
        'base_promotion_reason', v_readiness.promotion_reason,
        'production_prediction_release_allowed', v_readiness.production_prediction_release_allowed,
        'incumbent_model_version_id', v_previous_active,
        'successor_promotion_allowed', case when v_previous_active is null then null else v_successor.successor_promotion_allowed end,
        'successor_promotion_reason', case when v_previous_active is null then null else v_successor.successor_promotion_reason end
      ),
      p_actor
    );

    return query select false, v_readiness.organization_id, p_model_version_id,
      v_readiness.model_key, v_readiness.version, v_previous_active, v_block_reason;
    return;
  end if;

  if v_previous_active is not null then
    update public.lead_scoring_model_versions
    set status = 'retired',
        notes = concat_ws(' ', notes, 'Retired automatically when a validated non-inferior successor model was promoted.')
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
      'Retired because a validated successor model passed shared realized-outcome comparison guardrails.',
      jsonb_build_object('successor_model_version_id', p_model_version_id),
      p_actor
    );
  end if;

  update public.lead_scoring_model_versions
  set status = 'active',
      notes = concat_ws(' ', notes, case
        when v_previous_active is null then 'Promoted to active after passing R10 production-readiness and holdout guardrails.'
        else 'Promoted to active after passing R10 base guardrails and incumbent shared-evidence successor guardrails.'
      end)
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
    case
      when v_previous_active is null then 'Initial model passed R10 holdout-quality, calibration and predictive-readiness promotion guardrails.'
      else 'Successor model passed R10 base guardrails and shared realized-outcome non-inferiority guardrails against the active incumbent.'
    end,
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
      'previous_active_model_id', v_previous_active,
      'successor_comparison_result', case when v_previous_active is null then null else v_successor.comparison_result end,
      'successor_shared_lead_count', case when v_previous_active is null then null else v_successor.shared_lead_count end
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

comment on function public.promote_r10_lead_scoring_model_v1(uuid, text) is
  'R10 transactional promotion gate. Initial candidates require base holdout/readiness guardrails; replacing an active incumbent additionally requires shared realized-outcome successor non-inferiority evidence.';
