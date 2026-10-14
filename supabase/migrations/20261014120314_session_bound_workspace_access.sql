create or replace function public.has_workspace_access(
  p_organization_id uuid,
  p_workspace_code text
)
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
        from public.organization_workspaces ow
        join public.organizations o on o.id = ow.organization_id
        where ow.organization_id = p_organization_id
          and ow.workspace_code = lower(trim(p_workspace_code))
          and ow.enabled = true
          and o.status = 'active'
          and (
            public.can_manage_organization(p_organization_id)
            or (
              ow.workspace_code <> 'admin'
              and exists (
                select 1
                from public.workspace_memberships wm
                join public.organization_members om
                  on om.organization_id = wm.organization_id
                 and om.user_id = wm.user_id
                where wm.organization_id = p_organization_id
                  and wm.workspace_code = ow.workspace_code
                  and wm.user_id = auth.uid()
                  and wm.active = true
                  and om.active = true
              )
            )
          )
      )
    );
$$;

revoke all on function public.has_workspace_access(uuid,text) from public;
revoke execute on function public.has_workspace_access(uuid,text) from anon;
revoke execute on function public.has_workspace_access(uuid,text) from authenticated;
grant execute on function public.has_workspace_access(uuid,text) to service_role;
