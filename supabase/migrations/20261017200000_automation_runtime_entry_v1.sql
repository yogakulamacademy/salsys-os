-- SalsysOS automatic published-flow runtime entry V1.
--
-- Purpose:
--   When the canonical event dispatcher creates an automatic enrollment on a
--   published trigger node, advance exactly one safe step into wait_for_reply.
--
-- Safety:
--   * only automatic_event_dispatch_v1 enrollments are eligible
--   * workflow must still be active with runtime_flow_enabled = true
--   * enrollment must be pinned to an immutable published version
--   * current node must be an enabled trigger with exactly one outgoing edge
--   * V1 target must be wait_for_reply; no action/send node can execute here
--   * creates only a reply wait state + timeout job
--   * customer_message_sent remains false
--   * scheduler/customer sending are not enabled by this migration
--   * unexpected entry errors are recorded on enrollment metadata and fail closed

create or replace function public.enter_automatic_enrollment_runtime_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_workflow public.automation_workflows%rowtype;
  v_version_status text;
  v_current_node public.automation_flow_nodes%rowtype;
  v_edge record;
  v_edge_count integer := 0;
  v_target_node public.automation_flow_nodes%rowtype;
  v_timeout_minutes integer := 60;
  v_timeout_at timestamptz;
  v_wait_id uuid;
  v_job_id uuid;
  v_dedupe_key text;
