-- Smart Triggers: visual flow graph + per-enrollment variables foundation.
-- Additive only. Does not enable background execution or customer messaging.

create table if not exists public.automation_flow_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  version_number integer not null default 1 check (version_number >= 1),
  node_key text not null,
  node_type text not null check (node_type in ('trigger','condition','action','wait','wait_for_reply','human_approval','human_handoff','end')),
  label text not null,
  config jsonb not null default '{}'::jsonb,
  position_x integer not null default 0,
  position_y integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, workflow_id, version_number, node_key),
  constraint automation_flow_nodes_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade
);

create index if not exists automation_flow_nodes_workflow_idx
  on public.automation_flow_nodes (organization_id, workflow_id, version_number, node_type);

create table if not exists public.automation_flow_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  version_number integer not null default 1 check (version_number >= 1),
  source_node_id uuid not null,
  target_node_id uuid not null,
  edge_key text not null,
  label text,
  condition jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, workflow_id, version_number, source_node_id, edge_key),
  constraint automation_flow_edges_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_flow_edges_source_fk
    foreign key (source_node_id, organization_id)
    references public.automation_flow_nodes(id, organization_id)
    on delete cascade,
  constraint automation_flow_edges_target_fk
    foreign key (target_node_id, organization_id)
    references public.automation_flow_nodes(id, organization_id)
    on delete cascade,
  constraint automation_flow_edges_not_self check (source_node_id <> target_node_id)
);

create index if not exists automation_flow_edges_source_idx
  on public.automation_flow_edges (organization_id, workflow_id, version_number, source_node_id, priority);

create index if not exists automation_flow_edges_target_idx
  on public.automation_flow_edges (organization_id, workflow_id, version_number, target_node_id);

create table if not exists public.automation_variables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  enrollment_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  variable_key text not null,
  value jsonb not null default 'null'::jsonb,
  value_type text not null default 'json' check (value_type in ('string','number','boolean','date','datetime','json')),
  source_node_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, enrollment_id, variable_key),
  constraint automation_variables_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_variables_enrollment_fk
    foreign key (enrollment_id, organization_id)
    references public.automation_enrollments(id, organization_id)
    on delete cascade,
  constraint automation_variables_source_node_fk
    foreign key (source_node_id, organization_id)
    references public.automation_flow_nodes(id, organization_id)
    on delete set null
);

create index if not exists automation_variables_lead_idx
  on public.automation_variables (organization_id, lead_id, updated_at desc);

alter table public.automation_enrollments
  add column if not exists current_node_id uuid,
  add column if not exists flow_version integer not null default 1 check (flow_version >= 1);

alter table public.automation_enrollments
  drop constraint if exists automation_enrollments_current_node_fk;

alter table public.automation_enrollments
  add constraint automation_enrollments_current_node_fk
  foreign key (current_node_id, organization_id)
  references public.automation_flow_nodes(id, organization_id)
  on delete set null;

create index if not exists automation_enrollments_current_node_idx
  on public.automation_enrollments (organization_id, workflow_id, current_node_id)
  where current_node_id is not null;

drop trigger if exists automation_flow_nodes_set_updated_at on public.automation_flow_nodes;
create trigger automation_flow_nodes_set_updated_at
before update on public.automation_flow_nodes
for each row execute function public.set_updated_at();

drop trigger if exists automation_flow_edges_set_updated_at on public.automation_flow_edges;
create trigger automation_flow_edges_set_updated_at
before update on public.automation_flow_edges
for each row execute function public.set_updated_at();

drop trigger if exists automation_variables_set_updated_at on public.automation_variables;
create trigger automation_variables_set_updated_at
before update on public.automation_variables
for each row execute function public.set_updated_at();

drop trigger if exists automation_variables_tenant_alignment on public.automation_variables;
create trigger automation_variables_tenant_alignment
before insert or update on public.automation_variables
for each row execute function public.enforce_automation_tenant_alignment_v1();

alter table public.automation_flow_nodes enable row level security;
alter table public.automation_flow_edges enable row level security;
alter table public.automation_variables enable row level security;

drop policy if exists automation_flow_nodes_read on public.automation_flow_nodes;
create policy automation_flow_nodes_read on public.automation_flow_nodes
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

drop policy if exists automation_flow_edges_read on public.automation_flow_edges;
create policy automation_flow_edges_read on public.automation_flow_edges
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

drop policy if exists automation_variables_read on public.automation_variables;
create policy automation_variables_read on public.automation_variables
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

revoke all on public.automation_flow_nodes from anon;
revoke all on public.automation_flow_edges from anon;
revoke all on public.automation_variables from anon;
revoke insert, update, delete, truncate, references, trigger on public.automation_flow_nodes from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.automation_flow_edges from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.automation_variables from authenticated;
grant select on public.automation_flow_nodes to authenticated;
grant select on public.automation_flow_edges to authenticated;
grant select on public.automation_variables to authenticated;
grant all on public.automation_flow_nodes to service_role;
grant all on public.automation_flow_edges to service_role;
grant all on public.automation_variables to service_role;
