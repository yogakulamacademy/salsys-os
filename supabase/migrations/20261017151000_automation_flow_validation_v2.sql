create or replace function public.stable_json_text_v1(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_result text;
begin
  if p_value is null then
    return 'null';
  end if;

  v_type := jsonb_typeof(p_value);

  if v_type = 'object' then
    select '{' || coalesce(string_agg(to_jsonb(e.key)::text || ':' || public.stable_json_text_v1(e.value), ',' order by e.key), '') || '}'
      into v_result
    from jsonb_each(p_value) e;
    return v_result;
  elsif v_type = 'array' then
    select '[' || coalesce(string_agg(public.stable_json_text_v1(a.value), ',' order by a.ordinality), '') || ']'
      into v_result
    from jsonb_array_elements(p_value) with ordinality a(value, ordinality);
    return v_result;
  end if;

  return p_value::text;
end;
$$;

create or replace function public.automation_flow_definition_hash_v1(
  p_organization_id uuid,
  p_workflow_id uuid,
  p_version_number integer
)
returns text
language plpgsql
security definer
stable
set search_path = public, auth, pg_temp
as $$
declare
  v_nodes jsonb;
  v_edges jsonb;
  v_root jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'node_key', n.node_key,
        'node_type', n.node_type,
        'label', n.label,
        'config', coalesce(n.config, '{}'::jsonb),
        'enabled', n.enabled is not false,
        'position_x', coalesce(n.position_x, 0),
        'position_y', coalesce(n.position_y, 0)
      ) order by n.node_key
    ),
    '[]'::jsonb
  ) into v_nodes
  from public.automation_flow_nodes n
  where n.organization_id = p_organization_id
    and n.workflow_id = p_workflow_id
    and n.version_number = p_version_number;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'edge_key', e.edge_key,
        'source_node_key', coalesce(src.node_key, e.source_node_id::text),
        'target_node_key', coalesce(dst.node_key, e.target_node_id::text),
        'label', e.label,
        'condition', coalesce(e.condition, '{}'::jsonb),
        'priority', coalesce(e.priority, 0)
      ) order by e.edge_key
    ),
    '[]'::jsonb
  ) into v_edges
  from public.automation_flow_edges e
  left join public.automation_flow_nodes src
    on src.id = e.source_node_id
   and src.organization_id = e.organization_id
   and src.workflow_id = e.workflow_id
   and src.version_number = e.version_number
  left join public.automation_flow_nodes dst
    on dst.id = e.target_node_id
   and dst.organization_id = e.organization_id
   and dst.workflow_id = e.workflow_id
   and dst.version_number = e.version_number
  where e.organization_id = p_organization_id
    and e.workflow_id = p_workflow_id
    and e.version_number = p_version_number;

  v_root := jsonb_build_object('nodes', v_nodes, 'edges', v_edges);
  return encode(digest(public.stable_json_text_v1(v_root), 'sha256'), 'hex');
end;
$$;

