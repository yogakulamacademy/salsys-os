-- Historical replay repair.
--
-- Production already had tenant ownership on payments/enrollments before
-- migration 016, but the versioned 001-015 chain never created it. Migration
-- 016 reads enrollments.organization_id directly, so a clean replay otherwise
-- fails even though production had the prerequisite state.

begin;

alter table public.enrollments
  add column if not exists organization_id uuid;

alter table public.payments
  add column if not exists organization_id uuid;

update public.enrollments e
set organization_id = l.organization_id
from public.leads l
where l.id = e.lead_id
  and e.organization_id is null;

update public.payments p
set organization_id = l.organization_id
from public.leads l
where l.id = p.lead_id
  and p.organization_id is null;

do $$
begin
  if exists (select 1 from public.enrollments where organization_id is null) then
    raise exception '0155 abort: enrollments contains tenantless rows';
  end if;

  if exists (select 1 from public.payments where organization_id is null) then
    raise exception '0155 abort: payments contains tenantless rows';
  end if;
end
$$;

alter table public.enrollments
  alter column organization_id set not null;

alter table public.payments
  alter column organization_id set not null;

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

create index if not exists idx_enrollments_organization
  on public.enrollments(organization_id);

create index if not exists idx_payments_organization
  on public.payments(organization_id);

commit;
