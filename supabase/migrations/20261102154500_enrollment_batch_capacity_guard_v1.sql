-- Authoritative capacity guard for batches that explicitly configure a positive capacity.
-- NULL/0 preserve the existing `capacity_not_set` product semantics.
-- `seats_remaining` remains a published/manual planning field and is not used as truth.

create or replace function public.assert_batch_capacity_v1(
  p_organization_id uuid,
  p_batch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capacity integer;
  v_occupied bigint;
begin
  if p_organization_id is null or p_batch_id is null then
    return;
  end if;

  -- Serialize every seat-producing change for the same batch. The row lock is
  -- held until the outer transaction commits/rolls back.
  select cb.capacity
  into v_capacity
  from public.course_batches cb
  where cb.id = p_batch_id
    and cb.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Enrollment batch tenant mismatch';
  end if;

  -- Existing Admissions semantics treat NULL and zero as capacity-not-set.
  if v_capacity is null or v_capacity <= 0 then
    return;
  end if;

  -- Mirror v_batch_enrolled_leads exactly: the latest canonical enrollment for
  -- a lead/batch wins; confirmed/completed consume one seat. A legacy lead-stage
  -- fallback consumes a seat only when no canonical enrollment exists.
  with latest as (
    select distinct on (e.organization_id, e.lead_id, e.batch_id)
      e.organization_id,
      e.lead_id,
      e.batch_id,
      e.status::text as enrollment_status
    from public.enrollments e
    where e.organization_id = p_organization_id
      and e.batch_id = p_batch_id
    order by
      e.organization_id,
      e.lead_id,
      e.batch_id,
      e.created_at desc,
      e.updated_at desc
  ), occupied as (
    select le.lead_id
    from latest le
    where le.enrollment_status in ('confirmed','completed')

    union

    select l.id
    from public.leads l
    where l.organization_id = p_organization_id
      and l.preferred_batch_id = p_batch_id
      and l.current_stage = 'enrolled'::public.lead_stage
      and l.status <> 'archived'::public.lead_status
      and not exists (
        select 1
        from latest le
        where le.organization_id = l.organization_id
          and le.lead_id = l.id
          and le.batch_id = l.preferred_batch_id
      )
  )
  select count(*)::bigint
  into v_occupied
  from occupied;

  if coalesce(v_occupied, 0) > v_capacity then
    raise exception 'Batch capacity exceeded: % occupied seats for capacity %',
      v_occupied, v_capacity;
  end if;
end;
$function$;

revoke all on function public.assert_batch_capacity_v1(uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.enforce_enrollment_batch_capacity_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.batch_id is not null then
      perform public.assert_batch_capacity_v1(new.organization_id, new.batch_id);
    end if;
    return new;
  end if;

  -- For updates that may move the enrollment, validate both affected batches.
  -- Lock order is deterministic to avoid A->B / B->A deadlocks.
  if old.batch_id is not null
     and new.batch_id is not null
     and old.batch_id is distinct from new.batch_id then
    if old.batch_id < new.batch_id then
      perform public.assert_batch_capacity_v1(old.organization_id, old.batch_id);
      perform public.assert_batch_capacity_v1(new.organization_id, new.batch_id);
    else
      perform public.assert_batch_capacity_v1(new.organization_id, new.batch_id);
      perform public.assert_batch_capacity_v1(old.organization_id, old.batch_id);
    end if;
  elsif old.batch_id is not null
        and (new.batch_id is null
          or old.organization_id is distinct from new.organization_id) then
    perform public.assert_batch_capacity_v1(old.organization_id, old.batch_id);
    if new.batch_id is not null then
      perform public.assert_batch_capacity_v1(new.organization_id, new.batch_id);
    end if;
  elsif new.batch_id is not null then
    perform public.assert_batch_capacity_v1(new.organization_id, new.batch_id);
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_enrollment_batch_capacity_v1()
  from public, anon, authenticated, service_role;

create or replace function public.enforce_lead_batch_capacity_fallback_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- The fallback is only a seat when the lead is explicitly marked enrolled,
  -- points to a batch, is not archived, and has no canonical enrollment there.
  if new.preferred_batch_id is not null
     and new.current_stage = 'enrolled'::public.lead_stage
     and new.status <> 'archived'::public.lead_status then
    perform public.assert_batch_capacity_v1(
      new.organization_id,
      new.preferred_batch_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_lead_batch_capacity_fallback_v1()
  from public, anon, authenticated, service_role;

-- AFTER triggers see the final row state. If the guard raises, PostgreSQL rolls
-- the entire statement/outer event transaction back; no partial enrollment or
-- lead-stage change survives.
drop trigger if exists enforce_enrollment_batch_capacity_v1 on public.enrollments;
create trigger enforce_enrollment_batch_capacity_v1
after insert or update of organization_id, lead_id, batch_id, status, created_at, updated_at
on public.enrollments
for each row execute function public.enforce_enrollment_batch_capacity_v1();

drop trigger if exists enforce_lead_batch_capacity_fallback_v1 on public.leads;
create trigger enforce_lead_batch_capacity_fallback_v1
after insert or update of organization_id, preferred_batch_id, current_stage, status
on public.leads
for each row execute function public.enforce_lead_batch_capacity_fallback_v1();
