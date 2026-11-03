-- CI-only historical recovery prerequisite.
-- The legacy crm_settings_audit table was created out-of-band during the
-- Settings foundation work before 20261014053906 service-only grant hardening.
-- Reconstructed from saved project evidence and the live production schema.

begin;

create table if not exists public.crm_settings_audit (
  id uuid primary key default gen_random_uuid(),
  setting_group text not null,
  setting_key text not null,
  previous_value jsonb,
  new_value jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_crm_settings_audit_changed_at
  on public.crm_settings_audit (changed_at desc);

create index if not exists idx_crm_settings_audit_group_key
  on public.crm_settings_audit (setting_group, setting_key, changed_at desc);

alter table public.crm_settings_audit enable row level security;

drop policy if exists deny_direct_client_access
  on public.crm_settings_audit;
create policy deny_direct_client_access
  on public.crm_settings_audit
  for all
  to public
  using (false)
  with check (false);

commit;
