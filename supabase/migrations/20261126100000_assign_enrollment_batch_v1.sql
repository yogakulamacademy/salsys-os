-- Assign (or move) a paid enrolment to a batch of the same course.
-- Owner-approved write path (26 Nov 2026). Tenant-checked, audited in course_batch_admin_events,
-- and the existing enforce_enrollment_batch_capacity_v1 trigger still guards seat capacity.
create or replace function public.assign_enrollment_batch_v1(
  p_organization_id uuid,
  p_enrollment_id uuid,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_batch_course uuid;
  v_batch_active boolean;
begin
  if p_organization_id is null or p_enrollment_id is null or p_batch_id is null then
    raise exception 'Enrolment and batch are required';
  end if;

  if not public.can_administer_course_management(p_organization_id)
     or not public.can_mutate_organization(p_organization_id) then
    raise exception 'Not authorized for selected workspace';
  end if;

  select * into v_enrollment
  from public.enrollments e
  where e.id = p_enrollment_id
    and e.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Enrolment not found in selected workspace';
  end if;

  if v_enrollment.status = 'cancelled'::public.enrollment_status then
    raise exception 'A cancelled enrolment cannot be assigned to a batch';
  end if;

  select cb.course_id, cb.active
  into v_batch_course, v_batch_active
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id;

  if v_batch_course is null then
    raise exception 'Batch not found in selected workspace';
  end if;

  if v_batch_course is distinct from v_enrollment.course_id then
    raise exception 'The batch belongs to a different course than this enrolment';
  end if;

  if not coalesce(v_batch_active, false) then
    raise exception 'This batch is no longer active';
  end if;

  if v_enrollment.batch_id is not distinct from p_batch_id then
    return jsonb_build_object('enrollmentId', p_enrollment_id, 'batchId', p_batch_id, 'changed', false);
  end if;

  update public.enrollments
  set batch_id = p_batch_id
  where id = p_enrollment_id
    and organization_id = p_organization_id;

  insert into public.course_batch_admin_events (
    organization_id, batch_id, actor_user_id, action, previous_data, new_data
  ) values (
    p_organization_id,
    p_batch_id,
    auth.uid(),
    'enrollment_batch_assigned',
    jsonb_build_object('enrollment_id', p_enrollment_id, 'batch_id', v_enrollment.batch_id),
    jsonb_build_object('enrollment_id', p_enrollment_id, 'batch_id', p_batch_id)
  );

  return jsonb_build_object('enrollmentId', p_enrollment_id, 'batchId', p_batch_id, 'changed', true);
end;
$$;

revoke all on function public.assign_enrollment_batch_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_enrollment_batch_v1(uuid, uuid, uuid) to authenticated, service_role;
