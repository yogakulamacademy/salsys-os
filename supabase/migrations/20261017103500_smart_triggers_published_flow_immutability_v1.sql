-- Smart Triggers: protect published/retired flow definitions from mutation.
-- Current draft versions remain editable. Runtime/customer messaging remain unaffected.

create or replace function public.enforce_automation_flow_definition_mutability_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_workflow_id uuid;
  v_version_number integer;
  v_status text;
  v_workflow_exists boolean;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
    v_workflow_id := old.workflow_id;
    v_version_number := old.version_number;
  else
    v_organization_id := new.organization_id;
    v_workflow_id := new.workflow_id;
    v_version_number := new.version_number;
  end if;

  -- Permit child cleanup when the parent workflow itself is being deleted.
  if tg_op = 'DELETE' then
    select exists(
      select 1
      from public.automation_workflows w
      where w.organization_id = v_organization_id
        and w.id = v_workflow_id
    ) into v_workflow_exists;

    if not v_workflow_exists then
      return old;
    end if;
  end if;

  -- For UPDATE, protect the original version even if someone tries to move a row
  -- from a published version into a draft version by changing version_number.
  if tg_op = 'UPDATE' then
    select v.status into v_status
    from public.automation_flow_versions v
    where v.organization_id = old.organization_id
      and v.workflow_id = old.workflow_id
      and v.version_number = old.version_number;

    if v_status is not null and v_status <> 'draft' then
      raise exception 'flow version % is % and immutable', old.version_number, v_status
        using errcode = '55000';
    end if;
  end if;

  select v.status into v_status
  from public.automation_flow_versions v
  where v.organization_id = v_organization_id
    and v.workflow_id = v_workflow_id
    and v.version_number = v_version_number;

  if v_status is not null and v_status <> 'draft' then
    raise exception 'flow version % is % and immutable', v_version_number, v_status
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists automation_flow_nodes_mutability_guard on public.automation_flow_nodes;
create trigger automation_flow_nodes_mutability_guard
before insert or update or delete on public.automation_flow_nodes
for each row execute function public.enforce_automation_flow_definition_mutability_v1();

drop trigger if exists automation_flow_edges_mutability_guard on public.automation_flow_edges;
create trigger automation_flow_edges_mutability_guard
before insert or update or delete on public.automation_flow_edges
for each row execute function public.enforce_automation_flow_definition_mutability_v1();

revoke all on function public.enforce_automation_flow_definition_mutability_v1() from public;
revoke all on function public.enforce_automation_flow_definition_mutability_v1() from anon;
revoke all on function public.enforce_automation_flow_definition_mutability_v1() from authenticated;
grant execute on function public.enforce_automation_flow_definition_mutability_v1() to service_role;
