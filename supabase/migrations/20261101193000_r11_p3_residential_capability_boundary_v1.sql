-- R11-P3 — Optional Residential Extension Gating V1
--
-- Scope:
-- - capability-gate canonical residential tables through wellness_residential;
-- - reduce authenticated residential-table grants to SELECT/INSERT/UPDATE;
-- - keep accommodation views security-invoker and remove unnecessary anon SELECT;
-- - strip residential commercial/accommodation keys from Course Management
--   workspace payloads when wellness_residential is disabled;
-- - prevent non-residential tenants from creating/changing residential batch fields;
-- - prevent disabling wellness_residential while canonical residential data exists.
--
-- Non-goals:
-- - no new accommodation UI or inventory rows;
-- - no changes to base Education Core course/batch/admissions behavior;
-- - no billing/subscription/entitlement logic.

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonical residential-data detector used by the service-only capability
--    setter. Keep direct execution private.
-- ---------------------------------------------------------------------------
create or replace function public.organization_has_residential_data_v1(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.accommodation_properties ap
      where ap.organization_id = p_organization_id
      limit 1
    )
    or exists (
      select 1
      from public.accommodation_rooms ar
      where ar.organization_id = p_organization_id
      limit 1
    )
    or exists (
      select 1
      from public.batch_accommodation_types bat
      where bat.organization_id = p_organization_id
      limit 1
    )
    or exists (
      select 1
      from public.batch_accommodation_room_pool barp
      join public.course_batches cb on cb.id = barp.batch_id
      where cb.organization_id = p_organization_id
      limit 1
    )
    or exists (
      select 1
      from public.enrollment_accommodation_assignments eaa
      join public.enrollments e on e.id = eaa.enrollment_id
      where e.organization_id = p_organization_id
      limit 1
    )
    or exists (
      select 1
      from public.course_batches cb
      where cb.organization_id = p_organization_id
        and (
          cb.price_private is not null
          or cb.price_shared is not null
          or cb.price_course_only is not null
          or cb.accommodation_capacity is not null
          or cb.accommodation_remaining is not null
          or nullif(btrim(coalesce(cb.accommodation_note, '')), '') is not null
        )
      limit 1
    );
$$;

revoke all on function public.organization_has_residential_data_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.organization_has_residential_data_v1(uuid)
  to service_role;

comment on function public.organization_has_residential_data_v1(uuid) is
'R11-P3 internal residential-data detector. Used to prevent capability disable while canonical residential data remains.';

-- ---------------------------------------------------------------------------
-- 2. Harden the existing service-only capability setter: wellness_residential
--    cannot be disabled while residential data remains. This preserves data and
--    prevents a disabled capability from silently exposing stale values through
--    trusted service paths.
-- ---------------------------------------------------------------------------
create or replace function public.set_organization_capability_v1(
  p_organization_id uuid,
  p_capability_code text,
  p_enabled boolean,
  p_config jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_capability_code text := lower(btrim(coalesce(p_capability_code,'')));
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_row public.organization_capabilities%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'CAPABILITY_SERVICE_ROLE_REQUIRED';
  end if;

  if p_organization_id is null or v_capability_code = '' or p_enabled is null then
    raise exception 'CAPABILITY_ARGUMENTS_REQUIRED';
  end if;

  if jsonb_typeof(v_config) <> 'object' or octet_length(v_config::text) > 16384 then
    raise exception 'CAPABILITY_CONFIG_INVALID';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status = 'active'
  ) then
    raise exception 'CAPABILITY_ORGANIZATION_NOT_ACTIVE';
  end if;

  if not exists (
    select 1
    from public.capability_catalog cc
    where cc.code = v_capability_code
      and cc.status = 'active'
  ) then
    raise exception 'CAPABILITY_UNKNOWN_OR_INACTIVE';
  end if;

  if v_capability_code = 'wellness_residential'
     and p_enabled is false
     and public.organization_has_residential_data_v1(p_organization_id)
  then
    raise exception 'WELLNESS_RESIDENTIAL_DATA_PRESENT';
  end if;

  insert into public.organization_capabilities (
    organization_id,
    capability_code,
    enabled,
    config,
    enabled_at,
    updated_by
  ) values (
    p_organization_id,
    v_capability_code,
    p_enabled,
    v_config,
    case when p_enabled then now() else null end,
    auth.uid()
  )
  on conflict (organization_id, capability_code)
  do update set
    enabled = excluded.enabled,
    config = excluded.config,
    enabled_at = case
      when excluded.enabled then coalesce(public.organization_capabilities.enabled_at, excluded.enabled_at)
      else null
    end,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'organization_id', v_row.organization_id,
    'capability_code', v_row.capability_code,
    'enabled', v_row.enabled,
    'config', v_row.config,
    'enabled_at', v_row.enabled_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

