begin;

-- W8 Security/QA: these tables intentionally have RLS enabled with no direct
-- client policies. Their application access is through SECURITY DEFINER RPCs
-- or service-role server routes, so anon/authenticated do not need table grants.
-- Removing the latent grants keeps future policy changes from accidentally
-- exposing them directly.

revoke all privileges on table public.crm_settings_audit
  from anon, authenticated;

revoke all privileges on table public.organization_sites
  from anon, authenticated;

revoke all privileges on table public.whatsapp_accounts
  from anon, authenticated;

commit;
