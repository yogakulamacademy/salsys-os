-- Production ledger recovery: 20261014133212_tenant_scope_derived_accommodation_policies
--
-- This migration exists in the live production ledger but its source file is
-- absent from the repository. The statements below reproduce that recorded
-- tenant-policy boundary for ephemeral clean replay only.

begin;

drop policy if exists batch_accommodation_room_pool_read on public.batch_accommodation_room_pool;
drop policy if exists batch_accommodation_room_pool_insert on public.batch_accommodation_room_pool;
drop policy if exists batch_accommodation_room_pool_update on public.batch_accommodation_room_pool;

create policy batch_accommodation_room_pool_read
on public.batch_accommodation_room_pool
for select
to authenticated
using (
  public.is_crm_user()
  and exists (
    select 1
    from public.course_batches cb
    join public.batch_accommodation_types bat
      on bat.id = batch_accommodation_room_pool.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = cb.organization_id
    join public.accommodation_rooms ar
      on ar.id = batch_accommodation_room_pool.room_id
     and ar.organization_id = cb.organization_id
    where cb.id = batch_accommodation_room_pool.batch_id
      and public.is_organization_member(cb.organization_id)
  )
);

create policy batch_accommodation_room_pool_insert
on public.batch_accommodation_room_pool
for insert
to authenticated
with check (
  public.can_write_crm()
  and exists (
    select 1
    from public.course_batches cb
    join public.batch_accommodation_types bat
      on bat.id = batch_accommodation_room_pool.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = cb.organization_id
    join public.accommodation_rooms ar
      on ar.id = batch_accommodation_room_pool.room_id
     and ar.organization_id = cb.organization_id
    where cb.id = batch_accommodation_room_pool.batch_id
      and public.can_mutate_organization(cb.organization_id)
  )
);

create policy batch_accommodation_room_pool_update
on public.batch_accommodation_room_pool
for update
to authenticated
using (
  public.can_write_crm()
  and exists (
    select 1
    from public.course_batches cb
    join public.batch_accommodation_types bat
      on bat.id = batch_accommodation_room_pool.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = cb.organization_id
    join public.accommodation_rooms ar
      on ar.id = batch_accommodation_room_pool.room_id
     and ar.organization_id = cb.organization_id
    where cb.id = batch_accommodation_room_pool.batch_id
      and public.can_mutate_organization(cb.organization_id)
  )
)
with check (
  public.can_write_crm()
  and exists (
    select 1
    from public.course_batches cb
    join public.batch_accommodation_types bat
      on bat.id = batch_accommodation_room_pool.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = cb.organization_id
    join public.accommodation_rooms ar
      on ar.id = batch_accommodation_room_pool.room_id
     and ar.organization_id = cb.organization_id
    where cb.id = batch_accommodation_room_pool.batch_id
      and public.can_mutate_organization(cb.organization_id)
  )
);

drop policy if exists enrollment_accommodation_assignments_read on public.enrollment_accommodation_assignments;
drop policy if exists enrollment_accommodation_assignments_insert on public.enrollment_accommodation_assignments;
drop policy if exists enrollment_accommodation_assignments_update on public.enrollment_accommodation_assignments;

create policy enrollment_accommodation_assignments_read
on public.enrollment_accommodation_assignments
for select
to authenticated
using (
  public.is_crm_user()
  and exists (
    select 1
    from public.enrollments e
    join public.course_batches cb
      on cb.id = enrollment_accommodation_assignments.batch_id
     and cb.organization_id = e.organization_id
    join public.batch_accommodation_types bat
      on bat.id = enrollment_accommodation_assignments.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = e.organization_id
    where e.id = enrollment_accommodation_assignments.enrollment_id
      and public.is_organization_member(e.organization_id)
  )
);

create policy enrollment_accommodation_assignments_insert
on public.enrollment_accommodation_assignments
for insert
to authenticated
with check (
  public.can_write_crm()
  and exists (
    select 1
    from public.enrollments e
    join public.course_batches cb
      on cb.id = enrollment_accommodation_assignments.batch_id
     and cb.organization_id = e.organization_id
    join public.batch_accommodation_types bat
      on bat.id = enrollment_accommodation_assignments.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = e.organization_id
    where e.id = enrollment_accommodation_assignments.enrollment_id
      and public.can_mutate_organization(e.organization_id)
  )
);

create policy enrollment_accommodation_assignments_update
on public.enrollment_accommodation_assignments
for update
to authenticated
using (
  public.can_write_crm()
  and exists (
    select 1
    from public.enrollments e
    join public.course_batches cb
      on cb.id = enrollment_accommodation_assignments.batch_id
     and cb.organization_id = e.organization_id
    join public.batch_accommodation_types bat
      on bat.id = enrollment_accommodation_assignments.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = e.organization_id
    where e.id = enrollment_accommodation_assignments.enrollment_id
      and public.can_mutate_organization(e.organization_id)
  )
)
with check (
  public.can_write_crm()
  and exists (
    select 1
    from public.enrollments e
    join public.course_batches cb
      on cb.id = enrollment_accommodation_assignments.batch_id
     and cb.organization_id = e.organization_id
    join public.batch_accommodation_types bat
      on bat.id = enrollment_accommodation_assignments.accommodation_type_id
     and bat.batch_id = cb.id
     and bat.organization_id = e.organization_id
    where e.id = enrollment_accommodation_assignments.enrollment_id
      and public.can_mutate_organization(e.organization_id)
  )
);

commit;
