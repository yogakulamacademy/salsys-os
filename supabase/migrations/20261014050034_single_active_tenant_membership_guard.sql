begin;

-- =============================================================================
-- 063_single_active_tenant_membership_guard.sql
--
-- W8A/W8F interim guardrail for the tenant-bound authentication migration.
-- Prevent creation of new multi-tenant active memberships while allowing the
-- existing legacy multi-membership account to be migrated in a controlled step.
-- A later cleanup migration can replace this guard with a partial unique index
-- once every normal user has exactly one active organization membership.
-- =============================================================================

create or replace function public.enforce_single_active_organization_membership()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.active then
    if exists (
      select 1
      from public.organization_members om
      where om.user_id = new.user_id
        and om.active = true
        and om.organization_id <> new.organization_id
        and om.id <> new.id
    ) then
      raise exception
        'A normal SalsysOS user can have only one active organization membership.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_single_active_organization_membership()
  from public, anon, authenticated;

drop trigger if exists trg_single_active_organization_membership
  on public.organization_members;

create trigger trg_single_active_organization_membership
before insert or update of user_id, organization_id, active
on public.organization_members
for each row
when (new.active = true)
execute function public.enforce_single_active_organization_membership();

commit;
