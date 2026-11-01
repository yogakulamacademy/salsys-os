-- R11-P1 — Education product-surface authorization V1
--
-- Scope:
-- - privileged education-operations access helper;
-- - preserve the public Course Management RPC signature while moving its proven
--   large aggregator behind a capability/role guard;
-- - harden the existing short Admissions snapshot entry point in place.
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

commit;
