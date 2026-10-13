begin;

-- =============================================================================
-- 054_workspace_rbac_foundation.sql
--
-- Adds the functional workspace access layer used inside each organization.
--
-- Organization / tenant remains the isolation boundary.
-- Functional workspaces are department/product surfaces inside that tenant:
--   sales, marketing, finance, reports, admin
--
-- IMPORTANT
-- - Additive foundation only; existing tenant tables and legacy role columns
--   remain unchanged for compatibility.
-- - Organization owner/admin retains access to every enabled workspace.
-- - The Admin workspace is intentionally NOT assignable through
--   workspace_memberships; it is reserved for organization owner/admin.
-- - Existing Admissions members are backfilled to Sales.
-- - Existing legacy Managers are backfilled to non-Admin workspaces so later
--   middleware migration can preserve their broad operational access.
-- =============================================================================


-- =============================================================================
-- 1. WORKSPACE CATALOG
-- =============================================================================

create table if not exists public.workspace_catalog (
  code text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_catalog_code_check
    check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  constraint workspace_catalog_status_check
    check (status in ('active', 'inactive'))
);

create unique index if not exists workspace_catalog_name_unique
  on public.workspace_catalog(lower(name));


drop trigger if exists workspace_catalog_set_updated_at
  on public.workspace_catalog;

create trigger workspace_catalog_set_updated_at
before update on public.workspace_catalog
for each row
execute function public.set_updated_at();


insert into public.workspace_catalog (
  code,
  name,
  description,
  sort_order,
  status
)
values
  (
    'sales',
    'Sales',
    'Lead conversion, admissions, pipeline, conversations and follow-ups.',
    10,
    'active'
  ),
  (
    'marketing',
    'Marketing',
    'Campaigns, paid media, attribution, SEO, analytics and tracking.',
    20,
    'active'
  ),
  (
    'finance',
    'Finance',
    'Revenue, payments and finance-facing commercial intelligence.',
    30,
    'active'
  ),
  (
    'reports',
    'Reports',
    'Management reporting, funnel analysis and cross-team performance.',
    40,
    'active'
  ),
  (
    'admin',
    'Admin',
    'Employees, integrations, organization settings, courses and system health.',
    50,
    'active'
  )
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  status = excluded.status;


-- =============================================================================
-- 2. ORGANIZATION WORKSPACES
-- =============================================================================

create table if not exists public.organization_workspaces (
  organization_id uuid not null,
  workspace_code text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, workspace_code),
  constraint organization_workspaces_organization_id_fkey
    foreign key (organization_id)
    references public.organizations(id)
    on delete cascade,
  constraint organization_workspaces_workspace_code_fkey
    foreign key (workspace_code)
    references public.workspace_catalog(code)
    on delete restrict
);

create index if not exists idx_organization_workspaces_workspace
  on public.organization_workspaces(workspace_code, organization_id);


drop trigger if exists organization_workspaces_set_updated_at
  on public.organization_workspaces;

create trigger organization_workspaces_set_updated_at
before update on public.organization_workspaces
for each row
execute function public.set_updated_at();


-- Enable the standard workspace set for every currently active organization.
insert into public.organization_workspaces (
  organization_id,
  workspace_code,
  enabled
)
select
  o.id,
  w.code,
  true
from public.organizations o
cross join public.workspace_catalog w
where o.status = 'active'
  and w.status = 'active'
on conflict (organization_id, workspace_code)
do nothing;


-- =============================================================================
-- 3. USER WORKSPACE MEMBERSHIPS
-- =============================================================================

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workspace_code text not null,
  user_id uuid not null,
  role text not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_memberships_role_check
    check (role in ('manager', 'member', 'viewer')),
  constraint workspace_memberships_admin_assignment_check
    check (workspace_code <> 'admin'),
  constraint workspace_memberships_org_workspace_fkey
    foreign key (organization_id, workspace_code)
    references public.organization_workspaces(organization_id, workspace_code)
    on delete cascade,
  constraint workspace_memberships_org_user_fkey
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade
);

