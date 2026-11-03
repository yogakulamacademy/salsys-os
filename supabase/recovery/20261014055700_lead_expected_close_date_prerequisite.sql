begin;

-- CI-only historical recovery prerequisite.
-- leads.expected_close_date existed out-of-band before
-- 20261014055802_tenant_scoped_crm_settings_views.sql began projecting it in
-- v_revenue_forecast. Production already contains this nullable date column.
-- Do not promote this file into the normal migration ledger.

alter table public.leads
  add column if not exists expected_close_date date;

commit;
