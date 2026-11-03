-- Cold-recovery compatibility only.
--
-- Production contained two derived accommodation tables and five residential
-- read models before the recorded 20261014133212 tenant-policy hardening, but
-- their creator was never captured in the production migration ledger or the
-- source-controlled migration chain.
--
-- This reconstructs only that schema/read-model foundation for ephemeral clean
-- replay. It copies no production rows and must never be applied to production.

begin;

create table if not exists public.batch_accommodation_room_pool (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.course_batches(id) on delete cascade,
  accommodation_type_id uuid not null references public.batch_accommodation_types(id) on delete cascade,
  room_id uuid not null references public.accommodation_rooms(id) on delete restrict,
  active boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_batch_accommodation_room_pool_type
  on public.batch_accommodation_room_pool(batch_id, accommodation_type_id, active);

create unique index if not exists idx_batch_accommodation_room_pool_unique
  on public.batch_accommodation_room_pool(batch_id, room_id);

create table if not exists public.enrollment_accommodation_assignments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  batch_id uuid not null references public.course_batches(id) on delete cascade,
  accommodation_type_id uuid not null references public.batch_accommodation_types(id) on delete restrict,
  occupant_spaces integer not null default 1 check (occupant_spaces >= 1),
  status text not null default 'reserved'
    check (status in ('reserved','confirmed','released','cancelled')),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  notes text,
  assigned_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_enrollment_accommodation_batch
  on public.enrollment_accommodation_assignments(batch_id, status, accommodation_type_id);

create unique index if not exists idx_enrollment_accommodation_one_active
  on public.enrollment_accommodation_assignments(enrollment_id)
  where status in ('reserved','confirmed');

create index if not exists idx_enrollment_accommodation_type
  on public.enrollment_accommodation_assignments(accommodation_type_id, status);

alter table public.batch_accommodation_room_pool enable row level security;
alter table public.enrollment_accommodation_assignments enable row level security;

create trigger batch_accommodation_room_pool_set_updated_at
before update on public.batch_accommodation_room_pool
for each row execute function public.set_updated_at();

create trigger enrollment_accommodation_assignments_set_updated_at
before update on public.enrollment_accommodation_assignments
for each row execute function public.set_updated_at();

create trigger enrollment_accommodation_release_room
after update of status on public.enrollment_accommodation_assignments
for each row execute function public.release_physical_room_with_accommodation();

-- Keep recovery grants narrow. The later R11 migration resets authenticated
-- privileges explicitly, and service_role retains the historical mutation path.
revoke all on public.batch_accommodation_room_pool from public, anon;
revoke all on public.enrollment_accommodation_assignments from public, anon;
grant select, insert, update on public.batch_accommodation_room_pool to authenticated;
grant select, insert, update on public.enrollment_accommodation_assignments to authenticated;
grant all on public.batch_accommodation_room_pool to service_role;
grant all on public.enrollment_accommodation_assignments to service_role;

create or replace view public.v_batch_accommodation_inventory
with (security_invoker = true)
as
select
  bat.id,
  bat.batch_id,
  cb.batch_code,
  cb.location,
  cb.start_date,
  cb.end_date,
  c.id as course_id,
  c.code as course_code,
  c.name as course_name,
  bat.name,
  bat.inventory_unit,
  bat.total_units,
  bat.available_units,
  bat.occupants_per_unit,
  bat.total_units * bat.occupants_per_unit as student_capacity,
  bat.available_units * bat.occupants_per_unit as available_student_spaces,
  (bat.total_units - bat.available_units) * bat.occupants_per_unit as occupied_or_reserved_student_spaces,
  bat.notes,
  bat.sort_order,
  bat.active,
  bat.metadata,
  bat.created_at,
  bat.updated_at
from public.batch_accommodation_types bat
join public.course_batches cb on cb.id = bat.batch_id
join public.courses c on c.id = cb.course_id;

create or replace view public.v_batch_accommodation_live_inventory
with (security_invoker = true)
as
with latest_enrollment as (
  select distinct on (e.lead_id, e.batch_id)
    e.id as enrollment_id,
    e.lead_id,
    e.batch_id,
    e.status::text as enrollment_status
  from public.enrollments e
  where e.batch_id is not null
  order by e.lead_id, e.batch_id, e.created_at desc, e.updated_at desc
),
assigned as (
  select
    eaa.accommodation_type_id,
    sum(eaa.occupant_spaces) filter (
      where eaa.status in ('reserved','confirmed')
    ) as assigned_student_spaces,
    sum(eaa.occupant_spaces) filter (
      where eaa.status = 'reserved'
    ) as reserved_student_spaces,
    sum(eaa.occupant_spaces) filter (
      where eaa.status = 'confirmed'
    ) as confirmed_student_spaces,
    count(*) filter (
      where eaa.status in ('reserved','confirmed')
    ) as active_assignments
  from public.enrollment_accommodation_assignments eaa
  join latest_enrollment le on le.enrollment_id = eaa.enrollment_id
  where le.enrollment_status <> 'cancelled'
    and eaa.status in ('reserved','confirmed')
  group by eaa.accommodation_type_id
)
select
  bat.id,
  bat.batch_id,
  cb.batch_code,
  cb.location,
  cb.start_date,
  cb.end_date,
  c.id as course_id,
  c.code as course_code,
  c.name as course_name,
  bat.name,
  bat.inventory_unit,
  bat.total_units,
  bat.available_units,
  bat.occupants_per_unit,
  bat.total_units * bat.occupants_per_unit as student_capacity,
  bat.available_units * bat.occupants_per_unit as manual_available_student_spaces,
  coalesce(a.assigned_student_spaces, 0::bigint) as assigned_student_spaces,
  coalesce(a.reserved_student_spaces, 0::bigint) as reserved_student_spaces,
  coalesce(a.confirmed_student_spaces, 0::bigint) as confirmed_student_spaces,
  coalesce(a.active_assignments, 0::bigint) as active_assignments,
  greatest(
    bat.total_units * bat.occupants_per_unit - coalesce(a.assigned_student_spaces, 0::bigint),
    0::bigint
  ) as calculated_available_student_spaces,
  bat.notes,
  bat.sort_order,
  bat.active,
  bat.metadata,
  bat.created_at,
  bat.updated_at
from public.batch_accommodation_types bat
join public.course_batches cb on cb.id = bat.batch_id
join public.courses c on c.id = cb.course_id
left join assigned a on a.accommodation_type_id = bat.id;

create or replace view public.v_batch_accommodation_summary
with (security_invoker = true)
as
select
  cb.id as batch_id,
  cb.batch_code,
  count(bat.id) filter (where bat.active) as active_room_types,
  coalesce(sum(bat.total_units) filter (where bat.active), 0::bigint) as total_inventory_units,
  coalesce(sum(bat.available_units) filter (where bat.active), 0::bigint) as available_inventory_units,
  coalesce(sum(bat.total_units * bat.occupants_per_unit) filter (where bat.active), 0::bigint) as accommodation_student_capacity,
  coalesce(sum(bat.available_units * bat.occupants_per_unit) filter (where bat.active), 0::bigint) as available_student_spaces
from public.course_batches cb
left join public.batch_accommodation_types bat on bat.batch_id = cb.id
group by cb.id, cb.batch_code;

create or replace view public.v_batch_enrollment_accommodation_roster
with (security_invoker = true)
as
with latest_enrollment as (
  select distinct on (e.lead_id, e.batch_id)
    e.id as enrollment_id,
    e.lead_id,
    e.course_id,
    e.batch_id,
    e.status::text as enrollment_status,
    e.total_value,
    e.currency,
    e.enrolled_at,
    e.created_at as enrollment_created_at,
    e.updated_at as enrollment_updated_at
  from public.enrollments e
  where e.batch_id is not null
  order by e.lead_id, e.batch_id, e.created_at desc, e.updated_at desc
),
active_assignment as (
  select distinct on (eaa.enrollment_id)
    eaa.enrollment_id,
    eaa.id as accommodation_assignment_id,
    eaa.accommodation_type_id,
    eaa.occupant_spaces,
    eaa.status as accommodation_status,
    eaa.assigned_at,
    eaa.notes as accommodation_notes
  from public.enrollment_accommodation_assignments eaa
  where eaa.status in ('reserved','confirmed')
  order by eaa.enrollment_id, eaa.assigned_at desc, eaa.created_at desc
)
select
  le.enrollment_id,
  le.lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  le.enrollment_status,
  le.total_value,
  le.currency,
  le.enrolled_at,
  le.enrollment_created_at,
  le.enrollment_updated_at,
  le.batch_id,
  cb.batch_code,
  cb.location,
  cb.start_date,
  cb.end_date,
  coalesce(le.course_id, cb.course_id) as course_id,
  c.code as course_code,
  c.name as course_name,
  aa.accommodation_assignment_id,
  aa.accommodation_type_id,
  bat.name as accommodation_name,
  aa.occupant_spaces,
  aa.accommodation_status,
  aa.assigned_at,
  aa.accommodation_notes,
  aa.accommodation_assignment_id is not null as has_accommodation_assignment
from latest_enrollment le
join public.leads l on l.id = le.lead_id
join public.course_batches cb on cb.id = le.batch_id
left join public.courses c on c.id = coalesce(le.course_id, cb.course_id)
left join active_assignment aa on aa.enrollment_id = le.enrollment_id
left join public.batch_accommodation_types bat on bat.id = aa.accommodation_type_id;

create or replace view public.v_enrollment_accommodation_assignments
with (security_invoker = true)
as
select
  eaa.id as assignment_id,
  eaa.enrollment_id,
  eaa.batch_id,
  eaa.accommodation_type_id,
  eaa.occupant_spaces,
  eaa.status as assignment_status,
  eaa.assigned_at,
  eaa.released_at,
  eaa.notes,
  eaa.assigned_by,
  eaa.created_at,
  eaa.updated_at,
  e.status as enrollment_status,
  e.total_value,
  e.currency,
  e.enrolled_at,
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  cb.batch_code,
  cb.location,
  cb.start_date,
  cb.end_date,
  c.id as course_id,
  c.code as course_code,
  c.name as course_name,
  bat.name as accommodation_name,
  bat.inventory_unit,
  bat.total_units,
  bat.occupants_per_unit
from public.enrollment_accommodation_assignments eaa
join public.enrollments e on e.id = eaa.enrollment_id
join public.leads l on l.id = e.lead_id
join public.course_batches cb on cb.id = eaa.batch_id
join public.courses c on c.id = cb.course_id
join public.batch_accommodation_types bat on bat.id = eaa.accommodation_type_id;

revoke all on public.v_batch_accommodation_inventory from public, anon;
revoke all on public.v_batch_accommodation_live_inventory from public, anon;
revoke all on public.v_batch_accommodation_summary from public, anon;
revoke all on public.v_batch_enrollment_accommodation_roster from public, anon;
revoke all on public.v_enrollment_accommodation_assignments from public, anon;

grant select on public.v_batch_accommodation_inventory to authenticated, service_role;
grant select on public.v_batch_accommodation_live_inventory to authenticated, service_role;
grant select on public.v_batch_accommodation_summary to authenticated, service_role;
grant select on public.v_batch_enrollment_accommodation_roster to authenticated, service_role;
grant select on public.v_enrollment_accommodation_assignments to authenticated, service_role;

commit;
