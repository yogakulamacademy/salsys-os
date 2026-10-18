-- Smart Triggers: versioned draft/published flow definitions.
-- Publishing a flow definition here does NOT enable runtime execution or customer messaging.

alter table public.automation_workflows
  add column if not exists current_draft_version integer,
  add column if not exists current_published_version integer,
  add column if not exists runtime_flow_enabled boolean not null default false;

alter table public.automation_workflows
  drop constraint if exists automation_workflows_current_draft_version_check;
alter table public.automation_workflows
  add constraint automation_workflows_current_draft_version_check
  check (current_draft_version is null or current_draft_version >= 1);

alter table public.automation_workflows
  drop constraint if exists automation_workflows_current_published_version_check;
alter table public.automation_workflows
  add constraint automation_workflows_current_published_version_check
  check (current_published_version is null or current_published_version >= 1);

create table if not exists public.automation_flow_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  version_number integer not null check (version_number >= 1),
  status text not null default 'draft' check (status in ('draft','published','retired')),
  definition_hash text,
  validated_at timestamptz,
  validation_snapshot jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_by uuid,
  created_from_version integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, workflow_id, version_number),
  constraint automation_flow_versions_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_flow_versions_created_from_check
    check (created_from_version is null or created_from_version >= 1)
);

create unique index if not exists automation_flow_versions_one_draft_idx
  on public.automation_flow_versions (organization_id, workflow_id)
  where status = 'draft';

create unique index if not exists automation_flow_versions_one_published_idx
  on public.automation_flow_versions (organization_id, workflow_id)
  where status = 'published';

create index if not exists automation_flow_versions_history_idx
  on public.automation_flow_versions (organization_id, workflow_id, version_number desc);

drop trigger if exists automation_flow_versions_set_updated_at on public.automation_flow_versions;
create trigger automation_flow_versions_set_updated_at
before update on public.automation_flow_versions
for each row execute function public.set_updated_at();

alter table public.automation_flow_versions enable row level security;

drop policy if exists automation_flow_versions_read on public.automation_flow_versions;
create policy automation_flow_versions_read
on public.automation_flow_versions
for select
to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

revoke all on public.automation_flow_versions from anon;
revoke insert, update, delete, truncate, references, trigger on public.automation_flow_versions from authenticated;
grant select on public.automation_flow_versions to authenticated;
grant all on public.automation_flow_versions to service_role;

-- Bootstrap any existing graph as draft version 1 without publishing or enabling runtime.
insert into public.automation_flow_versions (
  organization_id,
  workflow_id,
  version_number,
  status,
  created_at,
  updated_at
)
select distinct
  n.organization_id,
  n.workflow_id,
  n.version_number,
  'draft',
  now(),
  now()
from public.automation_flow_nodes n
left join public.automation_flow_versions v
  on v.organization_id = n.organization_id
 and v.workflow_id = n.workflow_id
 and v.version_number = n.version_number
where v.id is null
on conflict (organization_id, workflow_id, version_number) do nothing;

update public.automation_workflows w
set current_draft_version = coalesce(
      w.current_draft_version,
      (
        select max(v.version_number)
        from public.automation_flow_versions v
        where v.organization_id = w.organization_id
          and v.workflow_id = w.id
          and v.status = 'draft'
      )
    ),
    runtime_flow_enabled = false
where exists (
  select 1
  from public.automation_flow_versions v
  where v.organization_id = w.organization_id
    and v.workflow_id = w.id
);

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
set search_path = public
as $$
declare
  v_version public.automation_flow_versions%rowtype;
  v_next_version integer;
  v_node record;
  v_edge record;
  v_new_node_id uuid;
  v_node_map jsonb := '{}'::jsonb;
  v_node_count integer := 0;
  v_edge_count integer := 0;
begin
  if p_version_number < 1 then
    raise exception 'invalid flow version';
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
      id,
      organization_id,
      workflow_id,
      version_number,
      node_key,
      node_type,
      label,
      config,
      position_x,
      position_y,
      enabled,
      created_at,
      updated_at
    ) values (
      v_new_node_id,
      v_node.organization_id,
      v_node.workflow_id,
      v_next_version,
      v_node.node_key,
      v_node.node_type,
      v_node.label,
      v_node.config,
      v_node.position_x,
      v_node.position_y,
      v_node.enabled,
      now(),
      now()
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
      organization_id,
      workflow_id,
      version_number,
      source_node_id,
      target_node_id,
      edge_key,
      label,
      condition,
      priority,
      created_at,
      updated_at
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
    'runtime_flow_enabled', false
  );
end;
$$;

revoke all on function public.publish_and_clone_automation_flow_version_v1(uuid,uuid,integer,text,uuid) from public;
revoke all on function public.publish_and_clone_automation_flow_version_v1(uuid,uuid,integer,text,uuid) from anon;
revoke all on function public.publish_and_clone_automation_flow_version_v1(uuid,uuid,integer,text,uuid) from authenticated;
grant execute on function public.publish_and_clone_automation_flow_version_v1(uuid,uuid,integer,text,uuid) to service_role;
