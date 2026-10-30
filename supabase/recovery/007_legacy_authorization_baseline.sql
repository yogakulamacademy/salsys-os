-- SalsysOS cold-recovery compatibility bootstrap for the historical 007 boundary.
--
-- Purpose:
--   Migrations 001-006 define is_crm_user() and can_write_crm(), but the original
--   production database already had is_crm_admin(), can_view_lead_pii(), and
--   can_access_lead(uuid) before migration 007 was captured in source control.
--   A clean rebuild therefore needs these compatibility helpers before applying
--   migration 007. This file is NOT part of the normal production migration
--   ledger and must never be used to downgrade current production authorization.
--
-- Recovery sequence:
--   1. Apply migrations 001-006.
--   2. Apply this bootstrap.
--   3. Apply migration 007 and continue the normal migration chain.
--   4. Later recorded authorization migrations replace/harden can_access_lead().

begin;

create or replace function public.is_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role = 'admin'
    );
$function$;

revoke all on function public.is_crm_admin()
  from public, anon;
grant execute on function public.is_crm_admin()
  to authenticated, service_role;


create or replace function public.can_view_lead_pii()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or public.is_crm_admin();
$function$;

revoke all on function public.can_view_lead_pii()
  from public, anon;
grant execute on function public.can_view_lead_pii()
  to authenticated, service_role;


-- Legacy compatibility gate only.
--
-- Version 001 granted SELECT access on CRM tables to every active CRM user via
-- is_crm_user(). Migration 007 then adds tenant membership checks around every
-- can_access_lead() use; migration 008 does the same for its two uses. The later
-- Sales workspace authorization migration replaces this helper with the final
-- workspace/ownership-aware implementation.
--
-- Do not add tenant-table dependencies here: leads.organization_id does not exist
-- until migration 007 itself runs.
create or replace function public.can_access_lead(
  p_lead_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    auth.role() = 'service_role'
    or (
      p_lead_id is not null
      and public.is_crm_user()
    );
$function$;

revoke all on function public.can_access_lead(uuid)
  from public, anon;
grant execute on function public.can_access_lead(uuid)
  to authenticated, service_role;

comment on function public.can_access_lead(uuid) is
  'Cold-recovery compatibility gate reproducing the pre-workspace CRM read model; tenant checks are enforced by migrations 007/008 and later Sales RBAC replaces this function.';

commit;
