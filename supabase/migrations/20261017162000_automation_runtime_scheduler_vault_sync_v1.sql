-- Securely sync the application CRON_SECRET into Supabase Vault without exposing
-- the plaintext secret to client code or storing it in normal tables.

create or replace function public.sync_automation_scheduler_vault_secret_v1(p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_name text := 'salsys_runtime_scheduler_cron_secret';
  v_secret_id uuid;
begin
  if nullif(trim(p_secret), '') is null or length(p_secret) < 32 then
    raise exception 'Scheduler secret is missing or too short';
  end if;

  select id
    into v_secret_id
  from vault.decrypted_secrets
  where name = v_name
  order by updated_at desc
  limit 1;

  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      v_name,
      'SalsysOS runtime scheduler authorization secret',
      null
    ) into v_secret_id;
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret,
      v_name,
      'SalsysOS runtime scheduler authorization secret',
      null
    );
  end if;

  return v_secret_id;
end;
$$;

revoke all on function public.sync_automation_scheduler_vault_secret_v1(text) from public, anon, authenticated;
grant execute on function public.sync_automation_scheduler_vault_secret_v1(text) to service_role;
