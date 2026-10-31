create or replace function public.can_administer_organization_crm(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $$
  select
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.session_is_bound_to_organization(p_organization_id)
      and public.has_organization_role(
        p_organization_id,
        array['owner','admin','manager']::text[]
      )
    );
$$;
