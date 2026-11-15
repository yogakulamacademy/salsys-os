-- Home V1: match the privileged /home and manager dashboard route boundary.
-- This is a review-only migration on the feature branch; do not apply to
-- production until the R2 security/staging acceptance matrix has passed.
--
-- IMPORTANT: Direct PostgREST RPC calls must not bypass UI role guards.
-- Tenant membership alone is insufficient for executive dashboard data.
--
-- The existing internal function remains service-role-only. The public
-- wrapper permits service workers and actively bound owner/admin/manager
-- sessions, rejecting other membership roles and other organizations.
begin;

create or replace function public.get_dashboard_snapshot(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if not (
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.has_organization_role(
        p_organization_id,
        array['owner', 'admin', 'manager']::text[]
      )
      and public.session_is_bound_to_organization(p_organization_id)
    )
  ) then
    raise exception 'not authorized for dashboard snapshot'
      using errcode = '42501';
  end if;

  return public.get_dashboard_snapshot_internal_v1(p_organization_id);
end;
$function$;

revoke all on function public.get_dashboard_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_dashboard_snapshot(uuid)
  to authenticated, service_role;

comment on function public.get_dashboard_snapshot(uuid) is
  'Privileged owner/admin/manager dashboard snapshot for the session-bound organization; service_role permitted for trusted internal calls.';

commit;
