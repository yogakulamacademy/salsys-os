begin;

-- W8 tenant isolation: CRM administration is a privileged cross-surface
-- capability used by settings and integration credential RPCs. Require the
-- requested organization to match the trusted authenticated tenant context
-- even while the broader session-tenant enforcement rollout flag remains off.
create or replace function public.can_administer_organization_crm(
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
        array['admin','manager']::text[]
      )
    );
$function$;

revoke all on function public.can_administer_organization_crm(uuid)
  from public, anon;
grant execute on function public.can_administer_organization_crm(uuid)
  to authenticated, service_role;

commit;
