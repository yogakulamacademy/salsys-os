-- Cold-recovery compatibility only.
--
-- Production's Oct 22 Dashboard optimization renamed the already-existing
-- tenant-aware get_dashboard_snapshot(uuid) implementation to
-- get_dashboard_snapshot_internal_v1(uuid), then recreated the public signature
-- as an authorization wrapper. The underlying pre-Nov-1 implementation is
-- restored separately from a hash-verified production-derived payload.
--
-- Never run this recovery file against current production.

begin;

revoke all on function public.get_dashboard_snapshot_internal_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_dashboard_snapshot_internal_v1(uuid)
  to service_role;

create or replace function public.get_dashboard_snapshot(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not (
    auth.role() = 'service_role'
    or public.is_organization_member(p_organization_id)
  ) then
    raise exception 'not authorized for organization' using errcode = '42501';
  end if;

  return public.get_dashboard_snapshot_internal_v1(p_organization_id);
end;
$$;

revoke all on function public.get_dashboard_snapshot(uuid)
  from public, anon;
grant execute on function public.get_dashboard_snapshot(uuid)
  to authenticated, service_role;

commit;
