-- PH-5.2B.1g — cold-recovery compatibility only.
-- Reconstructs the missing historical payments.organization_id contract
-- immediately after migration 016 and before migration 017_person_360.
--
-- This file is NOT part of the normal production migration ledger.
-- Do not run it against current production as a replacement for modern schema.

alter table public.payments
  add column if not exists organization_id uuid;

update public.payments p
set organization_id = l.organization_id
from public.leads l
where l.id = p.lead_id
  and p.organization_id is null;

do $$
begin
  if exists (
    select 1
    from public.payments p
    where p.organization_id is null
  ) then
    raise exception
      '017 recovery abort: payments contains rows whose organization cannot be resolved from lead_id';
  end if;
end
$$;

alter table public.payments
  alter column organization_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_organization_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_organization_id_fkey
      foreign key (organization_id)
      references public.organizations(id)
      on delete restrict;
  end if;
end
$$;
