-- Recovery-only baseline for production-ledger migration:
-- 20261017125342 automation_whatsapp_template_registry_v1
--
-- Recovered from the live production catalog for clean migration replay only.
-- This file is not part of the normal production migration chain.

begin;

create table if not exists public.automation_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  provider_template_id text,
  template_name text not null,
  language_code text not null,
  category text,
  approval_status text not null default 'unknown'::text,
  provider_status_raw text,
  parameter_schema jsonb not null default '{}'::jsonb,
  components jsonb not null default '[]'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_synced_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_whatsapp_templates_org_account_name_lang_key
    unique (organization_id, whatsapp_account_id, template_name, language_code),
  constraint automation_whatsapp_templates_name_nonempty_check
    check (nullif(btrim(template_name), ''::text) is not null),
  constraint automation_whatsapp_templates_language_nonempty_check
    check (nullif(btrim(language_code), ''::text) is not null),
  constraint automation_whatsapp_templates_status_check
    check (approval_status = any (array['unknown'::text,'pending'::text,'approved'::text,'rejected'::text,'paused'::text,'disabled'::text]))
);

create index if not exists automation_whatsapp_templates_lookup_idx
  on public.automation_whatsapp_templates
  (organization_id, whatsapp_account_id, template_name, language_code, active, approval_status);

create unique index if not exists automation_whatsapp_templates_provider_id_idx
  on public.automation_whatsapp_templates
  (organization_id, whatsapp_account_id, provider_template_id)
  where provider_template_id is not null;

create or replace function public.validate_automation_whatsapp_template_tenant_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
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

  new.template_name := btrim(new.template_name);
  new.language_code := btrim(new.language_code);
  new.approval_status := lower(btrim(new.approval_status));
  new.updated_at := now();

  if new.approval_status = 'approved' and new.approved_at is null then
    new.approved_at := now();
  end if;
  if new.approval_status = 'rejected' and new.rejected_at is null then
    new.rejected_at := now();
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_automation_whatsapp_template_tenant_v1() from public, anon, authenticated;
grant execute on function public.validate_automation_whatsapp_template_tenant_v1() to service_role;

drop trigger if exists automation_whatsapp_templates_validate_tenant_v1
  on public.automation_whatsapp_templates;
create trigger automation_whatsapp_templates_validate_tenant_v1
before insert or update on public.automation_whatsapp_templates
for each row execute function public.validate_automation_whatsapp_template_tenant_v1();

alter table public.automation_whatsapp_templates enable row level security;
drop policy if exists deny_direct_client_access on public.automation_whatsapp_templates;
create policy deny_direct_client_access
  on public.automation_whatsapp_templates
  for all
  to public
  using (false)
  with check (false);

revoke all on table public.automation_whatsapp_templates from anon, authenticated;
grant all on table public.automation_whatsapp_templates to service_role;

commit;
