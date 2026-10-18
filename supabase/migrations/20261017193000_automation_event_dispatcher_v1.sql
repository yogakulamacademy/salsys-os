-- SalsysOS canonical automation event dispatcher V1.
--
-- Purpose:
--   automation_events -> matching active event trigger -> pinned published-flow enrollment.
--
-- Safety:
--   * automatic dispatch is gated by automation_workflows.runtime_flow_enabled = true
--   * workflow must be active
--   * trigger must be enabled and match the canonical event_name
--   * current flow version must be published
--   * published graph must contain an enabled trigger node for the same event
--   * enrollment is parked on the trigger node with next_action_at = null
--   * this migration does NOT execute graph nodes, schedule jobs, or send customer messages
--   * the existing active-enrollment unique index prevents concurrent duplicate enrollment

create or replace function public.dispatch_automation_event_v1(
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
  v_existing_enrollment_id uuid;
  v_enrollment_id uuid;
  v_matched integer := 0;
  v_enrolled integer := 0;
  v_skipped_existing integer := 0;
begin
  if p_event_id is null then
    raise exception 'event_id is required to dispatch an automation event';
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

  -- V1 flow enrollment is lead-scoped. Non-lead events remain recorded and
  -- available for future organization/conversation-scoped automation support.
  if v_event.lead_id is null then
    return jsonb_build_object(
      'ok', true,
      'event_id', v_event.id,
      'event_name', v_event.event_name,
      'matched', 0,
      'enrolled', 0,
      'skipped', 'event_has_no_lead'
    );
  end if;

  for v_candidate in
    select distinct on (w.id)
      w.id as workflow_id,
      w.current_published_version as flow_version,
      t.id as trigger_id,
      n.id as trigger_node_id,
      n.node_key as trigger_node_key
    from public.automation_workflows w
    join public.automation_triggers t
      on t.organization_id = w.organization_id
     and t.workflow_id = w.id
     and t.trigger_type = 'event'
     and t.enabled = true
     and t.event_name = v_event.event_name
    join public.automation_flow_versions fv
      on fv.organization_id = w.organization_id
     and fv.workflow_id = w.id
     and fv.version_number = w.current_published_version
     and fv.status = 'published'
    join public.automation_flow_nodes n
      on n.organization_id = w.organization_id
     and n.workflow_id = w.id
     and n.version_number = w.current_published_version
     and n.node_type = 'trigger'
     and n.enabled = true
     and nullif(btrim(n.config ->> 'event_name'), '') = v_event.event_name
    where w.organization_id = v_event.organization_id
      and w.status = 'active'
      and w.runtime_flow_enabled = true
      and w.current_published_version is not null
    order by w.id, t.position asc, n.created_at asc
  loop
    v_matched := v_matched + 1;
    v_existing_enrollment_id := null;
    v_enrollment_id := null;

    select e.id
    into v_existing_enrollment_id
    from public.automation_enrollments e
    where e.organization_id = v_event.organization_id
      and e.workflow_id = v_candidate.workflow_id
      and e.lead_id = v_event.lead_id
      and e.status in ('active', 'paused')
    limit 1;

    if v_existing_enrollment_id is not null then
      v_skipped_existing := v_skipped_existing + 1;
      continue;
    end if;

    begin
      insert into public.automation_enrollments (
        organization_id,
        workflow_id,
        lead_id,
        status,
        attempt_count,
        next_action_at,
        last_event_at,
        current_node_id,
        flow_version,
        metadata
      )
      values (
        v_event.organization_id,
        v_candidate.workflow_id,
        v_event.lead_id,
        'active',
        0,
        null,
        v_event.occurred_at,
        v_candidate.trigger_node_id,
        v_candidate.flow_version,
        jsonb_strip_nulls(
          jsonb_build_object(
            'source', 'automatic_event_dispatch_v1',
            'event_id', v_event.id,
            'event_name', v_event.event_name,
            'event_source_system', v_event.source_system,
            'event_source_event_id', v_event.source_event_id,
            'trigger_id', v_candidate.trigger_id,
            'current_node_key', v_candidate.trigger_node_key,
            'current_node_type', 'trigger',
            'pinned_published_version', v_candidate.flow_version,
            'automatic_dispatch', true,
            'customer_message_sent', false
          )
        )
      )
      returning id into v_enrollment_id;

      if v_enrollment_id is not null then
        v_enrolled := v_enrolled + 1;
      end if;
    exception
      when unique_violation then
        -- A concurrent dispatcher may have enrolled the same lead/workflow
        -- between our existence check and insert. Treat that as safe dedupe.
        v_skipped_existing := v_skipped_existing + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event.id,
    'event_name', v_event.event_name,
    'organization_id', v_event.organization_id,
    'lead_id', v_event.lead_id,
    'matched', v_matched,
    'enrolled', v_enrolled,
    'skipped_existing', v_skipped_existing,
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.dispatch_automation_event_v1(uuid) from public;
revoke all on function public.dispatch_automation_event_v1(uuid) from anon;
revoke all on function public.dispatch_automation_event_v1(uuid) from authenticated;
grant execute on function public.dispatch_automation_event_v1(uuid) to service_role;

create or replace function public.dispatch_inserted_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  perform public.dispatch_automation_event_v1(new.id);
  return new;
end;
$function$;

revoke all on function public.dispatch_inserted_automation_event_v1() from public;
revoke all on function public.dispatch_inserted_automation_event_v1() from anon;
revoke all on function public.dispatch_inserted_automation_event_v1() from authenticated;

-- Dispatch only after the canonical event has been tenant-validated and stored.
drop trigger if exists automation_events_dispatch_v1 on public.automation_events;
create trigger automation_events_dispatch_v1
after insert on public.automation_events
for each row execute function public.dispatch_inserted_automation_event_v1();
