begin;

-- CI-only historical recovery prerequisite.
-- Production already contains this table; do not promote this file into the
-- normal migration ledger. It reconstructs the pre-hardening table shape
-- required by 20261014053906_service_only_table_grant_hardening.sql.

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
  on public.crm_settings_audit(changed_at desc);

create index if not exists idx_crm_settings_audit_group_key
  on public.crm_settings_audit(setting_group, setting_key, changed_at desc);

alter table public.crm_settings_audit enable row level security;

commit;
