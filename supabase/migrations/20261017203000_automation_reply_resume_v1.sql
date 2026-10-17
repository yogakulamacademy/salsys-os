-- SalsysOS automatic reply resume V1.
--
-- Purpose:
--   canonical message.received automation events -> active reply waits ->
--   reply_received branch on the pinned published flow.
--
-- Safety:
--   * only canonical message.received events are considered
--   * tenant and lead must match the active enrollment/wait
--   * workflow must still be active with runtime_flow_enabled = true
--   * enrollment must be pinned to a published flow version
--   * current node must still be wait_for_reply
--   * wait is claimed atomically by changing waiting -> resumed
--   * timeout jobs are cancelled when still scheduled
--   * a concurrently claimed timeout worker loses safely because the wait is no longer waiting
--   * no customer message is sent by this migration

create or replace function public.resume_reply_waits_from_message_event_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_event public.automation_events%rowtype;
  v_candidate record;
  v_wait_edge_count integer;
  v_condition_node record;
  v_reply_edge record;
  v_target_node record;
  v_resumed_wait_id uuid;
  v_now timestamptz;
  v_resumed integer := 0;
  v_completed integer := 0;
  v_skipped_race integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id is required to resume reply waits';
  end if;

  select *
  into v_event
  from public.automation_events ae
  where ae.id = p_event_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Automation event not found',
      'event_id', p_event_id
    );
  end if;

  if v_event.event_name <> 'message.received' then
    return jsonb_build_object(
      'ok', true,
      'event_id', v_event.id,
      'ignored', true,
      'reason', 'not_message_received'
    );
  end if;

  if v_event.lead_id is null then
    return jsonb_build_object(
      'ok', true,
      'event_id', v_event.id,
      'ignored', true,
      'reason', 'event_has_no_lead'
    );
  end if;

  for v_candidate in
    select
      ws.id as wait_state_id,
      ws.workflow_id,
      ws.enrollment_id,
      ws.lead_id,
      ws.metadata as wait_metadata,
      e.flow_version,
      e.current_node_id,
      e.metadata as enrollment_metadata,
      n.node_key as wait_node_key,
      n.config as wait_node_config
    from public.automation_wait_states ws
    join public.automation_enrollments e
      on e.organization_id = ws.organization_id
     and e.id = ws.enrollment_id
     and e.workflow_id = ws.workflow_id
     and e.lead_id = ws.lead_id
     and e.status = 'active'
    join public.automation_workflows w
      on w.organization_id = ws.organization_id
     and w.id = ws.workflow_id
     and w.status = 'active'
     and w.runtime_flow_enabled = true
    join public.automation_flow_versions fv
      on fv.organization_id = ws.organization_id
     and fv.workflow_id = ws.workflow_id
     and fv.version_number = e.flow_version
     and fv.status = 'published'
    join public.automation_flow_nodes n
      on n.organization_id = ws.organization_id
     and n.workflow_id = ws.workflow_id
     and n.version_number = e.flow_version
     and n.id = e.current_node_id
     and n.node_type = 'wait_for_reply'
     and n.enabled = true
    where ws.organization_id = v_event.organization_id
      and ws.lead_id = v_event.lead_id
      and ws.wait_type = 'reply'
      and ws.status = 'waiting'
    order by ws.waiting_since asc
  loop
    -- The published reply wait must have exactly one outgoing edge, and that
    -- edge must point to an enabled condition node.
    select count(*)
    into v_wait_edge_count
    from public.automation_flow_edges fe
    where fe.organization_id = v_event.organization_id
      and fe.workflow_id = v_candidate.workflow_id
      and fe.version_number = v_candidate.flow_version
      and fe.source_node_id = v_candidate.current_node_id;

    if v_wait_edge_count <> 1 then
      continue;
    end if;

    select n.id, n.node_key, n.node_type, n.config
    into v_condition_node
    from public.automation_flow_edges fe
    join public.automation_flow_nodes n
      on n.organization_id = fe.organization_id
     and n.workflow_id = fe.workflow_id
     and n.version_number = fe.version_number
     and n.id = fe.target_node_id
     and n.enabled = true
    where fe.organization_id = v_event.organization_id
      and fe.workflow_id = v_candidate.workflow_id
      and fe.version_number = v_candidate.flow_version
      and fe.source_node_id = v_candidate.current_node_id
    limit 1;

    if v_condition_node.id is null or v_condition_node.node_type <> 'condition' then
      continue;
    end if;

    select fe.id, fe.target_node_id, fe.label, fe.condition
    into v_reply_edge
    from public.automation_flow_edges fe
    where fe.organization_id = v_event.organization_id
      and fe.workflow_id = v_candidate.workflow_id
      and fe.version_number = v_candidate.flow_version
      and fe.source_node_id = v_condition_node.id
      and fe.condition ->> 'equals' = 'reply_received'
    order by fe.priority asc
    limit 1;

    if v_reply_edge.id is null then
      continue;
    end if;

    select n.id, n.node_key, n.node_type, n.label, n.config
    into v_target_node
    from public.automation_flow_nodes n
    where n.organization_id = v_event.organization_id
      and n.workflow_id = v_candidate.workflow_id
      and n.version_number = v_candidate.flow_version
      and n.id = v_reply_edge.target_node_id
      and n.enabled = true;

    if v_target_node.id is null then
      continue;
    end if;

    v_now := coalesce(v_event.occurred_at, now());
    v_resumed_wait_id := null;

    -- Atomic winner between reply and timeout processing.
    update public.automation_wait_states
    set
      status = 'resumed',
      resumed_at = v_now,
      resume_event_id = v_event.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'source', 'automatic_reply_resume_v1',
        'resumed_by', 'message.received',
        'reply_outcome', 'reply_received',
        'resume_event_id', v_event.id,
        'flow_version', v_candidate.flow_version,
        'customer_message_sent', false
      )
    where organization_id = v_event.organization_id
      and id = v_candidate.wait_state_id
      and status = 'waiting'
    returning id into v_resumed_wait_id;

    if v_resumed_wait_id is null then
      v_skipped_race := v_skipped_race + 1;
      continue;
    end if;

    -- Cancel timeout work that has not yet been claimed. A job already claimed
    -- by a worker will observe that the wait is resumed and close as stale.
    update public.automation_scheduled_jobs
    set
      status = 'cancelled',
      cancelled_at = v_now,
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'cancelled_by', 'message.received',
        'resume_event_id', v_event.id,
        'customer_message_sent', false
      )
    where organization_id = v_event.organization_id
      and workflow_id = v_candidate.workflow_id
      and enrollment_id = v_candidate.enrollment_id
      and wait_state_id = v_candidate.wait_state_id
      and status = 'scheduled';

    insert into public.automation_variables (
      organization_id,
      workflow_id,
      enrollment_id,
      lead_id,
      variable_key,
      value,
      value_type,
      source_node_id
    )
    values (
      v_event.organization_id,
      v_candidate.workflow_id,
      v_candidate.enrollment_id,
      v_candidate.lead_id,
      'reply_outcome',
      'reply_received',
      'string',
      v_condition_node.id
    )
    on conflict (organization_id, enrollment_id, variable_key)
    do update set
      value = excluded.value,
      value_type = excluded.value_type,
      source_node_id = excluded.source_node_id,
      updated_at = now();

    update public.automation_enrollments
    set
      status = case when v_target_node.node_type = 'end' then 'completed' else 'active' end,
      current_node_id = v_target_node.id,
      next_action_at = null,
      last_event_at = v_now,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'current_node_key', v_target_node.node_key,
        'current_node_type', v_target_node.node_type,
        'resolved_wait_node_key', v_candidate.wait_node_key,
        'condition_node_key', v_condition_node.node_key,
        'branch_label', v_reply_edge.label,
        'reply_outcome', 'reply_received',
        'resume_event_id', v_event.id,
        'wait_state_id', v_candidate.wait_state_id,
        'automatic_reply_resume', true,
        'customer_message_sent', false
      )
    where organization_id = v_event.organization_id
      and workflow_id = v_candidate.workflow_id
      and id = v_candidate.enrollment_id
      and status = 'active'
      and current_node_id = v_candidate.current_node_id;

    v_resumed := v_resumed + 1;
    if v_target_node.node_type = 'end' then
      v_completed := v_completed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event.id,
    'event_name', v_event.event_name,
    'organization_id', v_event.organization_id,
    'lead_id', v_event.lead_id,
    'reply_waits_resumed', v_resumed,
    'enrollments_completed', v_completed,
    'skipped_race', v_skipped_race,
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.resume_reply_waits_from_message_event_v1(uuid) from public;
revoke all on function public.resume_reply_waits_from_message_event_v1(uuid) from anon;
revoke all on function public.resume_reply_waits_from_message_event_v1(uuid) from authenticated;
grant execute on function public.resume_reply_waits_from_message_event_v1(uuid) to service_role;

create or replace function public.resume_reply_waits_from_inserted_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if new.event_name = 'message.received' then
    perform public.resume_reply_waits_from_message_event_v1(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function public.resume_reply_waits_from_inserted_event_v1() from public;
revoke all on function public.resume_reply_waits_from_inserted_event_v1() from anon;
revoke all on function public.resume_reply_waits_from_inserted_event_v1() from authenticated;

drop trigger if exists automation_events_resume_reply_v1 on public.automation_events;
create trigger automation_events_resume_reply_v1
after insert on public.automation_events
for each row execute function public.resume_reply_waits_from_inserted_event_v1();
