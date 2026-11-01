-- R11-P0 Education / Wellness Vertical Pack — Capability + Security Foundation V1
--
-- Scope:
-- - canonical product capability catalog/state, separate from functional workspaces;
-- - fail-closed capability dependency enforcement;
-- - tenant-safe capability read helper and service-role-only mutation boundary;
-- - explicit Yogakulam capability activation by stable organization slug;
-- - capability-aware course-management authorization;
-- - least-privilege authenticated courses/course_batches grants;
-- - authenticated access restored only to hardened explicit-org V2 batch-admin RPCs.
--
-- Non-goals:
-- - no navigation/UI gating (R11-P1);
-- - no course-catalog adapter refactor (R11-P2);
-- - no residential UI/workflow changes (R11-P3);
-- - no billing/subscription/entitlement logic (R13);
-- - no synthetic course, batch, enrollment or second-tenant business data.

begin;

-- =============================================================================
-- 1. PRODUCT CAPABILITY CATALOG
-- =============================================================================

create table if not exists public.capability_catalog (
  code text primary key,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  sort_order integer not null default 100,
  config_schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capability_catalog_code_check
    check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint capability_catalog_status_check
    check (status in ('active','inactive')),
  constraint capability_catalog_schema_version_check
    check (config_schema_version >= 1)
);

create unique index if not exists capability_catalog_name_unique
  on public.capability_catalog(lower(name));

create trigger capability_catalog_set_updated_at
before update on public.capability_catalog
for each row
execute function public.set_updated_at();

insert into public.capability_catalog (
  code,
  name,
  description,
  status,
  sort_order,
  config_schema_version
)
values
  (
    'education_core',
    'Education Core',
    'Courses, batches, admissions capacity/demand and education-specific product controls.',
    'active',
    10,
    1
  ),
  (
    'wellness_residential',
    'Wellness / Residential',
    'Optional residential accommodation and wellness-specific operational extensions. Requires Education Core.',
    'active',
    20,
    1
  ),
  (
    'education_catalog_sync',
    'Education Catalog Sync',
    'Optional external education catalog synchronization. Requires Education Core.',
    'active',
    30,
    1
  )
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  sort_order = excluded.sort_order,
  config_schema_version = excluded.config_schema_version;

alter table public.capability_catalog enable row level security;

drop policy if exists capability_catalog_authenticated_select
  on public.capability_catalog;
create policy capability_catalog_authenticated_select
  on public.capability_catalog
  for select
  to authenticated
  using (true);

revoke all on table public.capability_catalog from public, anon, authenticated;
grant select on table public.capability_catalog to authenticated;
grant all on table public.capability_catalog to service_role;

comment on table public.capability_catalog is
'R11+ global product capability catalog. Functional workspaces remain separate. Capability configuration is not a billing entitlement model.';

-- =============================================================================
-- 2. ORGANIZATION CAPABILITY STATE
-- =============================================================================

create table if not exists public.organization_capabilities (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_code text not null references public.capability_catalog(code) on delete restrict,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  enabled_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, capability_code),
  constraint organization_capabilities_config_object_check
    check (jsonb_typeof(config) = 'object'),
  constraint organization_capabilities_config_size_check
    check (octet_length(config::text) <= 16384),
  constraint organization_capabilities_enabled_at_check
    check (
      (enabled = true and enabled_at is not null)
      or (enabled = false and enabled_at is null)
    )
);

create index if not exists idx_organization_capabilities_enabled
  on public.organization_capabilities(capability_code, organization_id)
  where enabled = true;

create trigger organization_capabilities_set_updated_at
before update on public.organization_capabilities
for each row
execute function public.set_updated_at();

alter table public.organization_capabilities enable row level security;

drop policy if exists organization_capabilities_member_select
  on public.organization_capabilities;
create policy organization_capabilities_member_select
  on public.organization_capabilities
  for select
  to authenticated
  using (
    public.session_is_bound_to_organization(organization_id)
    and public.is_organization_member(organization_id)
  );

revoke all on table public.organization_capabilities from public, anon, authenticated;
grant select on table public.organization_capabilities to authenticated;
grant all on table public.organization_capabilities to service_role;

comment on table public.organization_capabilities is
'R11+ tenant-scoped product capability state. Config is non-secret product configuration only. Mutation is restricted to trusted service/server boundaries.';

-- =============================================================================
-- 3. FAIL-CLOSED CAPABILITY DEPENDENCIES
-- =============================================================================

