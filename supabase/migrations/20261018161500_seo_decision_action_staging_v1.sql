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
  v_action public.seo_optimization_actions%rowtype;
  v_executor text := 'manual';
begin
  if p_organization_id is null or p_page_id is null then
    raise exception 'organization_id and page_id are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('seo-decision-action:' || p_organization_id::text || ':' || p_page_id::text,0)
  );

  select * into v_candidate
  from public.v_seo_decision_candidates_v1 v
  where v.organization_id=p_organization_id
    and v.page_id=p_page_id
  limit 1;

  if v_candidate.page_id is null then
    return jsonb_build_object('ok',false,'reason','decision_candidate_not_found');
  end if;

  select a.* into v_existing
  from public.seo_optimization_actions a
  where a.organization_id=p_organization_id
    and a.target_page_id=p_page_id
    and a.source_layer='decision_intelligence_v1'
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
      'reason','existing_open_decision_action',
      'approval_status',v_existing.approval_status,
      'execution_status',v_existing.execution_status
    );
  end if;

  if v_candidate.recommended_action_kind in ('metadata_edit','schema_update') then
    v_executor := 'manual';
  elsif v_candidate.recommended_action_kind in ('content_edit','internal_link','technical','other') then
    v_executor := 'manual';
  end if;

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
    null,
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
      'decision_version','v1'
    ),
    v_candidate.risk_level,
    v_executor,
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
    'approval_status',v_action.approval_status,
    'execution_status',v_action.execution_status,
    'execution_gate',v_action.execution_gate,
    'automatic_publish_enabled',v_action.automatic_publish_enabled,
    'priority_score',v_candidate.decision_priority_score
  );
end;
$$;

revoke all on function public.stage_seo_decision_action_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.stage_seo_decision_action_v1(uuid,uuid,uuid) to service_role;

commit;
