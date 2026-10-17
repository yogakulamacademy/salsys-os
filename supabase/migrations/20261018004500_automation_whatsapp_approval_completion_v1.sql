begin;

create or replace function public.complete_whatsapp_send_approval_v1(
  p_organization_id uuid,
  p_approval_request_id uuid,
  p_provider_send_audit_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_now,now());
  v_request public.automation_approval_requests%rowtype;
  v_enrollment public.automation_enrollments%rowtype;
  v_audit public.automation_provider_send_audits%rowtype;
  v_edge public.automation_flow_edges%rowtype;
  v_target public.automation_flow_nodes%rowtype;
  v_edge_count integer := 0;
  v_wait_id uuid;
  v_job_id uuid;
  v_next_at timestamptz;
  v_timeout_minutes integer;
  v_delay_minutes integer;
  v_dedupe_key text;
begin
  if p_organization_id is null or p_approval_request_id is null or p_provider_send_audit_id is null then
    return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','organization_id, approval_request_id and provider_send_audit_id are required');
  end if;

  select * into v_request
  from public.automation_approval_requests ar
  where ar.id=p_approval_request_id and ar.organization_id=p_organization_id
  for update;

  if v_request.id is null then
    return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','approval_request_not_found');
  end if;

  if v_request.status <> 'approved' then
    return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','approval_not_approved');
  end if;

  select * into v_audit
  from public.automation_provider_send_audits a
  where a.id=p_provider_send_audit_id
    and a.organization_id=p_organization_id
    and a.approval_request_id=v_request.id
    and a.workflow_id=v_request.workflow_id
    and a.enrollment_id=v_request.enrollment_id
    and a.lead_id=v_request.lead_id
  for update;

  if v_audit.id is null then
    return jsonb_build_object('ok',false,'customer_message_sent',false,'reason','provider_send_audit_mismatch');
  end if;

  if v_audit.status <> 'sent' or v_audit.customer_message_sent is not true or v_audit.provider_message_id is null then
    return jsonb_build_object('ok',true,'completed',false,'customer_message_sent',v_audit.customer_message_sent,'reason','provider_send_not_confirmed');
  end if;

  select * into v_enrollment
  from public.automation_enrollments e
  where e.id=v_request.enrollment_id
    and e.organization_id=p_organization_id
    and e.workflow_id=v_request.workflow_id
    and e.lead_id=v_request.lead_id
  for update;

  if v_enrollment.id is null then
    return jsonb_build_object('ok',false,'customer_message_sent',true,'reason','enrollment_not_found_after_send');
  end if;

  if v_enrollment.current_node_id is distinct from v_request.node_id then
    if coalesce(v_enrollment.metadata->>'completed_approval_request_id','') = v_request.id::text then
      return jsonb_build_object(
        'ok',true,'completed',true,'idempotent_reuse',true,
        'approval_request_id',v_request.id,'audit_id',v_audit.id,
        'enrollment_id',v_enrollment.id,'enrollment_status',v_enrollment.status,
        'current_node_id',v_enrollment.current_node_id,'customer_message_sent',true
      );
    end if;
    return jsonb_build_object('ok',false,'completed',false,'customer_message_sent',true,'reason','enrollment_moved_from_approval_node');
  end if;

  if v_enrollment.flow_version <> v_request.flow_version then
    return jsonb_build_object('ok',false,'completed',false,'customer_message_sent',true,'reason','enrollment_flow_version_mismatch');
  end if;

  if not exists (
    select 1 from public.automation_flow_versions fv
    where fv.organization_id=p_organization_id
      and fv.workflow_id=v_request.workflow_id
      and fv.version_number=v_request.flow_version
      and fv.status='published'
  ) then
    return jsonb_build_object('ok',false,'completed',false,'customer_message_sent',true,'reason','flow_version_not_published');
  end if;

  select count(*) into v_edge_count
  from public.automation_flow_edges e
  where e.organization_id=p_organization_id
    and e.workflow_id=v_request.workflow_id
    and e.version_number=v_request.flow_version
    and e.source_node_id=v_request.node_id;

  if v_edge_count <> 1 then
    return jsonb_build_object('ok',false,'completed',false,'customer_message_sent',true,'reason','send_action_requires_exactly_one_outgoing_edge','edge_count',v_edge_count);
  end if;

  select * into v_edge
  from public.automation_flow_edges e
  where e.organization_id=p_organization_id
    and e.workflow_id=v_request.workflow_id
    and e.version_number=v_request.flow_version
    and e.source_node_id=v_request.node_id
  order by e.priority asc,e.created_at asc
  limit 1;

  select * into v_target
  from public.automation_flow_nodes n
  where n.id=v_edge.target_node_id
    and n.organization_id=p_organization_id
    and n.workflow_id=v_request.workflow_id
    and n.version_number=v_request.flow_version
    and n.enabled=true;

  if v_target.id is null then
    return jsonb_build_object('ok',false,'completed',false,'customer_message_sent',true,'reason','target_node_missing_or_disabled');
  end if;

  if v_target.node_type='end' then
    update public.automation_enrollments
    set status='completed',
        current_node_id=v_target.id,
        next_action_at=null,
        last_event_at=v_now,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'current_node_key',v_target.node_key,
          'current_node_type',v_target.node_type,
          'completed_approval_request_id',v_request.id,
          'provider_send_audit_id',v_audit.id,
          'provider_message_id',v_audit.provider_message_id,
          'customer_message_sent',true,
          'worker','human_approval_runtime_v1'
        )
    where id=v_enrollment.id and organization_id=p_organization_id and current_node_id=v_request.node_id;

  elsif v_target.node_type='wait_for_reply' then
    v_timeout_minutes := greatest(1,least(coalesce(nullif((v_target.config->>'timeout_minutes')::integer,0),60),10080));
    v_next_at := v_now + make_interval(mins=>v_timeout_minutes);

    insert into public.automation_wait_states (
      organization_id,workflow_id,enrollment_id,lead_id,wait_type,status,waiting_since,timeout_at,metadata
    ) values (
      p_organization_id,v_request.workflow_id,v_enrollment.id,v_enrollment.lead_id,'reply','waiting',v_now,v_next_at,
      jsonb_build_object(
        'worker','human_approval_runtime_v1',
        'flow_version',v_request.flow_version,
        'node_id',v_target.id,
        'node_key',v_target.node_key,
        'stop_on_reply',coalesce((v_target.config->>'stop_on_reply')::boolean,true),
        'timeout_minutes',v_timeout_minutes,
        'approval_request_id',v_request.id,
        'provider_send_audit_id',v_audit.id,
        'customer_message_sent',true
      )
    ) returning id into v_wait_id;

    v_dedupe_key := 'approval-v1:reply-timeout:'||v_request.id::text||':v'||v_request.flow_version::text;
    insert into public.automation_scheduled_jobs (
      organization_id,workflow_id,enrollment_id,wait_state_id,lead_id,job_type,status,scheduled_for,max_attempts,dedupe_key,payload
    ) values (
      p_organization_id,v_request.workflow_id,v_enrollment.id,v_wait_id,v_enrollment.lead_id,'resume_reply_timeout','scheduled',v_next_at,3,v_dedupe_key,
      jsonb_build_object(
        'worker','human_approval_runtime_v1',
        'flow_version',v_request.flow_version,
        'node_id',v_target.id,
        'node_key',v_target.node_key,
        'approval_request_id',v_request.id,
        'provider_send_audit_id',v_audit.id,
        'customer_message_sent',true
      )
    ) returning id into v_job_id;

    update public.automation_enrollments
    set status='active',
        current_node_id=v_target.id,
        next_action_at=v_next_at,
        last_event_at=v_now,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'current_node_key',v_target.node_key,
          'current_node_type',v_target.node_type,
          'completed_approval_request_id',v_request.id,
          'provider_send_audit_id',v_audit.id,
          'provider_message_id',v_audit.provider_message_id,
          'wait_state_id',v_wait_id,
          'scheduled_job_id',v_job_id,
          'customer_message_sent',true,
          'worker','human_approval_runtime_v1'
        )
    where id=v_enrollment.id and organization_id=p_organization_id and current_node_id=v_request.node_id;

  elsif v_target.node_type='wait' then
    v_delay_minutes := greatest(1,least(coalesce(nullif((v_target.config->>'delay_minutes')::integer,0),10),10080));
    v_next_at := v_now + make_interval(mins=>v_delay_minutes);

    insert into public.automation_wait_states (
      organization_id,workflow_id,enrollment_id,lead_id,wait_type,status,waiting_since,resume_at,metadata
    ) values (
      p_organization_id,v_request.workflow_id,v_enrollment.id,v_enrollment.lead_id,'delay','waiting',v_now,v_next_at,
      jsonb_build_object(
        'worker','human_approval_runtime_v1',
        'flow_version',v_request.flow_version,
        'node_id',v_target.id,
        'node_key',v_target.node_key,
        'delay_minutes',v_delay_minutes,
        'approval_request_id',v_request.id,
        'provider_send_audit_id',v_audit.id,
        'customer_message_sent',true
      )
    ) returning id into v_wait_id;

    v_dedupe_key := 'approval-v1:resume-wait:'||v_request.id::text||':v'||v_request.flow_version::text;
    insert into public.automation_scheduled_jobs (
      organization_id,workflow_id,enrollment_id,wait_state_id,lead_id,job_type,status,scheduled_for,max_attempts,dedupe_key,payload
    ) values (
      p_organization_id,v_request.workflow_id,v_enrollment.id,v_wait_id,v_enrollment.lead_id,'resume_wait','scheduled',v_next_at,3,v_dedupe_key,
      jsonb_build_object(
        'worker','human_approval_runtime_v1',
        'flow_version',v_request.flow_version,
        'node_id',v_target.id,
        'node_key',v_target.node_key,
        'approval_request_id',v_request.id,
        'provider_send_audit_id',v_audit.id,
        'customer_message_sent',true
      )
    ) returning id into v_job_id;

    update public.automation_enrollments
    set status='active',
        current_node_id=v_target.id,
        next_action_at=v_next_at,
        last_event_at=v_now,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'current_node_key',v_target.node_key,
          'current_node_type',v_target.node_type,
          'completed_approval_request_id',v_request.id,
          'provider_send_audit_id',v_audit.id,
          'provider_message_id',v_audit.provider_message_id,
          'wait_state_id',v_wait_id,
          'scheduled_job_id',v_job_id,
          'customer_message_sent',true,
          'worker','human_approval_runtime_v1'
        )
    where id=v_enrollment.id and organization_id=p_organization_id and current_node_id=v_request.node_id;

  else
    return jsonb_build_object(
      'ok',false,'completed',false,'customer_message_sent',true,
      'reason','unsupported_post_send_target_type','target_node_type',v_target.node_type,'target_node_id',v_target.id
    );
  end if;

  update public.automation_approval_requests
  set updated_at=v_now,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'execution_completed_at',v_now,
        'provider_send_audit_id',v_audit.id,
        'provider_message_id',v_audit.provider_message_id,
        'target_node_id',v_target.id,
        'target_node_key',v_target.node_key,
        'target_node_type',v_target.node_type,
        'customer_message_sent',true
      )
  where id=v_request.id and organization_id=p_organization_id;

  return jsonb_build_object(
    'ok',true,'completed',true,'idempotent_reuse',false,
    'approval_request_id',v_request.id,'audit_id',v_audit.id,'enrollment_id',v_enrollment.id,
    'target_node_id',v_target.id,'target_node_key',v_target.node_key,'target_node_type',v_target.node_type,
    'wait_state_id',v_wait_id,'scheduled_job_id',v_job_id,'next_action_at',v_next_at,
    'customer_message_sent',true
  );
end;
$$;

revoke all on function public.complete_whatsapp_send_approval_v1(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.complete_whatsapp_send_approval_v1(uuid,uuid,uuid,timestamptz) to service_role;

commit;