create unique index if not exists workspace_memberships_org_workspace_user_unique
  on public.workspace_memberships(organization_id, workspace_code, user_id);

create index if not exists idx_workspace_memberships_user
  on public.workspace_memberships(user_id, organization_id, workspace_code)
  where active = true;

create index if not exists idx_workspace_memberships_workspace
  on public.workspace_memberships(organization_id, workspace_code, role)
  where active = true;


drop trigger if exists workspace_memberships_set_updated_at
  on public.workspace_memberships;

create trigger workspace_memberships_set_updated_at
before update on public.workspace_memberships
for each row
execute function public.set_updated_at();


-- Preserve current Admissions employee behavior by placing active Admissions
-- members into Sales as standard members.
insert into public.workspace_memberships (
  organization_id,
  workspace_code,
  user_id,
  role,
  active
)
select
  om.organization_id,
  'sales',
  om.user_id,
  'member',
  true
from public.organization_members om
join public.organization_workspaces ow
  on ow.organization_id = om.organization_id
 and ow.workspace_code = 'sales'
 and ow.enabled = true
where om.active = true
  and om.role = 'admissions'
on conflict (organization_id, workspace_code, user_id)
do nothing;


-- Preserve broad legacy Manager access while the application transitions from
-- profile-role routing to functional workspace routing. Admin is excluded by
-- design because only organization owner/admin may access that workspace.
insert into public.workspace_memberships (
  organization_id,
  workspace_code,
  user_id,
  role,
  active
)
select
  om.organization_id,
  ow.workspace_code,
  om.user_id,
  'manager',
  true
from public.organization_members om
join public.organization_workspaces ow
  on ow.organization_id = om.organization_id
 and ow.enabled = true
where om.active = true
  and om.role = 'manager'
  and ow.workspace_code <> 'admin'
on conflict (organization_id, workspace_code, user_id)
do nothing;


-- =============================================================================
-- 4. WORKSPACE AUTHORIZATION HELPERS
-- =============================================================================

