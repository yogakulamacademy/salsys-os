create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
  select auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and p_organization_id is not null
      and public.session_is_bound_to_organization(p_organization_id)
      and exists (
        select 1
        from public.organization_members om
        where om.organization_id = p_organization_id
          and om.user_id = auth.uid()
          and om.active = true
      )
    );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke execute on function public.is_organization_member(uuid) from anon;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_member(uuid) to service_role;
