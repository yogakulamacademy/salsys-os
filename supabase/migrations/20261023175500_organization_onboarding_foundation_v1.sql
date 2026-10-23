begin;

create table if not exists public.organization_onboarding (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','completed','dismissed')),
  current_step text not null default 'business'
    check (current_step in ('business','goals','website','channels','team','finish')),
  industry text,
  country_code text,
  timezone text,
  website_url text,
  goals text[] not null default '{}'::text[],
  completed_steps text[] not null default '{}'::text[],
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_onboarding_status
  on public.organization_onboarding(status);

alter table public.organization_onboarding enable row level security;

revoke all on table public.organization_onboarding from anon;
grant select, insert, update on table public.organization_onboarding to authenticated;
grant all on table public.organization_onboarding to service_role;

drop policy if exists organization_onboarding_admin_select on public.organization_onboarding;
create policy organization_onboarding_admin_select
on public.organization_onboarding
for select
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists organization_onboarding_admin_insert on public.organization_onboarding;
create policy organization_onboarding_admin_insert
on public.organization_onboarding
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists organization_onboarding_admin_update on public.organization_onboarding;
create policy organization_onboarding_admin_update
on public.organization_onboarding
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop trigger if exists organization_onboarding_set_updated_at
  on public.organization_onboarding;
create trigger organization_onboarding_set_updated_at
before update on public.organization_onboarding
for each row
execute function public.set_updated_at();

commit;
