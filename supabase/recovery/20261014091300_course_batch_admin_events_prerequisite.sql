begin;

-- CI-only historical recovery prerequisite.
-- course_batch_admin_events plus can_view_all_leads() and is_crm_employee()
-- existed out-of-band before
-- 20261014091441_session_bound_tenant_mutation_policies.sql tightened tenant
-- mutation policies and referenced these objects. Production already contains
-- their hardened forms. Do not promote this file into the normal ledger.

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

create or replace function public.can_view_all_leads()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select
    auth.role() = 'service_role'
    or public.is_crm_admin();
$function$;

revoke all on function public.can_view_all_leads() from public, anon;
grant execute on function public.can_view_all_leads() to authenticated, service_role;

create or replace function public.is_crm_employee()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role in ('admissions', 'manager')
  );
$function$;

revoke all on function public.is_crm_employee() from public, anon;
grant execute on function public.is_crm_employee() to authenticated, service_role;

commit;