create or replace function public.enforce_organization_capability_dependencies_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
  v_capability_code text;
  v_enabled boolean;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id
       or new.capability_code <> old.capability_code then
      raise exception 'CAPABILITY_IDENTITY_IMMUTABLE';
    end if;
  end if;

  v_organization_id := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  v_capability_code := case when tg_op = 'DELETE' then old.capability_code else new.capability_code end;
  v_enabled := case when tg_op = 'DELETE' then false else new.enabled end;

  if v_enabled
     and v_capability_code in ('wellness_residential','education_catalog_sync')
     and not exists (
       select 1
       from public.organization_capabilities oc
       where oc.organization_id = v_organization_id
         and oc.capability_code = 'education_core'
         and oc.enabled = true
     ) then
    raise exception 'CAPABILITY_DEPENDENCY_REQUIRED: education_core';
  end if;

  if v_capability_code = 'education_core'
     and (
       tg_op = 'DELETE'
       or (tg_op = 'UPDATE' and old.enabled = true and new.enabled = false)
     )
     and exists (
       select 1
       from public.organization_capabilities oc
       where oc.organization_id = v_organization_id
         and oc.capability_code in ('wellness_residential','education_catalog_sync')
         and oc.enabled = true
     ) then
    raise exception 'CAPABILITY_DEPENDENTS_ENABLED';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.enforce_organization_capability_dependencies_v1()
  from public, anon, authenticated;

create trigger organization_capabilities_enforce_dependencies
before insert or update or delete on public.organization_capabilities
for each row
execute function public.enforce_organization_capability_dependencies_v1();

-- =============================================================================
-- 4. TENANT-SAFE CAPABILITY READ HELPER
-- =============================================================================

