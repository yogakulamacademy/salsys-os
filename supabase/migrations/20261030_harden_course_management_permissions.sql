create or replace function public.can_administer_course_management(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $$
  select
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and p_organization_id is not null
      and public.session_is_bound_to_organization(p_organization_id)
      and public.has_organization_role(
        p_organization_id,
        array['owner','admin','manager']::text[]
      )
    );
$$;

drop policy if exists courses_insert on public.courses;
create policy courses_insert on public.courses
for insert
to authenticated
with check (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
);

drop policy if exists courses_update on public.courses;
create policy courses_update on public.courses
for update
to authenticated
using (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
)
with check (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
);

drop policy if exists courses_delete on public.courses;
create policy courses_delete on public.courses
for delete
to authenticated
using (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
);

drop policy if exists course_batches_insert on public.course_batches;
create policy course_batches_insert on public.course_batches
for insert
to authenticated
with check (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
  and exists (
    select 1 from public.courses c
    where c.id = course_batches.course_id
      and c.organization_id = course_batches.organization_id
  )
);

drop policy if exists course_batches_update on public.course_batches;
create policy course_batches_update on public.course_batches
for update
to authenticated
using (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
  and exists (
    select 1 from public.courses c
    where c.id = course_batches.course_id
      and c.organization_id = course_batches.organization_id
  )
)
with check (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
  and exists (
    select 1 from public.courses c
    where c.id = course_batches.course_id
      and c.organization_id = course_batches.organization_id
  )
);

drop policy if exists course_batches_delete on public.course_batches;
create policy course_batches_delete on public.course_batches
for delete
to authenticated
using (
  public.can_administer_course_management(organization_id)
  and public.can_mutate_organization(organization_id)
  and public.is_organization_member(organization_id)
  and exists (
    select 1 from public.courses c
    where c.id = course_batches.course_id
      and c.organization_id = course_batches.organization_id
  )
);

create or replace function public.update_course_batch_admin_v2(
  p_organization_id uuid,
  p_batch_id uuid,
  p_capacity integer default null,
  p_published_seats_remaining integer default null,
  p_expected_value numeric default null,
  p_currency text default null,
  p_enrollment_note text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_enrolled bigint;
begin
  if not public.can_administer_course_management(p_organization_id) then
    raise exception 'Not authorized for selected workspace';
  end if;

  select to_jsonb(cb)
  into v_before
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id
  for update;

  if v_before is null then
    raise exception 'Batch not found in selected workspace';
  end if;

  select coalesce(cap.enrolled_count, 0)
  into v_enrolled
  from public.v_admissions_batch_capacity cap
  where cap.batch_id = p_batch_id
    and cap.organization_id = p_organization_id;

  v_enrolled := coalesce(v_enrolled, 0);

  if p_capacity is not null and p_capacity < v_enrolled then
    raise exception 'Capacity cannot be lower than the confirmed enrolled count (%)', v_enrolled;
  end if;

  if p_published_seats_remaining is not null
     and p_capacity is not null
     and p_published_seats_remaining > p_capacity then
    raise exception 'Published seats remaining cannot exceed batch capacity';
  end if;

  update public.course_batches
  set
    capacity = p_capacity,
    seats_remaining = p_published_seats_remaining,
    expected_value = p_expected_value,
    currency = nullif(upper(btrim(p_currency)), ''),
    enrollment_note = nullif(btrim(p_enrollment_note), '')
  where id = p_batch_id
    and organization_id = p_organization_id;

  select to_jsonb(cb)
  into v_after
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id;

  insert into public.course_batch_admin_events (
    organization_id,
    batch_id,
    actor_user_id,
    action,
    previous_data,
    new_data
  ) values (
    p_organization_id,
    p_batch_id,
    auth.uid(),
    'batch_details_updated',
    v_before,
    v_after
  );
end;
$$;

create or replace function public.set_course_batch_enrollment_state_v2(
  p_organization_id uuid,
  p_batch_id uuid,
  p_open boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.can_administer_course_management(p_organization_id) then
    raise exception 'Not authorized for selected workspace';
  end if;

  select to_jsonb(cb)
  into v_before
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id
  for update;

  if v_before is null then
    raise exception 'Batch not found in selected workspace';
  end if;

  update public.course_batches
  set
    enrollment_open = p_open,
    enrollment_closed_at = case when p_open then null else now() end,
    enrollment_note = case
      when nullif(btrim(p_note), '') is not null then nullif(btrim(p_note), '')
      else enrollment_note
    end
  where id = p_batch_id
    and organization_id = p_organization_id;

  select to_jsonb(cb)
  into v_after
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id;

  insert into public.course_batch_admin_events (
    organization_id,
    batch_id,
    actor_user_id,
    action,
    previous_data,
    new_data
  ) values (
    p_organization_id,
    p_batch_id,
    auth.uid(),
    case when p_open then 'enrollment_reopened' else 'enrollment_closed' end,
    v_before,
    v_after
  );
end;
$$;

create or replace function public.set_course_batch_active_state_v2(
  p_organization_id uuid,
  p_batch_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.can_administer_course_management(p_organization_id) then
    raise exception 'Not authorized for selected workspace';
  end if;

  select to_jsonb(cb)
  into v_before
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id
  for update;

  if v_before is null then
    raise exception 'Batch not found in selected workspace';
  end if;

  update public.course_batches
  set local_enabled = p_active
  where id = p_batch_id
    and organization_id = p_organization_id;

  select to_jsonb(cb)
  into v_after
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id;

  insert into public.course_batch_admin_events (
    organization_id,
    batch_id,
    actor_user_id,
    action,
    previous_data,
    new_data
  ) values (
    p_organization_id,
    p_batch_id,
    auth.uid(),
    case when p_active then 'batch_local_enabled' else 'batch_local_disabled' end,
    v_before,
    v_after
  );
end;
$$;

revoke execute on function public.update_course_batch_admin(uuid, integer, integer, integer, integer, text, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.set_course_batch_enrollment_state(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.set_course_batch_active_state(uuid, boolean) from public, anon, authenticated;
grant execute on function public.update_course_batch_admin(uuid, integer, integer, integer, integer, text, numeric, text, text) to service_role;
grant execute on function public.set_course_batch_enrollment_state(uuid, boolean, text) to service_role;
grant execute on function public.set_course_batch_active_state(uuid, boolean) to service_role;
