create or replace function public.publish_and_clone_automation_flow_version_v1(
  p_organization_id uuid,
  p_workflow_id uuid,
  p_version_number integer,
  p_definition_hash text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare
  v_version public.automation_flow_versions%rowtype;
  v_workflow public.automation_workflows%rowtype;
  v_current_hash text;
  v_next_version integer;
  v_node record;
  v_edge record;
  v_new_node_id uuid;
  v_node_map jsonb := '{}'::jsonb;
  v_node_count integer := 0;
  v_edge_count integer := 0;
begin
  if p_organization_id is null or p_workflow_id is null or p_version_number is null or p_version_number < 1 then
    raise exception 'invalid flow publish request';
  end if;

  select * into v_workflow
  from public.automation_workflows
  where organization_id = p_organization_id
    and id = p_workflow_id
  for update;

  if v_workflow.id is null then
    raise exception 'workflow not found';
  end if;

  if v_workflow.current_draft_version is distinct from p_version_number then
    raise exception 'only the current draft flow version can be published';
  end if;

  select * into v_version
  from public.automation_flow_versions
  where organization_id = p_organization_id
    and workflow_id = p_workflow_id
    and version_number = p_version_number
  for update;

  if not found then
    raise exception 'flow version not found';
  end if;

  if v_version.status <> 'draft' then
    raise exception 'only a draft flow version can be published';
  end if;

  if v_version.validated_at is null
     or coalesce((v_version.validation_snapshot->>'valid')::boolean, false) is not true then
    raise exception 'flow version is not currently validated';
  end if;

  if v_version.definition_hash is null or v_version.definition_hash <> p_definition_hash then
    raise exception 'flow changed after validation; run validation again';
  end if;

  v_current_hash := public.automation_flow_definition_hash_v1(
    p_organization_id,
    p_workflow_id,
    p_version_number
  );

  if v_current_hash is null
     or v_current_hash <> v_version.definition_hash
     or v_current_hash <> p_definition_hash then
    raise exception 'flow changed after validation; run validation again';
  end if;

  update public.automation_flow_versions
  set status = 'retired', updated_at = now()
  where organization_id = p_organization_id
    and workflow_id = p_workflow_id
    and status = 'published';

  update public.automation_flow_versions
  set status = 'published',
      published_at = now(),
      published_by = p_actor_user_id,
      updated_at = now()
  where id = v_version.id;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.automation_flow_versions
  where organization_id = p_organization_id
    and workflow_id = p_workflow_id;

  insert into public.automation_flow_versions (
    organization_id,
    workflow_id,
    version_number,
    status,
    created_from_version,
    created_by
  ) values (
    p_organization_id,
    p_workflow_id,
    v_next_version,
    'draft',
    p_version_number,
    p_actor_user_id
  );

  for v_node in
    select *
    from public.automation_flow_nodes
    where organization_id = p_organization_id
      and workflow_id = p_workflow_id
      and version_number = p_version_number
    order by created_at, id
  loop
    v_new_node_id := gen_random_uuid();
    v_node_map := jsonb_set(v_node_map, array[v_node.id::text], to_jsonb(v_new_node_id::text), true);

    insert into public.automation_flow_nodes (
      id, organization_id, workflow_id, version_number, node_key, node_type,
      label, config, position_x, position_y, enabled, created_at, updated_at
    ) values (
      v_new_node_id, v_node.organization_id, v_node.workflow_id, v_next_version,
      v_node.node_key, v_node.node_type, v_node.label, v_node.config,
      v_node.position_x, v_node.position_y, v_node.enabled, now(), now()
    );
    v_node_count := v_node_count + 1;
  end loop;

  for v_edge in
    select *
    from public.automation_flow_edges
    where organization_id = p_organization_id
      and workflow_id = p_workflow_id
      and version_number = p_version_number
    order by priority, created_at, id
  loop
    insert into public.automation_flow_edges (
      organization_id, workflow_id, version_number, source_node_id, target_node_id,
      edge_key, label, condition, priority, created_at, updated_at
    ) values (
      v_edge.organization_id,
      v_edge.workflow_id,
      v_next_version,
      ((v_node_map->>v_edge.source_node_id::text)::uuid),
      ((v_node_map->>v_edge.target_node_id::text)::uuid),
      v_edge.edge_key,
      v_edge.label,
      v_edge.condition,
      v_edge.priority,
      now(),
      now()
    );
    v_edge_count := v_edge_count + 1;
  end loop;

  update public.automation_workflows
  set current_published_version = p_version_number,
      current_draft_version = v_next_version,
      runtime_flow_enabled = false,
      metadata = jsonb_set(
        jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{published_flow_version}',
          to_jsonb(p_version_number),
          true
        ),
        '{runtime_flow_enabled}',
        'false'::jsonb,
        true
      ),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_workflow_id;

  return jsonb_build_object(
    'published_version', p_version_number,
    'next_draft_version', v_next_version,
    'cloned_nodes', v_node_count,
    'cloned_edges', v_edge_count,
    'runtime_flow_enabled', false,
    'validated_definition_hash', v_current_hash
  );
end;
$function$;
