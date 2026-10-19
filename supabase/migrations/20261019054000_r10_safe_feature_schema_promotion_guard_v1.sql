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
  v_model_feature_schema jsonb;
  v_model_feature_schema_version text;
  v_expected_feature_schema constant jsonb := '["engagement_score","high_intent_events_7d","whatsapp_clicks_7d","reservation_starts_7d","enquiry_clicks_7d","brochure_downloads_7d","sessions_7d","page_views_7d","days_since_last_visit","has_returned_after_becoming_lead","is_reengaged","owner_assigned","lead_age_hours","hours_since_last_contact","hours_since_last_inbound","followup_due"]'::jsonb;
begin
  select *
  into v_readiness
  from public.v_r10_lead_model_promotion_readiness_v1
  where model_version_id = p_model_version_id;

  if not found then
    raise exception 'Model version is not present in the R10 promotion-readiness view.';
  end if;

  select
    m.feature_schema,
    m.metrics -> 'artifact' ->> 'feature_schema_version'
  into
    v_model_feature_schema,
    v_model_feature_schema_version
  from public.lead_scoring_model_versions m
  where m.id = p_model_version_id
  for update;

  if not found then
    raise exception 'Model version no longer exists.';
  end if;

  if v_model_feature_schema_version is distinct from 'r10-lead-features-safe-v1'
     or v_model_feature_schema is distinct from v_expected_feature_schema then
    v_block_reason := 'Candidate model does not use the approved R10 leakage-reduced feature schema.';
  elsif v_readiness.model_status <> 'candidate' then
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
        'feature_schema_version', v_model_feature_schema_version,
        'approved_feature_schema_version', 'r10-lead-features-safe-v1',
        'feature_schema_matches', v_model_feature_schema = v_expected_feature_schema,
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
        when v_previous_active is null then 'Promoted to active after passing R10 production-readiness, safe-feature-schema and holdout guardrails.'
        else 'Promoted to active after passing R10 safe-feature-schema, base guardrails and incumbent shared-evidence successor guardrails.'
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
      when v_previous_active is null then 'Initial model passed R10 safe-feature-schema, holdout-quality, calibration and predictive-readiness promotion guardrails.'
      else 'Successor model passed R10 safe-feature-schema, base guardrails and shared realized-outcome non-inferiority guardrails against the active incumbent.'
    end,
    jsonb_build_object(
      'feature_schema_version', v_model_feature_schema_version,
      'feature_schema_matches', true,
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
  'R10 transactional promotion gate. Candidates must use the approved leakage-reduced feature schema; initial models also require base holdout/readiness guardrails, while replacements additionally require shared realized-outcome successor non-inferiority evidence.';
