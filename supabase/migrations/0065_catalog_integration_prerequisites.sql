-- Historical replay repair.
--
-- Production already had these catalog integration columns and CRM authorization
-- helpers before migration 007, but migrations 001-006 never versioned their
-- creation. Migration 007 then assumed they existed while creating tenant-scoped
-- indexes and RLS policies.
--
-- Keep this migration schema/function-only and idempotent so a clean database can
-- reproduce the pre-007 production prerequisite without changing business data.

begin;

alter table public.courses
  add column if not exists source_system text,
  add column if not exists external_course_id text;

alter table public.course_batches
  add column if not exists source_system text,
  add column if not exists external_batch_id text;

create or replace function public.is_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role = 'admin'
    );
$$;

create or replace function public.can_view_lead_pii()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    auth.role() = 'service_role'
    or public.is_crm_admin();
$$;

revoke all on function public.is_crm_admin() from public, anon;
revoke all on function public.can_view_lead_pii() from public, anon;

grant execute on function public.is_crm_admin() to authenticated, service_role;
grant execute on function public.can_view_lead_pii() to authenticated, service_role;

commit;
