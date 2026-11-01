-- R11-P1 — Education product-surface authorization V1
--
-- Scope:
-- - privileged education-operations access helper;
-- - narrow authenticated wrappers for Course Management + Admissions snapshots;
-- - retire broad authenticated access to the previous SECURITY DEFINER entry points.
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

-- Keep the large proven Course Management aggregator intact behind a smaller
-- product-surface authorization wrapper rather than duplicating its SQL.
create or replace function public.get_course_management_workspace_v3(
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

  return public.get_course_management_workspace_v2(
    p_organization_id,
    p_query,
    p_location,
    p_state
  );
end;
$$;

revoke all on function public.get_course_management_workspace_v3(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_course_management_workspace_v3(uuid,text,text,text)
  to authenticated, service_role;

-- The older V2 function remains available to trusted server/service paths only.
-- Authenticated product traffic must pass through V3 capability + role checks.
revoke execute on function public.get_course_management_workspace_v2(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_course_management_workspace_v2(uuid,text,text,text)
  to service_role;

comment on function public.get_course_management_workspace_v3(uuid,text,text,text) is
'R11-P1 authenticated Course Management/Operations read boundary. Enforces education_core and privileged tenant role before delegating to the proven V2 aggregator.';

-- Admissions receives the same product-surface boundary. Keep the proven
-- internal snapshot builder untouched and gate the authenticated entry point.
create or replace function public.get_admissions_snapshot_v2(
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

revoke all on function public.get_admissions_snapshot_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admissions_snapshot_v2(uuid)
  to authenticated, service_role;

-- The earlier authenticated snapshot function allowed any organization member.
-- Preserve it for trusted service paths, but make product traffic use V2.
revoke execute on function public.get_admissions_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_admissions_snapshot(uuid)
  to service_role;

comment on function public.get_admissions_snapshot_v2(uuid) is
'R11-P1 authenticated Admissions management boundary. Requires education_core plus bound owner/admin/manager role.';

commit;
