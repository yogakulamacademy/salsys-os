-- SalsysOS Smart Triggers: Supabase recurring scheduler foundation v1
-- Safe default: registered cron job is inert until public.automation_scheduler_settings.enabled = true.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.automation_scheduler_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  endpoint_url text not null default 'https://salsysos.com/api/automation/runtime-scheduler',
  vault_secret_name text not null default 'salsys_runtime_scheduler_cron_secret',
  request_timeout_ms integer not null default 15000 check (request_timeout_ms between 1000 and 60000),
  last_invoked_at timestamptz,
  last_request_id bigint,
  last_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.automation_scheduler_settings (id, enabled)
values (1, false)
on conflict (id) do nothing;

create table if not exists public.automation_scheduler_invocations (
  id uuid primary key default gen_random_uuid(),
  invoked_at timestamptz not null default now(),
  request_id bigint,
  outcome text not null check (outcome in ('queued','missing_secret','error')),
  detail jsonb not null default '{}'::jsonb
);

alter table public.automation_scheduler_settings enable row level security;
alter table public.automation_scheduler_invocations enable row level security;

revoke all on public.automation_scheduler_settings from anon, authenticated;
revoke all on public.automation_scheduler_invocations from anon, authenticated;

grant select, insert, update, delete on public.automation_scheduler_settings to service_role;
grant select, insert, update, delete on public.automation_scheduler_invocations to service_role;

create or replace function public.invoke_automation_runtime_scheduler_v1()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_catalog
as $$
declare
  v_enabled boolean;
  v_endpoint_url text;
  v_vault_secret_name text;
  v_timeout_ms integer;
  v_secret text;
  v_request_id bigint;
begin
  select enabled, endpoint_url, vault_secret_name, request_timeout_ms
    into v_enabled, v_endpoint_url, v_vault_secret_name, v_timeout_ms
  from public.automation_scheduler_settings
  where id = 1;

  if not coalesce(v_enabled, false) then
    update public.automation_scheduler_settings
       set last_invoked_at = now(),
           last_request_id = null,
           last_outcome = 'disabled',
           updated_at = now()
     where id = 1;
    return null;
  end if;

  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = v_vault_secret_name
  order by updated_at desc
  limit 1;

  if nullif(v_secret, '') is null then
    update public.automation_scheduler_settings
       set last_invoked_at = now(),
           last_request_id = null,
           last_outcome = 'missing_secret',
           updated_at = now()
     where id = 1;

    insert into public.automation_scheduler_invocations (outcome, detail)
    values (
      'missing_secret',
      jsonb_build_object('vault_secret_name', v_vault_secret_name)
    );
    return null;
  end if;

  begin
    select net.http_get(
      url := v_endpoint_url,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_secret,
        'User-Agent', 'SalsysOS-Supabase-Scheduler/1.0'
      ),
      timeout_milliseconds := v_timeout_ms
    ) into v_request_id;

    update public.automation_scheduler_settings
       set last_invoked_at = now(),
           last_request_id = v_request_id,
           last_outcome = 'queued',
           updated_at = now()
     where id = 1;

    insert into public.automation_scheduler_invocations (request_id, outcome, detail)
    values (
      v_request_id,
      'queued',
      jsonb_build_object('endpoint_url', v_endpoint_url)
    );

    return v_request_id;
  exception when others then
    update public.automation_scheduler_settings
       set last_invoked_at = now(),
           last_request_id = null,
           last_outcome = 'error',
           updated_at = now()
     where id = 1;

    insert into public.automation_scheduler_invocations (outcome, detail)
    values (
      'error',
      jsonb_build_object('message', sqlerrm)
    );
    return null;
  end;
end;
$$;

revoke all on function public.invoke_automation_runtime_scheduler_v1() from public, anon, authenticated;
grant execute on function public.invoke_automation_runtime_scheduler_v1() to service_role;

-- Register exactly one one-minute cron. It remains inert while settings.enabled=false.
do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'salsys-automation-runtime-scheduler-v1'
  ) then
    perform cron.schedule(
      'salsys-automation-runtime-scheduler-v1',
      '* * * * *',
      'select public.invoke_automation_runtime_scheduler_v1();'
    );
  end if;
end
$$;