create or replace function public.validate_automation_flow_version_v2(
  p_organization_id uuid,
  p_workflow_id uuid,
  p_version_number integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_workflow public.automation_workflows%rowtype;
  v_version public.automation_flow_versions%rowtype;
  v_node record;
  v_trigger_id uuid;
  v_trigger_count integer := 0;
  v_node_count integer := 0;
  v_edge_count integer := 0;
  v_outgoing integer := 0;
  v_branch_count integer := 0;
  v_branch_value_count integer := 0;
  v_branch_unique_count integer := 0;
  v_unreachable integer := 0;
  v_cycles integer := 0;
  v_bad_edges integer := 0;
  v_terminal_count integer := 0;
  v_delay numeric;
  v_timeout numeric;
  v_account_id uuid;
  v_payload jsonb;
  v_message_type text;
  v_body text;
  v_hash text;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_valid boolean := false;
  v_snapshot jsonb;
begin
  if p_organization_id is null or p_workflow_id is null or p_version_number is null or p_version_number < 1 then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('organization_id, workflow_id and a valid version are required'));
  end if;

  select * into v_workflow
  from public.automation_workflows w
  where w.organization_id = p_organization_id and w.id = p_workflow_id;

  if v_workflow.id is null then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('workflow_not_found'));
  end if;

  if v_workflow.current_draft_version is distinct from p_version_number then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('version_is_not_current_draft'));
  end if;

  select * into v_version
  from public.automation_flow_versions fv
  where fv.organization_id = p_organization_id
    and fv.workflow_id = p_workflow_id
    and fv.version_number = p_version_number;

  if v_version.id is null or v_version.status <> 'draft' then
    return jsonb_build_object('valid', false, 'errors', jsonb_build_array('draft_version_not_found'));
  end if;

  select count(*) into v_node_count
  from public.automation_flow_nodes n
  where n.organization_id=p_organization_id and n.workflow_id=p_workflow_id and n.version_number=p_version_number and n.enabled=true;

  select count(*) into v_edge_count
  from public.automation_flow_edges e
  where e.organization_id=p_organization_id and e.workflow_id=p_workflow_id and e.version_number=p_version_number;

  select count(*), min(id) into v_trigger_count, v_trigger_id
  from public.automation_flow_nodes n
  where n.organization_id=p_organization_id and n.workflow_id=p_workflow_id and n.version_number=p_version_number and n.enabled=true and n.node_type='trigger';

  if v_trigger_count <> 1 then
    v_errors := v_errors || jsonb_build_array(format('Flow must contain exactly one enabled trigger node; found %s.', v_trigger_count));
  end if;

  select count(*) into v_bad_edges
  from public.automation_flow_edges e
  left join public.automation_flow_nodes s on s.id=e.source_node_id and s.organization_id=e.organization_id and s.workflow_id=e.workflow_id and s.version_number=e.version_number and s.enabled=true
  left join public.automation_flow_nodes t on t.id=e.target_node_id and t.organization_id=e.organization_id and t.workflow_id=e.workflow_id and t.version_number=e.version_number and t.enabled=true
  where e.organization_id=p_organization_id and e.workflow_id=p_workflow_id and e.version_number=p_version_number
    and (s.id is null or t.id is null);

  if v_bad_edges > 0 then
    v_errors := v_errors || jsonb_build_array(format('%s connection(s) point to missing or disabled nodes.', v_bad_edges));
  end if;

  for v_node in
    select * from public.automation_flow_nodes n
    where n.organization_id=p_organization_id and n.workflow_id=p_workflow_id and n.version_number=p_version_number and n.enabled=true
    order by n.node_key
  loop
    select count(*) into v_outgoing
    from public.automation_flow_edges e
    where e.organization_id=p_organization_id and e.workflow_id=p_workflow_id and e.version_number=p_version_number and e.source_node_id=v_node.id;

    if v_node.node_type in ('end','human_handoff') then
      v_terminal_count := v_terminal_count + 1;
      if v_outgoing > 0 then
        v_errors := v_errors || jsonb_build_array(format('%s is terminal and cannot have outgoing connections.', v_node.label));
      end if;
      continue;
    end if;

    if v_outgoing = 0 then
      v_errors := v_errors || jsonb_build_array(format('%s has no outgoing connection.', v_node.label));
    end if;

    if v_node.node_type = 'condition' then
      select count(*),
             count(*) filter (where nullif(btrim(coalesce(e.condition->>'equals','')), '') is not null),
             count(distinct nullif(btrim(coalesce(e.condition->>'equals','')), ''))
      into v_branch_count, v_branch_value_count, v_branch_unique_count
      from public.automation_flow_edges e
      where e.organization_id=p_organization_id and e.workflow_id=p_workflow_id and e.version_number=p_version_number and e.source_node_id=v_node.id;

      if v_branch_count < 2 then
        v_errors := v_errors || jsonb_build_array(format('%s must have at least two branches.', v_node.label));
      end if;
      if v_branch_value_count <> v_branch_count then
        v_errors := v_errors || jsonb_build_array(format('%s has a branch without a branch value.', v_node.label));
      end if;
      if v_branch_unique_count <> v_branch_value_count then
        v_errors := v_errors || jsonb_build_array(format('%s has duplicate branch values.', v_node.label));
      end if;
    elsif v_node.node_type = 'wait' then
      begin
        v_delay := (v_node.config->>'delay_minutes')::numeric;
      exception when others then
        v_delay := null;
      end;
      if v_delay is null or v_delay < 1 or v_delay > 10080 then
        v_errors := v_errors || jsonb_build_array(format('%s has an invalid delay.', v_node.label));
      end if;
    elsif v_node.node_type = 'wait_for_reply' then
      begin
        v_timeout := (v_node.config->>'timeout_minutes')::numeric;
      exception when others then
        v_timeout := null;
      end;
      if v_timeout is null or v_timeout < 1 or v_timeout > 10080 then
        v_errors := v_errors || jsonb_build_array(format('%s has an invalid reply timeout.', v_node.label));
      end if;
      if coalesce((v_node.config->>'stop_on_reply')::boolean,false) is not true then
        v_warnings := v_warnings || jsonb_build_array(format('%s does not stop the pending no-reply path when a reply arrives.', v_node.label));
      end if;
    elsif v_node.node_type = 'action' then
      if coalesce(v_node.config->>'action_type','') in ('create_followup','assign_owner','add_tag','notify_user') then
        null;
      elsif v_node.config->>'action_type' = 'send_message' and v_node.config->>'channel' = 'whatsapp' then
        if coalesce((v_node.config->>'requires_approval')::boolean,false) is not true then
          v_errors := v_errors || jsonb_build_array(format('%s must require human approval.', v_node.label));
        end if;

        begin
          v_account_id := nullif(v_node.config->>'whatsapp_account_id','')::uuid;
        exception when others then
          v_account_id := null;
        end;

        if v_account_id is null or not exists (
          select 1 from public.whatsapp_accounts wa
          where wa.id=v_account_id and wa.organization_id=p_organization_id and wa.active=true
        ) then
          v_errors := v_errors || jsonb_build_array(format('%s does not reference an active tenant WhatsApp account.', v_node.label));
        end if;

        v_payload := v_node.config->'request_payload';
        if jsonb_typeof(v_payload) <> 'object' then
          v_errors := v_errors || jsonb_build_array(format('%s request payload must be an object.', v_node.label));
        else
          v_message_type := coalesce(v_payload->>'message_type','');
          if v_message_type not in ('text','template') then
            v_errors := v_errors || jsonb_build_array(format('%s has an unsupported WhatsApp message type.', v_node.label));
          elsif v_message_type = 'text' then
            v_body := btrim(coalesce(v_payload->>'body',''));
            if v_body = '' or length(v_body) > 4096 then
              v_errors := v_errors || jsonb_build_array(format('%s text body must be between 1 and 4096 characters.', v_node.label));
            end if;
          elsif v_message_type = 'template' then
            if nullif(btrim(coalesce(v_node.config->>'template_name','')), '') is null
               or nullif(btrim(coalesce(v_node.config->>'template_language','')), '') is null then
              v_errors := v_errors || jsonb_build_array(format('%s template sends require template_name and template_language.', v_node.label));
            end if;
          end if;
        end if;
      else
        v_errors := v_errors || jsonb_build_array(format('%s uses an action that is not allowed in guarded V2.', v_node.label));
      end if;
    end if;
  end loop;

  if v_terminal_count = 0 then
    v_errors := v_errors || jsonb_build_array('Flow must contain at least one terminal End or Human handoff node.');
  end if;

  if v_trigger_count = 1 then
    with recursive walk(node_id,path,cycle) as (
      select v_trigger_id, array[v_trigger_id]::uuid[], false
      union all
      select e.target_node_id, w.path || e.target_node_id, e.target_node_id = any(w.path)
      from walk w
      join public.automation_flow_edges e on e.source_node_id=w.node_id
      where e.organization_id=p_organization_id and e.workflow_id=p_workflow_id and e.version_number=p_version_number and not w.cycle
    ), reachable as (
      select distinct node_id from walk where not cycle
    )
    select
      (select count(*) from public.automation_flow_nodes n where n.organization_id=p_organization_id and n.workflow_id=p_workflow_id and n.version_number=p_version_number and n.enabled=true and not exists(select 1 from reachable r where r.node_id=n.id)),
      (select count(*) from walk where cycle)
    into v_unreachable, v_cycles;

    if v_unreachable > 0 then
      v_errors := v_errors || jsonb_build_array(format('%s enabled node(s) are not reachable from the trigger.', v_unreachable));
    end if;
    if v_cycles > 0 then
      v_errors := v_errors || jsonb_build_array('Cycles are blocked in guarded V2.');
    end if;
  end if;

  v_hash := public.automation_flow_definition_hash_v1(p_organization_id,p_workflow_id,p_version_number);
  v_valid := jsonb_array_length(v_errors)=0;

  v_snapshot := jsonb_build_object(
    'valid',v_valid,
    'errors',v_errors,
    'warnings',v_warnings,
    'checked_at',v_now,
    'node_count',v_node_count,
    'edge_count',v_edge_count,
    'validator_version','v2',
    'guarded_whatsapp_send_supported',true,
    'customer_messaging_enabled',false,
    'version_number',p_version_number,
    'definition_hash',v_hash
  );

  update public.automation_flow_versions
  set definition_hash=v_hash,
      validated_at=case when v_valid then v_now else null end,
      validation_snapshot=v_snapshot,
      updated_at=v_now
  where organization_id=p_organization_id and workflow_id=p_workflow_id and version_number=p_version_number and status='draft';

  update public.automation_workflows
  set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'flow_validation',v_snapshot,
    'flow_publish_eligible',v_valid,
    'safety_mode','draft_only',
    'customer_message_sent',false
  )
  where organization_id=p_organization_id and id=p_workflow_id;

  return v_snapshot;
end;
$$;

revoke all on function public.stable_json_text_v1(jsonb) from public, anon, authenticated;
revoke all on function public.automation_flow_definition_hash_v1(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.validate_automation_flow_version_v2(uuid,uuid,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.automation_flow_definition_hash_v1(uuid,uuid,integer) to service_role;
grant execute on function public.validate_automation_flow_version_v2(uuid,uuid,integer,timestamptz) to service_role;