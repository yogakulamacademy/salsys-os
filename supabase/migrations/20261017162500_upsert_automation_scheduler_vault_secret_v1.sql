-- Synchronize the Vercel CRON_SECRET into Supabase Vault from a privileged server action.
-- The function never returns the plaintext secret.

create or replace function public.upsert_automation_scheduler_vault_secret_v1(p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_name text;
  v_secret_id uuid;
begin
  if nullif(trim(p_secret), '') is null then
    raise exception 'Scheduler secret must not be empty';
  end if;

  select vault_secret_name
    into v_name
  from public.automation_scheduler_settings
  where id = 1;

  if v_name is null then
    raise exception 'Scheduler settings are missing';
  end if;

  select id
    into v_secret_id
  from vault.secrets
  where name = v_name
  order by updated_at desc
  limit 1;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret,
      v_name,
      'SalsysOS runtime scheduler authorization secret',
      null
    );
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

revoke all on function public.upsert_automation_scheduler_vault_secret_v1(text) from public, anon, authenticated;
grant execute on function public.upsert_automation_scheduler_vault_secret_v1(text) to service_role;
