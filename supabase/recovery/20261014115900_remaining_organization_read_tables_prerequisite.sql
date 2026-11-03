-- Cold-recovery compatibility only.
--
-- Four tenant-owned tables existed out-of-band before
-- 20261014115949_tenant_scope_remaining_organization_read_policies.sql first
-- recorded their read-policy hardening. Three are dormant accommodation
-- structures; accommodation management remains retired product scope. The
-- fourth is the course catalog sync audit table.
--
-- This file reconstructs the historical pre-hardening table/RLS contracts only
-- inside ephemeral Migration Replay. It copies no production rows and must never
-- be applied to current production.

begin;

create table if not exists public.accommodation_properties (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  location text,
  active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create unique index if not exists uq_accommodation_properties_org_code
  on public.accommodation_properties(organization_id, code);
create index if not exists idx_accommodation_properties_active
  on public.accommodation_properties(active, name);
create index if not exists idx_accommodation_properties_organization
  on public.accommodation_properties(organization_id);

create table if not exists public.accommodation_rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.accommodation_properties(id) on delete cascade,
  room_code text not null,
  room_name text,
  capacity_spaces integer not null default 1 check (capacity_spaces >= 1),
  floor_or_area text,
  operational_status text not null default 'available'
    check (operational_status in ('available','held','maintenance','out_of_service')),
  active boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create unique index if not exists idx_accommodation_rooms_property_code
  on public.accommodation_rooms(property_id, lower(room_code));
create index if not exists idx_accommodation_rooms_property_active
  on public.accommodation_rooms(property_id, active, operational_status, sort_order, room_code);
create index if not exists idx_accommodation_rooms_organization
  on public.accommodation_rooms(organization_id);

create table if not exists public.batch_accommodation_types (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.course_batches(id) on delete cascade,
  name text not null,
  inventory_unit text not null default 'room'
    check (inventory_unit in ('room','bed','space')),
  total_units integer not null default 0 check (total_units >= 0),
  available_units integer not null default 0 check (available_units >= 0),
  occupants_per_unit integer not null default 1 check (occupants_per_unit >= 1),
  notes text,
  sort_order integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  constraint batch_accommodation_available_lte_total check (available_units <= total_units)
);

create unique index if not exists idx_batch_accommodation_types_unique_name
  on public.batch_accommodation_types(batch_id, lower(name));
create index if not exists idx_batch_accommodation_types_batch_active
  on public.batch_accommodation_types(batch_id, active, sort_order, name);
create index if not exists idx_batch_accommodation_types_organization
  on public.batch_accommodation_types(organization_id);

create table if not exists public.course_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'yogakulam_website',
  status text not null default 'running'
    check (status in ('running','success','failed')),
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual','cron','webhook')),
  courses_received integer not null default 0,
  batches_received integer not null default 0,
  courses_upserted integer not null default 0,
  batches_upserted integer not null default 0,
  batches_deactivated integer not null default 0,
  request_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create index if not exists idx_course_catalog_sync_runs_started
  on public.course_catalog_sync_runs(started_at desc);
create index if not exists idx_course_catalog_sync_runs_organization
  on public.course_catalog_sync_runs(organization_id);

alter table public.accommodation_properties enable row level security;
alter table public.accommodation_rooms enable row level security;
alter table public.batch_accommodation_types enable row level security;
alter table public.course_catalog_sync_runs enable row level security;

-- Pre-115949 read posture. The real migration adds organization membership.
create policy accommodation_properties_read
  on public.accommodation_properties
  for select to authenticated
  using (public.is_crm_user());
create policy accommodation_rooms_read
  on public.accommodation_rooms
  for select to authenticated
  using (public.is_crm_user());
create policy batch_accommodation_types_read
  on public.batch_accommodation_types
  for select to authenticated
  using (public.is_crm_user());
create policy course_catalog_sync_runs_read
  on public.course_catalog_sync_runs
  for select to authenticated
  using (public.is_crm_user());

-- Pre-120616 mutation posture. The later migration adds tenant mutation checks.
create policy accommodation_properties_insert
  on public.accommodation_properties
  for insert to authenticated
  with check (public.can_write_crm());
create policy accommodation_properties_update
  on public.accommodation_properties
  for update to authenticated
  using (public.can_write_crm())
  with check (public.can_write_crm());
create policy accommodation_rooms_insert
  on public.accommodation_rooms
  for insert to authenticated
  with check (public.can_write_crm());
create policy accommodation_rooms_update
  on public.accommodation_rooms
  for update to authenticated
  using (public.can_write_crm())
  with check (public.can_write_crm());
create policy batch_accommodation_types_insert
  on public.batch_accommodation_types
  for insert to authenticated
  with check (public.can_write_crm());
create policy batch_accommodation_types_update
  on public.batch_accommodation_types
  for update to authenticated
  using (public.can_write_crm())
  with check (public.can_write_crm());

create trigger accommodation_properties_set_updated_at
before update on public.accommodation_properties
for each row execute function public.set_updated_at();

create trigger accommodation_rooms_set_updated_at
before update on public.accommodation_rooms
for each row execute function public.set_updated_at();

create trigger batch_accommodation_types_set_updated_at
before update on public.batch_accommodation_types
for each row execute function public.set_updated_at();

revoke all on public.accommodation_properties from public, anon;
revoke all on public.accommodation_rooms from public, anon;
revoke all on public.batch_accommodation_types from public, anon;
revoke all on public.course_catalog_sync_runs from public, anon;

grant select, insert, update on public.accommodation_properties to authenticated;
grant select, insert, update on public.accommodation_rooms to authenticated;
grant select, insert, update on public.batch_accommodation_types to authenticated;
grant select on public.course_catalog_sync_runs to authenticated;

grant all on public.accommodation_properties to service_role;
grant all on public.accommodation_rooms to service_role;
grant all on public.batch_accommodation_types to service_role;
grant all on public.course_catalog_sync_runs to service_role;

commit;
