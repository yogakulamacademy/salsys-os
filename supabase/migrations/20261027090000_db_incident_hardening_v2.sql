-- Production incident hardening after the 2026-10-27 Supabase restart/load event.
--
-- Goals:
-- 1. Make lead_attribution tenant identity self-healing for legacy callers that omit
--    organization_id, while rejecting any cross-tenant mismatch.
-- 2. Collapse can_access_lead() authorization into one bounded lookup path so
--    Person 360 / journey reads do not recursively re-evaluate tenant/workspace
--    helpers several times per row.
--
-- This migration does not broaden tenant access and does not change data ownership.

create or replace function public.enforce_lead_attribution_organization_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_lead_organization_id uuid;
begin
  select l.organization_id
    into v_lead_organization_id
  from public.leads l
  where l.id = new.lead_id;

  if v_lead_organization_id is null then
    raise exception 'lead_attribution requires an existing lead';
  end if;

  if new.organization_id is null then
    new.organization_id := v_lead_organization_id;
  elsif new.organization_id <> v_lead_organization_id then
    raise exception 'lead_attribution organization_id must match lead organization_id';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_lead_attribution_organization_v1()
from public, anon, authenticated;

drop trigger if exists trg_lead_attribution_enforce_organization_v1
on public.lead_attribution;

create trigger trg_lead_attribution_enforce_organization_v1
before insert or update of lead_id, organization_id
on public.lead_attribution
for each row
execute function public.enforce_lead_attribution_organization_v1();

create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_auth_role text := auth.role();
  v_uid uuid := auth.uid();
  v_tenant_org uuid;
  v_lead_org uuid;
  v_owner_user_id uuid;
  v_org_role text;
  v_workspace_role text;
begin
  if v_auth_role = 'service_role' then
    return true;
  end if;

  if v_auth_role <> 'authenticated' or v_uid is null or p_lead_id is null then
    return false;
  end if;

  -- Resolve tenant once per access check instead of through nested helper calls.
  v_tenant_org := public.current_tenant_organization_id();
  if v_tenant_org is null then
    return false;
  end if;

  select l.organization_id, l.owner_user_id
    into v_lead_org, v_owner_user_id
  from public.leads l
  where l.id = p_lead_id;

  if v_lead_org is null or v_lead_org <> v_tenant_org then
    return false;
  end if;

  select om.role
    into v_org_role
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
   and o.status = 'active'
  where om.organization_id = v_lead_org
    and om.user_id = v_uid
    and om.active = true
  limit 1;

  if v_org_role is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.organization_workspaces ow
    where ow.organization_id = v_lead_org
      and ow.workspace_code = 'sales'
      and ow.enabled = true
  ) then
    return false;
  end if;

  if v_org_role in ('owner', 'admin') then
    v_workspace_role := v_org_role;
  else
    select wm.role
      into v_workspace_role
    from public.workspace_memberships wm
    where wm.organization_id = v_lead_org
      and wm.workspace_code = 'sales'
      and wm.user_id = v_uid
      and wm.active = true
    limit 1;
  end if;

  if v_workspace_role in ('owner', 'admin', 'manager') then
    return true;
  end if;

  if v_workspace_role = 'member' and v_owner_user_id = v_uid then
    return true;
  end if;

  return false;
end;
$function$;

revoke all on function public.can_access_lead(uuid) from public, anon;
grant execute on function public.can_access_lead(uuid) to authenticated, service_role;