create or replace function public.organization_has_capability(
  p_organization_id uuid,
  p_capability_code text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    p_organization_id is not null
    and nullif(lower(btrim(coalesce(p_capability_code,''))), '') is not null
    and (
      auth.role() = 'service_role'
      or (
        auth.role() = 'authenticated'
        and public.session_is_bound_to_organization(p_organization_id)
        and public.is_organization_member(p_organization_id)
      )
    )
    and exists (
      select 1
      from public.organizations o
      join public.organization_capabilities oc
        on oc.organization_id = o.id
       and oc.capability_code = lower(btrim(p_capability_code))
       and oc.enabled = true
      join public.capability_catalog cc
        on cc.code = oc.capability_code
       and cc.status = 'active'
      where o.id = p_organization_id
        and o.status = 'active'
    );
$$;

revoke all on function public.organization_has_capability(uuid,text)
  from public, anon, authenticated;
grant execute on function public.organization_has_capability(uuid,text)
  to authenticated, service_role;

comment on function public.organization_has_capability(uuid,text) is
'R11 tenant-safe product capability check. Authenticated callers must be bound members of the explicit organization; service_role may evaluate explicit organizations. Unknown, inactive or disabled capabilities return false.';

-- =============================================================================
-- 5. TRUSTED CAPABILITY MUTATION BOUNDARY
-- =============================================================================

create or replace function public.set_organization_capability_v1(
  p_organization_id uuid,
  p_capability_code text,
  p_enabled boolean,
  p_config jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_capability_code text := lower(btrim(coalesce(p_capability_code,'')));
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_row public.organization_capabilities%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'CAPABILITY_SERVICE_ROLE_REQUIRED';
  end if;

  if p_organization_id is null or v_capability_code = '' or p_enabled is null then
    raise exception 'CAPABILITY_ARGUMENTS_REQUIRED';
  end if;

  if jsonb_typeof(v_config) <> 'object' or octet_length(v_config::text) > 16384 then
    raise exception 'CAPABILITY_CONFIG_INVALID';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status = 'active'
  ) then
    raise exception 'CAPABILITY_ORGANIZATION_NOT_ACTIVE';
  end if;

  if not exists (
    select 1
    from public.capability_catalog cc
    where cc.code = v_capability_code
      and cc.status = 'active'
  ) then
    raise exception 'CAPABILITY_UNKNOWN_OR_INACTIVE';
  end if;

  insert into public.organization_capabilities (
    organization_id,
    capability_code,
    enabled,
    config,
    enabled_at,
    updated_by
  ) values (
    p_organization_id,
    v_capability_code,
    p_enabled,
    v_config,
    case when p_enabled then now() else null end,
    auth.uid()
  )
  on conflict (organization_id, capability_code)
  do update set
    enabled = excluded.enabled,
    config = excluded.config,
    enabled_at = case
      when excluded.enabled then coalesce(public.organization_capabilities.enabled_at, excluded.enabled_at)
      else null
    end,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'organization_id', v_row.organization_id,
    'capability_code', v_row.capability_code,
    'enabled', v_row.enabled,
    'config', v_row.config,
    'enabled_at', v_row.enabled_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.set_organization_capability_v1(uuid,text,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.set_organization_capability_v1(uuid,text,boolean,jsonb)
  to service_role;

comment on function public.set_organization_capability_v1(uuid,text,boolean,jsonb) is
'R11 trusted product-capability mutation boundary. Service-role only; dependency trigger fails closed. Config must contain non-secret product configuration only.';

-- =============================================================================
-- 6. EXPLICIT EXISTING-TENANT ACTIVATION
-- =============================================================================

-- Yogakulam already has real production Education usage, proven Yogakulam
-- catalog-sync history and residential batches. Preserve that behavior through
-- explicit capability state. Resolve by stable slug; never hardcode its UUID.
do $$
declare
  v_yogakulam_id uuid;
begin
  select o.id
    into strict v_yogakulam_id
  from public.organizations o
  where o.slug = 'yogakulam-academy'
    and o.status = 'active';

  insert into public.organization_capabilities (
    organization_id,
    capability_code,
    enabled,
    config,
    enabled_at,
    updated_by
  ) values (
    v_yogakulam_id,
    'education_core',
    true,
    jsonb_build_object('activation_source','r11_p0_existing_production_usage'),
    now(),
    null
  )
  on conflict (organization_id, capability_code)
  do update set
    enabled = true,
    config = public.organization_capabilities.config || excluded.config,
    enabled_at = coalesce(public.organization_capabilities.enabled_at, excluded.enabled_at),
    updated_at = now();

  insert into public.organization_capabilities (
    organization_id,
    capability_code,
    enabled,
    config,
    enabled_at,
    updated_by
  ) values
    (
      v_yogakulam_id,
      'education_catalog_sync',
      true,
      jsonb_build_object('activation_source','r11_p0_existing_catalog_sync_usage'),
      now(),
      null
    ),
    (
      v_yogakulam_id,
      'wellness_residential',
      true,
      jsonb_build_object('activation_source','r11_p0_existing_residential_usage'),
      now(),
      null
    )
  on conflict (organization_id, capability_code)
  do update set
    enabled = true,
    config = public.organization_capabilities.config || excluded.config,
    enabled_at = coalesce(public.organization_capabilities.enabled_at, excluded.enabled_at),
    updated_at = now();
end;
$$;

-- =============================================================================
-- 7. CAPABILITY-AWARE COURSE-MANAGEMENT AUTHORIZATION
-- =============================================================================

create or replace function public.can_administer_course_management(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    public.organization_has_capability(p_organization_id, 'education_core')
    and (
      auth.role() = 'service_role'
      or (
        auth.role() = 'authenticated'
        and p_organization_id is not null
        and public.session_is_bound_to_organization(p_organization_id)
        and public.has_organization_role(
          p_organization_id,
          array['owner','admin','manager']::text[]
        )
      )
    );
$$;

-- Direct table reads also fail closed when Education Core is disabled. P1 will
-- additionally gate navigation and direct page/RPC surfaces.
alter policy courses_read
  on public.courses
  using (
    public.is_crm_user()
    and public.is_organization_member(organization_id)
    and public.organization_has_capability(organization_id, 'education_core')
  );

alter policy course_batches_read
  on public.course_batches
  using (
    public.is_crm_user()
    and public.is_organization_member(organization_id)
    and public.organization_has_capability(organization_id, 'education_core')
    and exists (
      select 1
      from public.courses c
      where c.id = course_batches.course_id
        and c.organization_id = course_batches.organization_id
    )
  );

-- Existing INSERT/UPDATE/DELETE policies call can_administer_course_management,
-- so the redefined helper makes those policies capability-aware without
-- duplicating policy logic.

-- =============================================================================
-- 8. LEAST-PRIVILEGE COURSE/BATCH TABLE GRANTS
-- =============================================================================

revoke all on table public.courses from authenticated;
revoke all on table public.course_batches from authenticated;

grant select, insert, update on table public.courses to authenticated;
grant select, insert, update on table public.course_batches to authenticated;

-- =============================================================================
-- 9. RESTORE ONLY HARDENED EXPLICIT-ORG V2 RPC EXECUTION
-- =============================================================================

revoke all on function public.update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text)
  from public, anon, authenticated;
revoke all on function public.set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text)
  from public, anon, authenticated;
revoke all on function public.set_course_batch_active_state_v2(uuid,uuid,boolean)
  from public, anon, authenticated;

grant execute on function public.update_course_batch_admin_v2(uuid,uuid,integer,integer,numeric,text,text)
  to authenticated, service_role;
grant execute on function public.set_course_batch_enrollment_state_v2(uuid,uuid,boolean,text)
  to authenticated, service_role;
grant execute on function public.set_course_batch_active_state_v2(uuid,uuid,boolean)
  to authenticated, service_role;

-- Keep legacy implicit-org V1 course-admin functions unavailable to browser
-- sessions. Trusted maintenance keeps service_role access.
revoke execute on function public.update_course_batch_admin(uuid,integer,integer,integer,integer,text,numeric,text,text)
  from public, anon, authenticated;
revoke execute on function public.set_course_batch_enrollment_state(uuid,boolean,text)
  from public, anon, authenticated;
revoke execute on function public.set_course_batch_active_state(uuid,boolean)
  from public, anon, authenticated;

grant execute on function public.update_course_batch_admin(uuid,integer,integer,integer,integer,text,numeric,text,text)
  to service_role;
grant execute on function public.set_course_batch_enrollment_state(uuid,boolean,text)
  to service_role;
grant execute on function public.set_course_batch_active_state(uuid,boolean)
  to service_role;

comment on function public.can_administer_course_management(uuid) is
'Course-management mutation authority. Requires Education Core plus service_role or a bound authenticated owner/admin/manager.';

commit;
