begin;

-- CI-only historical recovery prerequisite.
-- These legacy RPCs existed out-of-band before
-- 20261014054340_deprecated_course_batch_rpc_hardening.sql revoked their
-- authenticated EXECUTE privilege. Production already contains the hardened
-- functions. Do not promote this file into the normal migration ledger.
--
-- The same out-of-band batch-admin contract also depended on three residential
-- course_batches fields whose creator is absent from both source history and the
-- production migration ledger. Restore the exact live column/check contract
-- before recreating the legacy RPCs that reference it.

alter table public.course_batches
  add column if not exists accommodation_capacity integer,
  add column if not exists accommodation_remaining integer,
  add column if not exists accommodation_note text;

do $recovery$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.course_batches'::regclass
      and conname = 'course_batches_accommodation_capacity_check'
  ) then
    alter table public.course_batches
      add constraint course_batches_accommodation_capacity_check
      check (accommodation_capacity is null or accommodation_capacity >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.course_batches'::regclass
      and conname = 'course_batches_accommodation_remaining_check'
  ) then
    alter table public.course_batches
      add constraint course_batches_accommodation_remaining_check
      check (accommodation_remaining is null or accommodation_remaining >= 0);
  end if;
end;
$recovery$;

create or replace function public.set_course_batch_active_state(
  p_batch_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_organization_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.can_write_crm() then
    raise exception 'Not authorized';
  end if;

  select cb.organization_id, to_jsonb(cb)
  into v_organization_id, v_before
  from public.course_batches cb
  where cb.id = p_batch_id
  for update;

  if v_before is null then
    raise exception 'Batch not found';
  end if;

  if not public.is_organization_member(v_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  update public.course_batches
  set local_enabled = p_active
  where id = p_batch_id
    and organization_id = v_organization_id;

  select to_jsonb(cb)
  into v_after
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = v_organization_id;

  insert into public.course_batch_admin_events (
    batch_id,
    actor_user_id,
    action,
    previous_data,
    new_data
  )
  values (
    p_batch_id,
    auth.uid(),
    case
      when p_active then 'batch_local_enabled'
      else 'batch_local_disabled'
    end,
    v_before,
    v_after
  );
end;
$function$;

create or replace function public.set_course_batch_enrollment_state(
  p_batch_id uuid,
  p_open boolean,
  p_note text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_organization_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.can_write_crm() then
    raise exception 'Not authorized';
  end if;

  select cb.organization_id, to_jsonb(cb)
  into v_organization_id, v_before
  from public.course_batches cb
  where cb.id = p_batch_id
  for update;

  if v_before is null then
    raise exception 'Batch not found';
  end if;

  if not public.is_organization_member(v_organization_id) then
    raise exception 'Not authorized for this organization';
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
    and organization_id = v_organization_id;

  select to_jsonb(cb)
  into v_after
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = v_organization_id;

  insert into public.course_batch_admin_events (
    batch_id,
    actor_user_id,
    action,
    previous_data,
    new_data
  )
  values (
    p_batch_id,
    auth.uid(),
    case
      when p_open then 'enrollment_reopened'
      else 'enrollment_closed'
    end,
    v_before,
    v_after
  );
end;
$function$;

create or replace function public.update_course_batch_admin(
  p_batch_id uuid,
  p_capacity integer default null::integer,
  p_published_seats_remaining integer default null::integer,
  p_accommodation_capacity integer default null::integer,
  p_accommodation_remaining integer default null::integer,
  p_accommodation_note text default null::text,
  p_expected_value numeric default null::numeric,
  p_currency text default null::text,
  p_enrollment_note text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_organization_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_enrolled bigint;
begin
  if not public.can_write_crm() then
    raise exception 'Not authorized';
  end if;

  select cb.organization_id, to_jsonb(cb)
  into v_organization_id, v_before
  from public.course_batches cb
  where cb.id = p_batch_id
  for update;

  if v_before is null then
    raise exception 'Batch not found';
  end if;

  if not public.is_organization_member(v_organization_id) then
    raise exception 'Not authorized for this organization';
  end if;

  select coalesce(cap.enrolled_count, 0)
  into v_enrolled
  from public.v_admissions_batch_capacity cap
  where cap.batch_id = p_batch_id;

  v_enrolled := coalesce(v_enrolled, 0);

  if p_capacity is not null and p_capacity < v_enrolled then
    raise exception
      'Capacity cannot be lower than the confirmed enrolled count (%)',
      v_enrolled;
  end if;

  if p_published_seats_remaining is not null
     and p_capacity is not null
     and p_published_seats_remaining > p_capacity then
    raise exception 'Published seats remaining cannot exceed batch capacity';
  end if;

  if p_accommodation_remaining is not null
     and p_accommodation_capacity is not null
     and p_accommodation_remaining > p_accommodation_capacity then
    raise exception 'Accommodation remaining cannot exceed accommodation capacity';
  end if;

  update public.course_batches
  set
    capacity = p_capacity,
    seats_remaining = p_published_seats_remaining,
    accommodation_capacity = p_accommodation_capacity,
    accommodation_remaining = p_accommodation_remaining,
    accommodation_note = nullif(btrim(p_accommodation_note), ''),
    expected_value = p_expected_value,
    currency = nullif(upper(btrim(p_currency)), ''),
    enrollment_note = nullif(btrim(p_enrollment_note), '')
  where id = p_batch_id
    and organization_id = v_organization_id;

  select to_jsonb(cb)
  into v_after
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = v_organization_id;

  insert into public.course_batch_admin_events (
    batch_id,
    actor_user_id,
    action,
    previous_data,
    new_data
  )
  values (
    p_batch_id,
    auth.uid(),
    'batch_details_updated',
    v_before,
    v_after
  );
end;
$function$;

commit;