begin;

-- W8 tenant isolation: organization/workspace administration must always match
-- the trusted tenant context for authenticated callers, even before the broad
-- strict-enforcement rollout flag is enabled. service_role remains trusted for
-- controlled server maintenance.
create or replace function public.can_manage_organization(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.session_is_bound_to_organization(p_organization_id)
      and public.has_organization_role(
        p_organization_id,
        array['owner','admin']::text[]
      )
    );
$function$;

revoke all on function public.can_manage_organization(uuid)
  from public, anon;
grant execute on function public.can_manage_organization(uuid)
  to authenticated, service_role;

commit;