create or replace function public.has_workspace_access(
  p_organization_id uuid,
  p_workspace_code text
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.organization_workspaces ow
    join public.organizations o
      on o.id = ow.organization_id
    where ow.organization_id = p_organization_id
      and ow.workspace_code = lower(trim(p_workspace_code))
      and ow.enabled = true
      and o.status = 'active'
      and (
        auth.role() = 'service_role'
        or public.can_manage_organization(p_organization_id)
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
  );
$function$;


create or replace function public.workspace_role(
  p_organization_id uuid,
  p_workspace_code text
)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_workspace_code text := lower(trim(p_workspace_code));
  v_organization_role text;
  v_workspace_role text;
begin
  if not public.has_workspace_access(
    p_organization_id,
    v_workspace_code
  ) then
    return null;
  end if;

  if auth.role() = 'service_role' then
    return 'service_role';
  end if;

  v_organization_role := public.organization_role(p_organization_id);

  if v_organization_role in ('owner', 'admin') then
    return v_organization_role;
  end if;

  select wm.role
    into v_workspace_role
  from public.workspace_memberships wm
  where wm.organization_id = p_organization_id
    and wm.workspace_code = v_workspace_code
    and wm.user_id = auth.uid()
    and wm.active = true
  limit 1;

  return v_workspace_role;
end;
$function$;


create or replace function public.can_manage_workspace(
  p_organization_id uuid,
  p_workspace_code text
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select
    auth.role() = 'service_role'
    or public.can_manage_organization(p_organization_id)
    or (
      lower(trim(p_workspace_code)) <> 'admin'
      and public.has_workspace_access(
        p_organization_id,
        p_workspace_code
      )
      and exists (
        select 1
        from public.workspace_memberships wm
        where wm.organization_id = p_organization_id
          and wm.workspace_code = lower(trim(p_workspace_code))
          and wm.user_id = auth.uid()
          and wm.active = true
          and wm.role = 'manager'
      )
    );
$function$;


revoke all on function public.has_workspace_access(uuid, text)
  from public, anon, authenticated;
revoke all on function public.workspace_role(uuid, text)
  from public, anon, authenticated;
revoke all on function public.can_manage_workspace(uuid, text)
  from public, anon, authenticated;

grant execute on function public.has_workspace_access(uuid, text)
  to authenticated, service_role;
grant execute on function public.workspace_role(uuid, text)
  to authenticated, service_role;
grant execute on function public.can_manage_workspace(uuid, text)
  to authenticated, service_role;


-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

alter table public.workspace_catalog enable row level security;
alter table public.organization_workspaces enable row level security;
alter table public.workspace_memberships enable row level security;


drop policy if exists workspace_catalog_authenticated_read
  on public.workspace_catalog;
create policy workspace_catalog_authenticated_read
on public.workspace_catalog
for select
to authenticated
using (
  public.is_crm_user()
);


drop policy if exists organization_workspaces_member_read
  on public.organization_workspaces;
create policy organization_workspaces_member_read
on public.organization_workspaces
for select
to authenticated
using (
  public.is_organization_member(organization_id)
);


drop policy if exists organization_workspaces_admin_insert
  on public.organization_workspaces;
create policy organization_workspaces_admin_insert
on public.organization_workspaces
for insert
to authenticated
with check (
  public.can_manage_organization(organization_id)
);


drop policy if exists organization_workspaces_admin_update
  on public.organization_workspaces;
create policy organization_workspaces_admin_update
on public.organization_workspaces
for update
to authenticated
using (
  public.can_manage_organization(organization_id)
)
with check (
  public.can_manage_organization(organization_id)
);


drop policy if exists organization_workspaces_admin_delete
  on public.organization_workspaces;
create policy organization_workspaces_admin_delete
on public.organization_workspaces
for delete
to authenticated
using (
  public.can_manage_organization(organization_id)
);


drop policy if exists workspace_memberships_self_or_admin_read
  on public.workspace_memberships;
create policy workspace_memberships_self_or_admin_read
on public.workspace_memberships
for select
to authenticated
using (
  (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  )
  or public.can_manage_organization(organization_id)
);


drop policy if exists workspace_memberships_admin_insert
  on public.workspace_memberships;
create policy workspace_memberships_admin_insert
on public.workspace_memberships
for insert
to authenticated
with check (
  public.can_manage_organization(organization_id)
);


drop policy if exists workspace_memberships_admin_update
  on public.workspace_memberships;
create policy workspace_memberships_admin_update
on public.workspace_memberships
for update
to authenticated
using (
  public.can_manage_organization(organization_id)
)
with check (
  public.can_manage_organization(organization_id)
);


drop policy if exists workspace_memberships_admin_delete
  on public.workspace_memberships;
create policy workspace_memberships_admin_delete
on public.workspace_memberships
for delete
to authenticated
using (
  public.can_manage_organization(organization_id)
);


-- Explicit table grants: authenticated users can only exercise operations that
-- also pass RLS; anon receives no access. service_role retains administrative
-- access for trusted server workflows.
revoke all on table public.workspace_catalog
  from anon, authenticated;
revoke all on table public.organization_workspaces
  from anon, authenticated;
revoke all on table public.workspace_memberships
  from anon, authenticated;

grant select on table public.workspace_catalog
  to authenticated;
grant select, insert, update, delete on table public.organization_workspaces
  to authenticated;
grant select, insert, update, delete on table public.workspace_memberships
  to authenticated;

grant all on table public.workspace_catalog
  to service_role;
grant all on table public.organization_workspaces
  to service_role;
grant all on table public.workspace_memberships
  to service_role;


commit;
