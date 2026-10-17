create or replace function public.automation_flow_definition_hash_v1(
  p_organization_id uuid,
  p_workflow_id uuid,
  p_version_number integer
)
returns text
language plpgsql
security definer
stable
set search_path = public, auth, extensions, pg_temp
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
  return encode(extensions.digest(public.stable_json_text_v1(v_root), 'sha256'), 'hex');
end;
$$;

revoke all on function public.automation_flow_definition_hash_v1(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.automation_flow_definition_hash_v1(uuid,uuid,integer) to service_role;