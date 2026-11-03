-- Cold-recovery compatibility only.
--
-- These legacy global CRM settings authorization helpers existed out-of-band
-- before tenant-aware compatibility reads began using them at 20261014060716.
-- No creator migration is present in the production ledger. Stage only in the
-- ephemeral clean replay database; never apply to current production.

begin;

create or replace function public.can_manage_crm_settings()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    session_user in ('postgres', 'supabase_admin')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role::text in ('admin', 'manager')
    );
$function$;

create or replace function public.can_read_crm_settings()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    session_user in ('postgres', 'supabase_admin')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
    );
$function$;

revoke all on function public.can_manage_crm_settings() from public, anon;
revoke all on function public.can_read_crm_settings() from public, anon;

grant execute on function public.can_manage_crm_settings() to authenticated, service_role;
grant execute on function public.can_read_crm_settings() to authenticated, service_role;

commit;
