-- SalsysOS cold-recovery compatibility bootstrap for the historical 016 boundary.
--
-- Purpose:
--   Migration 016_journey_workspace_hardening.sql already references
--   public.enrollments.organization_id, but the recorded migration chain before
--   016 never creates that column. Production currently defines it as uuid NOT
--   NULL with no default and an organization FK.
--
-- This file is NOT part of the normal production migration ledger. It is only
-- for an isolated cold rebuild after migrations 001-015 and before migration 016.
-- Never run it against current production as a replacement for normal schema
-- migrations.

begin;

alter table public.enrollments
  add column if not exists organization_id uuid;

-- enrollment.lead_id is NOT NULL in the historical schema. Reconstruct tenant
-- ownership from the authoritative lead tenant before enforcing NOT NULL.
update public.enrollments e
set organization_id = l.organization_id
from public.leads l
where l.id = e.lead_id
  and e.organization_id is null;

-- Fail closed if a historical row cannot be assigned to its lead's tenant.
do $$
begin
  if exists (
    select 1
    from public.enrollments e
    where e.organization_id is null
  ) then
    raise exception
      '016 recovery abort: enrollments contains rows whose organization cannot be resolved from lead_id';
  end if;
end
$$;

alter table public.enrollments
  alter column organization_id set not null;

-- Match the current production tenant relationship without pulling later
-- performance indexes or later RLS policy revisions backward in history.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.enrollments'::regclass
      and conname = 'enrollments_organization_id_fkey'
  ) then
    alter table public.enrollments
      add constraint enrollments_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;

commit;