-- Preserve P0 service-only mutation boundary.
revoke all on function public.set_organization_capability_v1(uuid,text,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.set_organization_capability_v1(uuid,text,boolean,jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Mixed Education/residential row guard. Base batch fields remain writable
--    under Education Core. Residential fields can be created/changed only while
--    wellness_residential is enabled. Historical values are preserved on an
--    update when capability is absent; inserts receive null residential fields.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_course_batch_residential_capability_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null then
    return new;
  end if;

  if public.organization_has_capability(new.organization_id, 'wellness_residential') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.price_private := null;
    new.price_shared := null;
    new.price_course_only := null;
    new.accommodation_capacity := null;
    new.accommodation_remaining := null;
    new.accommodation_note := null;
  else
    new.price_private := old.price_private;
    new.price_shared := old.price_shared;
    new.price_course_only := old.price_course_only;
    new.accommodation_capacity := old.accommodation_capacity;
    new.accommodation_remaining := old.accommodation_remaining;
    new.accommodation_note := old.accommodation_note;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_course_batch_residential_capability_v1()
  from public, anon, authenticated;

drop trigger if exists course_batches_enforce_residential_capability on public.course_batches;
create trigger course_batches_enforce_residential_capability
before insert or update on public.course_batches
for each row
execute function public.enforce_course_batch_residential_capability_v1();

-- ---------------------------------------------------------------------------
-- 4. Residential table RLS: retain every existing tenant/role predicate and add
--    wellness_residential as an independent gate.
-- ---------------------------------------------------------------------------
alter policy accommodation_properties_read
on public.accommodation_properties
using (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.is_crm_user()
  and public.is_organization_member(organization_id)
);

alter policy accommodation_properties_insert
on public.accommodation_properties
with check (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy accommodation_properties_update
on public.accommodation_properties
using (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
)
with check (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy accommodation_rooms_read
on public.accommodation_rooms
using (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.is_crm_user()
  and public.is_organization_member(organization_id)
);

alter policy accommodation_rooms_insert
on public.accommodation_rooms
with check (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy accommodation_rooms_update
on public.accommodation_rooms
using (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
)
with check (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy batch_accommodation_types_read
on public.batch_accommodation_types
using (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.is_crm_user()
  and public.is_organization_member(organization_id)
);

alter policy batch_accommodation_types_insert
on public.batch_accommodation_types
with check (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy batch_accommodation_types_update
on public.batch_accommodation_types
using (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
)
with check (
  public.organization_has_capability(organization_id, 'wellness_residential')
  and public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy batch_accommodation_room_pool_read
on public.batch_accommodation_room_pool
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
      and public.organization_has_capability(cb.organization_id, 'wellness_residential')
      and public.is_organization_member(cb.organization_id)
  )
);

alter policy batch_accommodation_room_pool_insert
on public.batch_accommodation_room_pool
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
      and public.organization_has_capability(cb.organization_id, 'wellness_residential')
      and public.can_mutate_organization(cb.organization_id)
  )
);

alter policy batch_accommodation_room_pool_update
on public.batch_accommodation_room_pool
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
      and public.organization_has_capability(cb.organization_id, 'wellness_residential')
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
      and public.organization_has_capability(cb.organization_id, 'wellness_residential')
      and public.can_mutate_organization(cb.organization_id)
  )
);

alter policy enrollment_accommodation_assignments_read
on public.enrollment_accommodation_assignments
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
      and public.organization_has_capability(e.organization_id, 'wellness_residential')
      and public.is_organization_member(e.organization_id)
  )
);

