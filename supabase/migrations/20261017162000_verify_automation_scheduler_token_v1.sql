-- Verify scheduler bearer tokens against the secret stored in Supabase Vault
-- without returning the plaintext Vault secret to the application.

create or replace function public.verify_automation_scheduler_token_v1(p_token text)
returns boolean
language sql
security definer
set search_path = public, vault, extensions, pg_catalog
as $$
  select exists (
    select 1
    from vault.decrypted_secrets v
    join public.automation_scheduler_settings s
      on s.id = 1
     and s.vault_secret_name = v.name
    where nullif(p_token, '') is not null
      and extensions.digest(p_token, 'sha256') = extensions.digest(v.decrypted_secret, 'sha256')
  );
$$;

revoke all on function public.verify_automation_scheduler_token_v1(text) from public, anon, authenticated;
grant execute on function public.verify_automation_scheduler_token_v1(text) to service_role;