begin
  -- Never touch manually pinned/test/legacy enrollments.
  if coalesce(new.metadata ->> 'source', '') <> 'automatic_event_dispatch_v1' then
    return new;
  end if;

  if new.status <> 'active' or new.current_node_id is null then
    return new;
  end if;

  select *
  into v_workflow
  from public.automation_workflows w
  where w.organization_id = new.organization_id
    and w.id = new.workflow_id;

  if not found
     or v_workflow.status <> 'active'
     or v_workflow.runtime_flow_enabled is distinct from true then
    return new;
  end if;

  select fv.status
  into v_version_status
  from public.automation_flow_versions fv
  where fv.organization_id = new.organization_id
    and fv.workflow_id = new.workflow_id
    and fv.version_number = new.flow_version;

  if coalesce(v_version_status, '') <> 'published' then
    return new;
  end if;

  select *
  into v_current_node
  from public.automation_flow_nodes n
  where n.organization_id = new.organization_id
    and n.workflow_id = new.workflow_id
    and n.version_number = new.flow_version
    and n.id = new.current_node_id
    and n.enabled = true;

  if not found or v_current_node.node_type <> 'trigger' then
    return new;
  end if;

  select count(*)
  into v_edge_count
  from public.automation_flow_edges e
  where e.organization_id = new.organization_id
    and e.workflow_id = new.workflow_id
    and e.version_number = new.flow_version
    and e.source_node_id = v_current_node.id;

  if v_edge_count <> 1 then
    update public.automation_enrollments
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'runtime_entry', 'blocked',
      'runtime_entry_reason', format('trigger_outgoing_edge_count_%s', v_edge_count),
      'customer_message_sent', false
    )
    where organization_id = new.organization_id
      and id = new.id;
    return new;
  end if;

  select e.id, e.target_node_id, e.label, e.priority
  into v_edge
  from public.automation_flow_edges e
  where e.organization_id = new.organization_id
    and e.workflow_id = new.workflow_id
    and e.version_number = new.flow_version
    and e.source_node_id = v_current_node.id
  order by e.priority asc
  limit 1;

  select *
  into v_target_node
  from public.automation_flow_nodes n
  where n.organization_id = new.organization_id
    and n.workflow_id = new.workflow_id
    and n.version_number = new.flow_version
    and n.id = v_edge.target_node_id
    and n.enabled = true;

  if not found or v_target_node.node_type <> 'wait_for_reply' then
    update public.automation_enrollments
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'runtime_entry', 'blocked',
      'runtime_entry_reason', 'v1_requires_wait_for_reply_after_trigger',
      'runtime_entry_target_type', case when found then v_target_node.node_type else null end,
      'customer_message_sent', false
    )
    where organization_id = new.organization_id
      and id = new.id;
    return new;
  end if;

  v_timeout_minutes := greatest(
    1,
    least(
      10080,
      round(coalesce(nullif(v_target_node.config ->> 'timeout_minutes', '')::numeric, 60))::integer
    )
  );
  v_timeout_at := now() + make_interval(mins => v_timeout_minutes);

  -- Defensive idempotency if this trigger/function is ever replayed manually.
  select ws.id
  into v_wait_id
  from public.automation_wait_states ws
  where ws.organization_id = new.organization_id
    and ws.workflow_id = new.workflow_id
    and ws.enrollment_id = new.id
    and ws.wait_type = 'reply'
    and ws.status = 'waiting'
  order by ws.created_at asc
  limit 1;

  if v_wait_id is null then
    insert into public.automation_wait_states (
      organization_id,
      workflow_id,
      enrollment_id,
      lead_id,
      wait_type,
      status,
      timeout_at,
      waiting_since,
      metadata
    )
    values (
      new.organization_id,
      new.workflow_id,
      new.id,
      new.lead_id,
      'reply',
      'waiting',
      v_timeout_at,
      now(),
      jsonb_build_object(
        'source', 'automatic_runtime_entry_v1',
        'flow_version', new.flow_version,
        'node_id', v_target_node.id,
        'node_key', v_target_node.node_key,
        'stop_on_reply', coalesce((v_target_node.config ->> 'stop_on_reply')::boolean, true),
        'timeout_minutes', v_timeout_minutes,
        'customer_message_sent', false
      )
    )
    returning id into v_wait_id;
  end if;

  v_dedupe_key := format(
    'runtime-v1:reply-timeout:%s:%s:v%s',
    new.id,
    v_wait_id,
    new.flow_version
  );

  insert into public.automation_scheduled_jobs (
    organization_id,
    workflow_id,
    enrollment_id,
    wait_state_id,
    lead_id,
    job_type,
    status,
    scheduled_for,
    attempt_count,
    max_attempts,
    dedupe_key,
    payload
  )
  values (
    new.organization_id,
    new.workflow_id,
    new.id,
    v_wait_id,
    new.lead_id,
    'resume_reply_timeout',
    'scheduled',
    v_timeout_at,
    0,
    greatest(1, least(coalesce(v_workflow.max_attempts, 3), 20)),
    v_dedupe_key,
    jsonb_build_object(
      'source', 'automatic_runtime_entry_v1',
      'flow_version', new.flow_version,
      'wait_node_id', v_target_node.id,
      'wait_node_key', v_target_node.node_key,
      'customer_message_sent', false
    )
  )
  on conflict (organization_id, dedupe_key) do nothing
  returning id into v_job_id;

  update public.automation_enrollments
  set
    current_node_id = v_target_node.id,
    next_action_at = v_timeout_at,
    last_event_at = coalesce(new.last_event_at, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'runtime_entry', 'waiting_for_reply',
      'runtime_entry_source_node_key', v_current_node.node_key,
      'runtime_entry_edge_label', v_edge.label,
      'current_node_key', v_target_node.node_key,
      'current_node_type', v_target_node.node_type,
      'reply_wait_state_id', v_wait_id,
      'reply_timeout_job_id', v_job_id,
      'reply_timeout_at', v_timeout_at,
      'runtime_entry_version', 'v1',
      'customer_message_sent', false
    )
  where organization_id = new.organization_id
    and workflow_id = new.workflow_id
    and id = new.id
    and current_node_id = v_current_node.id;

  return new;
exception
  when others then
    -- Fail closed: preserve the enrollment parked on its current node, record
    -- the error, and never make canonical lead/event creation fail because a
    -- runtime-entry step had a problem.
    update public.automation_enrollments
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'runtime_entry', 'error',
      'runtime_entry_error', left(sqlerrm, 1000),
      'runtime_entry_version', 'v1',
      'customer_message_sent', false
    )
    where organization_id = new.organization_id
      and id = new.id;
    return new;
end;
$function$;

revoke all on function public.enter_automatic_enrollment_runtime_v1() from public;
revoke all on function public.enter_automatic_enrollment_runtime_v1() from anon;
revoke all on function public.enter_automatic_enrollment_runtime_v1() from authenticated;

-- Runs only after a canonical dispatcher enrollment has been stored. The
-- function itself performs all runtime/source/version/node gates above.
drop trigger if exists automation_enrollments_runtime_entry_v1 on public.automation_enrollments;
create trigger automation_enrollments_runtime_entry_v1
after insert on public.automation_enrollments
for each row execute function public.enter_automatic_enrollment_runtime_v1();
