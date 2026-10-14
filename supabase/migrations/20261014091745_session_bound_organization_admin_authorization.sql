create or replace function public.is_organization_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and public.can_mutate_organization(p_organization_id)
      and public.has_organization_role(p_organization_id, array['admin']::text[])
    );
$$;

revoke all on function public.is_organization_admin(uuid) from public, anon;
grant execute on function public.is_organization_admin(uuid) to authenticated, service_role;
