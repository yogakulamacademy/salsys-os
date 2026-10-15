-- OG9 v3: include the latest audit events in the optimization workspace payload.

create or replace function public.get_seo_optimization_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare v_payload jsonb;
begin
  if p_organization_id is null or not public.is_organization_member(p_organization_id) then raise exception 'Not authorized for organization'; end if;

  select jsonb_build_object(
    'summary',jsonb_build_object(
      'total_actions',count(*),
      'pending_approval',count(*) filter (where approval_status='pending'),
      'approved_actions',count(*) filter (where approval_status='approved'),
      'rejected_actions',count(*) filter (where approval_status='rejected'),
      'ready_actions',count(*) filter (where execution_status='ready'),
      'running_actions',count(*) filter (where execution_status in ('queued','running')),
      'applied_actions',count(*) filter (where execution_status='applied'),
      'failed_actions',count(*) filter (where execution_status='failed'),
      'rolled_back_actions',count(*) filter (where execution_status='rolled_back'),
      'automatic_publish_enabled',count(*) filter (where automatic_publish_enabled)
    ),
    'actions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id,experiment_id,target_page_id,target_url,source_layer,source_action,
               action_kind,proposal,risk_level,executor_kind,execution_gate,
               automatic_publish_enabled,reversible,approval_status,approval_note,
               approved_at,rejected_at,execution_status,last_error,applied_at,
               rolled_back_at,created_at,updated_at
        from public.seo_optimization_actions
        where organization_id=p_organization_id order by created_at desc limit 60
      ) x
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id,action_id,event_type,actor_kind,event_payload,created_at
        from public.seo_optimization_action_events
        where organization_id=p_organization_id order by created_at desc limit 120
      ) x
    ),'[]'::jsonb),
    'guardrails',jsonb_build_object(
      'human_approval_required',true,
      'automatic_publish_enabled',false,
      'tenant_scoped',true,
      'reversible_actions_expected',true,
      'direct_authenticated_writes_enabled',false,
      'baseline_required_before_execution',true
    )
  ) into v_payload
  from public.seo_optimization_actions where organization_id=p_organization_id;

  return coalesce(v_payload,jsonb_build_object(
    'summary',jsonb_build_object('total_actions',0,'pending_approval',0,'approved_actions',0,'rejected_actions',0,'ready_actions',0,'running_actions',0,'applied_actions',0,'failed_actions',0,'rolled_back_actions',0,'automatic_publish_enabled',0),
    'actions','[]'::jsonb,
    'events','[]'::jsonb,
    'guardrails',jsonb_build_object('human_approval_required',true,'automatic_publish_enabled',false,'tenant_scoped',true,'reversible_actions_expected',true,'direct_authenticated_writes_enabled',false,'baseline_required_before_execution',true)
  ));
end;
$$;
