-- R11-P1 — Education product-surface authorization V1
--
-- Scope:
-- - privileged education-operations access helper;
-- - preserve the public Course Management RPC signature while moving its proven
--   large aggregator behind a capability/role guard;
-- - harden the existing short Admissions snapshot entry point in place;
-- - prevent non-Education tenants from creating/changing Education-only Lead fields;
-- - capability-gate canonical Enrollment truth while preserving existing role rules.
--
-- UI/navigation/form gating is implemented in application code in the same P1.

begin;

create or replace function public.can_access_education_operations(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    public.organization_has_capability(p_organization_id, 'education_core')
    and (
      auth.role() = 'service_role'
      or (
        auth.role() = 'authenticated'
        and p_organization_id is not null
        and public.session_is_bound_to_organization(p_organization_id)
        and public.has_organization_role(
          p_organization_id,
          array['owner','admin','manager']::text[]
        )
      )
    );
$$;

revoke all on function public.can_access_education_operations(uuid)
  from public, anon, authenticated;
grant execute on function public.can_access_education_operations(uuid)
  to authenticated, service_role;

comment on function public.can_access_education_operations(uuid) is
'R11-P1 privileged Education workspace access. Requires education_core plus bound owner/admin/manager for authenticated callers; service_role may evaluate explicit organizations.';

-- Preserve the proven Course Management aggregator without copying its large
-- SQL body. Rename the existing function to an internal implementation, then
-- recreate the original public signature as the guarded product boundary.
alter function public.get_course_management_workspace_v2(uuid,text,text,text)
  rename to get_course_management_workspace_internal_v2;

revoke all on function public.get_course_management_workspace_internal_v2(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_course_management_workspace_internal_v2(uuid,text,text,text)
  to service_role;

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
begin
  if not public.can_access_education_operations(p_organization_id) then
    raise exception 'EDUCATION_OPERATIONS_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  return public.get_course_management_workspace_internal_v2(
    p_organization_id,
    p_query,
    p_location,
    p_state
  );
end;
$$;

revoke all on function public.get_course_management_workspace_v2(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_course_management_workspace_v2(uuid,text,text,text)
  to authenticated, service_role;

comment on function public.get_course_management_workspace_v2(uuid,text,text,text) is
'R11-P1 authenticated Course Management/Operations read boundary. Preserves the existing application signature while enforcing education_core and privileged tenant role before delegating to the internal proven aggregator.';

-- Admissions already has a compact public entry function around a larger
-- internal snapshot builder, so harden that existing entry point in place.
create or replace function public.get_admissions_snapshot(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.can_access_education_operations(p_organization_id) then
    raise exception 'EDUCATION_ADMISSIONS_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  return public.get_admissions_snapshot_internal_v1(p_organization_id);
end;
$$;

revoke all on function public.get_admissions_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admissions_snapshot(uuid)
  to authenticated, service_role;

comment on function public.get_admissions_snapshot(uuid) is
'R11-P1 authenticated Admissions management boundary. Requires education_core plus bound owner/admin/manager role.';

-- Canonical Lead truth must obey the same capability boundary even when a
-- caller forges hidden form fields or uses another application path. For a
-- non-Education organization, new Education fields are nulled. On updates,
-- existing historical Education values are preserved but cannot be changed.
create or replace function public.enforce_lead_education_capability_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.organization_id is null then
    return new;
  end if;

  if public.organization_has_capability(new.organization_id, 'education_core') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.interested_course_id := null;
    new.preferred_batch_id := null;
    new.preferred_location := null;
    new.preferred_month := null;
    new.preferred_mode := null;
  else
    new.interested_course_id := old.interested_course_id;
    new.preferred_batch_id := old.preferred_batch_id;
    new.preferred_location := old.preferred_location;
    new.preferred_month := old.preferred_month;
    new.preferred_mode := old.preferred_mode;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_lead_education_capability_v1()
  from public, anon, authenticated;

create trigger leads_enforce_education_capability
before insert or update on public.leads
for each row
execute function public.enforce_lead_education_capability_v1();

comment on function public.enforce_lead_education_capability_v1() is
'R11-P1 canonical Lead capability guard. Non-Education inserts cannot create Education preference values; updates preserve any historical values but cannot change them.';

-- Enrollment truth belongs to Education Core. Keep its existing lead-access
-- and admin/write semantics, adding capability state as an independent gate.
alter policy enrollments_read
  on public.enrollments
  using (
    public.organization_has_capability(organization_id, 'education_core')
    and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
    and exists (
      select 1 from public.leads l
      where l.id = enrollments.lead_id
        and l.organization_id = enrollments.organization_id
    )
    and (
      course_id is null
      or exists (
        select 1 from public.courses c
        where c.id = enrollments.course_id
          and c.organization_id = enrollments.organization_id
      )
    )
    and (
      batch_id is null
      or exists (
        select 1 from public.course_batches cb
        where cb.id = enrollments.batch_id
          and cb.organization_id = enrollments.organization_id
      )
    )
  );

alter policy enrollments_insert
  on public.enrollments
  with check (
    public.organization_has_capability(organization_id, 'education_core')
    and public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.leads l
      where l.id = enrollments.lead_id
        and l.organization_id = enrollments.organization_id
    )
    and (
      course_id is null
      or exists (
        select 1 from public.courses c
        where c.id = enrollments.course_id
          and c.organization_id = enrollments.organization_id
      )
    )
    and (
      batch_id is null
      or exists (
        select 1 from public.course_batches cb
        where cb.id = enrollments.batch_id
          and cb.organization_id = enrollments.organization_id
      )
    )
  );

alter policy enrollments_update
  on public.enrollments
  using (
    public.organization_has_capability(organization_id, 'education_core')
    and public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.leads l
      where l.id = enrollments.lead_id
        and l.organization_id = enrollments.organization_id
    )
  )
  with check (
    public.organization_has_capability(organization_id, 'education_core')
    and public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.leads l
      where l.id = enrollments.lead_id
        and l.organization_id = enrollments.organization_id
    )
    and (
      course_id is null
      or exists (
        select 1 from public.courses c
        where c.id = enrollments.course_id
          and c.organization_id = enrollments.organization_id
      )
    )
    and (
      batch_id is null
      or exists (
        select 1 from public.course_batches cb
        where cb.id = enrollments.batch_id
          and cb.organization_id = enrollments.organization_id
      )
    )
  );

alter policy enrollments_delete
  on public.enrollments
  using (
    public.organization_has_capability(organization_id, 'education_core')
    and public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.leads l
      where l.id = enrollments.lead_id
        and l.organization_id = enrollments.organization_id
    )
  );

commit;
