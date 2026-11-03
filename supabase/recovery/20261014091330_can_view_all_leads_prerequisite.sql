begin;

-- CI-only historical recovery prerequisite.
-- can_view_all_leads() existed out-of-band before
-- 20261014091441_session_bound_tenant_mutation_policies.sql referenced it in
-- leads_update. Production already contains the hardened helper.
-- Do not promote this file into the normal migration ledger.

create or replace function public.can_view_all_leads()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select
    auth.role() = 'service_role'
    or public.is_crm_admin();
$function$;

revoke all on function public.can_view_all_leads() from public, anon;
grant execute on function public.can_view_all_leads() to authenticated, service_role;

commit;
