alter table public.automation_scheduler_settings
  add column if not exists authorization_token_sha256 text;

update public.automation_scheduler_settings s
set authorization_token_sha256 = (
  select encode(extensions.digest(v.decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets v
  where v.name = s.vault_secret_name
  order by v.updated_at desc
  limit 1
),
updated_at = now()
where s.id = 1;
