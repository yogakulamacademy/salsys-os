begin;

create or replace function public.stage_seo_decision_action_v1(
  p_organization_id uuid,
  p_page_id uuid,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_candidate record;
  v_existing public.seo_optimization_actions%rowtype;
  v_experiment public.seo_experiments%rowtype;
  v_action public.seo_optimization_actions%rowtype;
  v_primary_metric text := 'gsc_clicks';
begin
  if p_organization_id is null or p_page_id is null then
    raise exception 'organization_id and page_id are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('seo-decision-action:' || p_organization_id::text || ':' || p_page_id::text,0)
  );

  select a.* into v_existing
  from public.seo_optimization_actions a
  where a.organization_id=p_organization_id
    and a.target_page_id=p_page_id
    and (
      a.approval_status='pending'
      or a.execution_status in ('ready','queued','running')
    )
  order by a.created_at desc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok',true,
      'created',false,
      'action_id',v_existing.id,
      'experiment_id',v_existing.experiment_id,
      'reason','existing_open_action_for_page',
      'approval_status',v_existing.approval_status,
      'execution_status',v_existing.execution_status
    );
  end if;

  select * into v_candidate
  from public.v_seo_decision_candidates_v1 v
  where v.organization_id=p_organization_id
    and v.page_id=p_page_id
  limit 1;

  if v_candidate.page_id is null then
    return jsonb_build_object('ok',false,'reason','decision_candidate_not_found');
  end if;

  v_primary_metric := case
    when v_candidate.recommended_action_kind='metadata_edit' then 'gsc_ctr'
    when v_candidate.recommended_action_kind='technical' then 'gsc_impressions'
    else 'gsc_clicks'
  end;

  insert into public.seo_experiments(
    organization_id,
    title,
    hypothesis,
    target_kind,
    target_page_id,
    target_url,
    source_layer,
    source_action,
    source_reference,
    primary_metric,
    secondary_metrics,
    status,
    minimum_observation_days,
    created_by
  )
  values(
    p_organization_id,
    left('Decision V1: ' || v_candidate.decision_title,500),
    left(
      'If we apply the recommended ' || v_candidate.recommended_action_kind ||
      ' improvement to this page, the selected SEO outcome should improve because ' ||
      v_candidate.decision_reason,
      2000
    ),
    'page',
    p_page_id,
    v_candidate.normalized_url,
    'decision_intelligence_v1',
    'next_best_action',
    jsonb_build_object(
      'decision_version','v1',
      'priority_score',v_candidate.decision_priority_score,
      'risk_level',v_candidate.risk_level,
      'evidence',v_candidate.evidence,
      'evaluated_at',v_candidate.evaluated_at
    ),
    v_primary_metric,
    array['gsc_clicks','gsc_impressions','organic_leads']::text[],
    'draft',
    14,
    p_created_by
  )
  returning * into v_experiment;

  insert into public.seo_optimization_actions(
    organization_id,
    experiment_id,
    target_page_id,
    target_url,
    source_layer,
    source_action,
    action_kind,
    proposal,
    risk_level,
    executor_kind,
    execution_gate,
    automatic_publish_enabled,
    reversible,
    approval_status,
    execution_status,
    created_by
  )
  values(
    p_organization_id,
    v_experiment.id,
    p_page_id,
    v_candidate.normalized_url,
    'decision_intelligence_v1',
    'next_best_action',
    v_candidate.recommended_action_kind,
    jsonb_build_object(
      'title',v_candidate.decision_title,
      'reason',v_candidate.decision_reason,
      'priority_score',v_candidate.decision_priority_score,
      'evidence',v_candidate.evidence,
      'evaluated_at',v_candidate.evaluated_at,
      'decision_version','v1',
      'experiment_id',v_experiment.id
    ),
    v_candidate.risk_level,
    'manual',
    'human_approved',
    false,
    true,
    'pending',
    'blocked',
    p_created_by
  )
  returning * into v_action;

  return jsonb_build_object(
    'ok',true,
    'created',true,
    'action_id',v_action.id,
    'experiment_id',v_experiment.id,
    'experiment_status',v_experiment.status,
    'approval_status',v_action.approval_status,
    'execution_status',v_action.execution_status,
    'execution_gate',v_action.execution_gate,
    'automatic_publish_enabled',v_action.automatic_publish_enabled,
    'priority_score',v_candidate.decision_priority_score,
    'primary_metric',v_primary_metric
  );
end;
$$;

revoke all on function public.stage_seo_decision_action_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.stage_seo_decision_action_v1(uuid,uuid,uuid) to service_role;

commit;
