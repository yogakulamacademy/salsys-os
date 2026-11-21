-- Speed (owner-approved 21 Nov 2026): the leads read rule called
-- can_access_lead(id) for every row, which runs ~5 lookups per row. These two
-- functions do the same checks once per query (as init plans), with the same
-- outcome:
--   * tenant organization must match the lead's organization,
--   * the user is an active member of an active organization,
--   * the Sales workspace is enabled,
--   * owner/admin/manager see every lead, member sees only leads they own,
--     anyone else sees none.

create or replace function public.lead_scope_role()
returns text
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_org_role text;
  v_role text;
begin
  if auth.role() <> 'authenticated' or v_uid is null then
    return null;
  end if;
  v_tenant := public.current_tenant_organization_id();
  if v_tenant is null then
    return null;
  end if;
  select om.role into v_org_role
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id and o.status = 'active'
  where om.organization_id = v_tenant and om.user_id = v_uid and om.active = true
  limit 1;
  if v_org_role is null then
    return null;
  end if;
  if not exists (
    select 1 from public.organization_workspaces ow
    where ow.organization_id = v_tenant and ow.workspace_code = 'sales' and ow.enabled = true
  ) then
    return null;
  end if;
  if v_org_role in ('owner', 'admin') then
    v_role := v_org_role;
  else
    select wm.role into v_role
    from public.workspace_memberships wm
    where wm.organization_id = v_tenant and wm.workspace_code = 'sales' and wm.user_id = v_uid and wm.active = true
    limit 1;
  end if;
  if v_role in ('owner', 'admin', 'manager', 'member') then
    return v_role;
  end if;
  return null;
end;
$$;

-- The organization whose leads the user may read, or null.
create or replace function public.lead_scope_org()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case when public.lead_scope_role() is not null then public.current_tenant_organization_id() end;
$$;

revoke all on function public.lead_scope_role() from public, anon;
revoke all on function public.lead_scope_org() from public, anon;
grant execute on function public.lead_scope_role() to authenticated, service_role;
grant execute on function public.lead_scope_org() to authenticated, service_role;

-- Same outcome as can_access_lead(id) (checked for every user and session
-- against every lead before switching: 0 differences), evaluated once per query.
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads
  for select to authenticated
  using (
    organization_id = (select public.lead_scope_org())
    and (
      (select public.lead_scope_role()) in ('owner', 'admin', 'manager')
      or owner_user_id = (select auth.uid())
    )
  );
