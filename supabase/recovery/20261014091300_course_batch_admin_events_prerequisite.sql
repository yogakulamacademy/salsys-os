begin;

-- CI-only historical recovery prerequisite.
-- course_batch_admin_events existed out-of-band before
-- 20261014091441_session_bound_tenant_mutation_policies.sql tightened its
-- INSERT policy. Production already contains the hardened table/policies.
-- Do not promote this file into the normal migration ledger.

create table if not exists public.course_batch_admin_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.course_batches(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete restrict
);

create index if not exists idx_course_batch_admin_events_batch
  on public.course_batch_admin_events(batch_id, created_at desc);

create index if not exists idx_course_batch_admin_events_org_created
  on public.course_batch_admin_events(organization_id, created_at desc);

alter table public.course_batch_admin_events enable row level security;

drop trigger if exists course_batch_admin_events_set_organization
  on public.course_batch_admin_events;
create trigger course_batch_admin_events_set_organization
before insert or update of batch_id, organization_id
on public.course_batch_admin_events
for each row
execute function public.set_course_batch_admin_event_organization();

drop policy if exists course_batch_admin_events_read
  on public.course_batch_admin_events;
create policy course_batch_admin_events_read
  on public.course_batch_admin_events
  for select
  to authenticated
  using (
    public.is_crm_user()
    and public.is_organization_member(organization_id)
    and exists (
      select 1
      from public.course_batches cb
      where cb.id = course_batch_admin_events.batch_id
        and cb.organization_id = course_batch_admin_events.organization_id
    )
  );

drop policy if exists course_batch_admin_events_insert
  on public.course_batch_admin_events;
create policy course_batch_admin_events_insert
  on public.course_batch_admin_events
  for insert
  to authenticated
  with check (
    public.can_write_crm()
    and public.is_organization_member(organization_id)
    and actor_user_id = auth.uid()
    and exists (
      select 1
      from public.course_batches cb
      where cb.id = course_batch_admin_events.batch_id
        and cb.organization_id = course_batch_admin_events.organization_id
    )
  );

grant select, insert on public.course_batch_admin_events to authenticated;
grant all on public.course_batch_admin_events to service_role;

commit;