alter policy enrollment_accommodation_assignments_insert
on public.enrollment_accommodation_assignments
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
      and public.organization_has_capability(e.organization_id, 'wellness_residential')
      and public.can_mutate_organization(e.organization_id)
  )
);

alter policy enrollment_accommodation_assignments_update
on public.enrollment_accommodation_assignments
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
      and public.organization_has_capability(e.organization_id, 'wellness_residential')
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
      and public.organization_has_capability(e.organization_id, 'wellness_residential')
      and public.can_mutate_organization(e.organization_id)
  )
);

-- ---------------------------------------------------------------------------
-- 5. Least privilege. There is no current authenticated product delete path for
--    these residential objects; mutation RPCs remain service-role-only.
-- ---------------------------------------------------------------------------
revoke all privileges on table public.accommodation_properties from authenticated;
revoke all privileges on table public.accommodation_rooms from authenticated;
revoke all privileges on table public.batch_accommodation_types from authenticated;
revoke all privileges on table public.batch_accommodation_room_pool from authenticated;
revoke all privileges on table public.enrollment_accommodation_assignments from authenticated;

grant select, insert, update on table public.accommodation_properties to authenticated;
grant select, insert, update on table public.accommodation_rooms to authenticated;
grant select, insert, update on table public.batch_accommodation_types to authenticated;
grant select, insert, update on table public.batch_accommodation_room_pool to authenticated;
grant select, insert, update on table public.enrollment_accommodation_assignments to authenticated;

-- Views are already security_invoker=true, so authenticated SELECT now inherits
-- the gated table RLS. Anonymous direct view access is unnecessary.
revoke select on table public.v_batch_accommodation_inventory from anon;
revoke select on table public.v_batch_accommodation_live_inventory from anon;
revoke select on table public.v_batch_accommodation_summary from anon;
revoke select on table public.v_batch_enrollment_accommodation_roster from anon;
revoke select on table public.v_enrollment_accommodation_assignments from anon;

-- ---------------------------------------------------------------------------
-- 6. Mixed Course Management read model: preserve Education Core data while
--    removing residential-only keys when wellness_residential is disabled.
-- ---------------------------------------------------------------------------
create or replace function public.get_course_management_workspace_v2(
  p_organization_id uuid,
  p_query text default '',
  p_location text default 'all',
  p_state text default 'upcoming'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
  v_batches jsonb;
begin
  if not public.can_access_education_operations(p_organization_id) then
    raise exception 'EDUCATION_OPERATIONS_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  v_result := public.get_course_management_workspace_internal_v2(
    p_organization_id,
    p_query,
    p_location,
    p_state
  );

  if not public.organization_has_capability(p_organization_id, 'wellness_residential') then
    select coalesce(
      jsonb_agg(
        item
          - 'price_private'
          - 'price_shared'
          - 'price_course_only'
          - 'accommodation_capacity'
          - 'accommodation_remaining'
          - 'accommodation_note'
      ),
      '[]'::jsonb
    )
    into v_batches
    from jsonb_array_elements(coalesce(v_result->'batches', '[]'::jsonb)) item;

    v_result := jsonb_set(v_result, '{batches}', v_batches, true);
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_course_management_workspace_v2(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_course_management_workspace_v2(uuid,text,text,text)
  to authenticated, service_role;

comment on function public.get_course_management_workspace_v2(uuid,text,text,text) is
'R11-P3 Education Course Management boundary. Requires Education operations access and masks residential-only batch fields unless wellness_residential is enabled.';

commit;
