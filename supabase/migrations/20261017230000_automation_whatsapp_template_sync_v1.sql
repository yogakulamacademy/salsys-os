-- SalsysOS WhatsApp template sync audit foundation V1.
-- Records live Meta template synchronization without enabling customer messaging.

create table if not exists public.automation_whatsapp_template_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null default 'meta_cloud_api',
  status text not null default 'running',
  pages_fetched integer not null default 0,
  templates_seen integer not null default 0,
  templates_upserted integer not null default 0,
  templates_deactivated integer not null default 0,
  provider_error text,
  provider_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint automation_whatsapp_template_sync_runs_status_check
    check (status in ('running','completed','failed')),
  constraint automation_whatsapp_template_sync_runs_counts_check
    check (pages_fetched >= 0 and templates_seen >= 0 and templates_upserted >= 0 and templates_deactivated >= 0)
);

create index if not exists automation_whatsapp_template_sync_runs_org_started_idx
  on public.automation_whatsapp_template_sync_runs (organization_id, started_at desc);

create index if not exists automation_whatsapp_template_sync_runs_account_started_idx
  on public.automation_whatsapp_template_sync_runs (organization_id, whatsapp_account_id, started_at desc);

alter table public.automation_whatsapp_template_sync_runs enable row level security;
revoke all on table public.automation_whatsapp_template_sync_runs from public;
revoke all on table public.automation_whatsapp_template_sync_runs from anon;
revoke all on table public.automation_whatsapp_template_sync_runs from authenticated;
grant select, insert, update, delete on table public.automation_whatsapp_template_sync_runs to service_role;

create or replace function public.validate_whatsapp_template_sync_tenant_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if not exists (
    select 1
    from public.whatsapp_accounts wa
    where wa.id = new.whatsapp_account_id
      and wa.organization_id = new.organization_id
  ) then
    raise exception 'WhatsApp account does not belong to organization';
  end if;

  if new.connection_id is not null and not exists (
    select 1
    from public.integration_connections ic
    where ic.id = new.connection_id
      and ic.organization_id = new.organization_id
      and ic.provider = 'whatsapp'
  ) then
    raise exception 'WhatsApp connection does not belong to organization';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_whatsapp_template_sync_tenant_v1() from public;
revoke all on function public.validate_whatsapp_template_sync_tenant_v1() from anon;
revoke all on function public.validate_whatsapp_template_sync_tenant_v1() from authenticated;

drop trigger if exists automation_whatsapp_template_sync_validate_tenant_v1
  on public.automation_whatsapp_template_sync_runs;
create trigger automation_whatsapp_template_sync_validate_tenant_v1
before insert or update on public.automation_whatsapp_template_sync_runs
for each row execute function public.validate_whatsapp_template_sync_tenant_v1();
