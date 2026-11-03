-- Cold-recovery compatibility only.
--
-- These explicit-organization course-batch admin V2 RPCs existed out-of-band
-- before 20261014092425 reduced browser execution to service_role only. Their
-- creator migration is absent from the production ledger. The function bodies
-- below are the same bodies later captured by the 20261030155113 hardening
-- migration. Stage this file only in ephemeral migration replay; never apply it
-- to current production.

begin;

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
as $function$
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
$function$;

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
as $function$
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
$function$;

create or replace function public.set_course_batch_active_state_v2(
  p_organization_id uuid,
  p_batch_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
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
$function$;

revoke all on function public.update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text)
  from public, anon;
revoke all on function public.set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text)
  from public, anon;
revoke all on function public.set_course_batch_active_state_v2(uuid,uuid,boolean)
  from public, anon;

grant execute on function public.update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text)
  to authenticated, service_role;
grant execute on function public.set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text)
  to authenticated, service_role;
grant execute on function public.set_course_batch_active_state_v2(uuid,uuid,boolean)
  to authenticated, service_role;

commit;
