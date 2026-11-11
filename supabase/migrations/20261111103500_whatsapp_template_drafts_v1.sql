-- WhatsApp Template Studio V1: separate local authoring from the Meta-synchronized send registry.
-- This migration does not open messaging policies, provider gates, or send messages.
begin;

create table if not exists public.whatsapp_template_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  created_by uuid not null,
  updated_by uuid not null,
  template_name text not null,
  language_code text not null,
  category text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  provider_template_id text,
  provider_status text,
  last_error text,
  submitted_at timestamptz,
  submission_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_template_drafts_unique_name
    unique (organization_id, whatsapp_account_id, template_name, language_code),
  constraint whatsapp_template_drafts_name_check
    check (template_name ~ '^[a-z0-9_]{1,512}$'),
  constraint whatsapp_template_drafts_language_check
    check (language_code ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  constraint whatsapp_template_drafts_category_check
    check (category in ('MARKETING', 'UTILITY')),
  constraint whatsapp_template_drafts_status_check
    check (status in ('draft', 'submitting', 'submitted', 'uncertain')),
  constraint whatsapp_template_drafts_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists whatsapp_template_drafts_org_state_idx
  on public.whatsapp_template_drafts (organization_id, whatsapp_account_id, status, updated_at desc);

create or replace function public.validate_whatsapp_template_draft_tenant_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.whatsapp_accounts wa
    where wa.id = new.whatsapp_account_id
      and wa.organization_id = new.organization_id
  ) then
    raise exception 'WhatsApp template draft account is not in organization';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_whatsapp_template_draft_tenant_v1()
  from public, anon, authenticated;
grant execute on function public.validate_whatsapp_template_draft_tenant_v1()
  to service_role;

drop trigger if exists whatsapp_template_drafts_tenant_guard
  on public.whatsapp_template_drafts;
create trigger whatsapp_template_drafts_tenant_guard
before insert or update on public.whatsapp_template_drafts
for each row execute function public.validate_whatsapp_template_draft_tenant_v1();

alter table public.whatsapp_template_drafts enable row level security;

drop policy if exists deny_client_whatsapp_template_drafts on public.whatsapp_template_drafts;
create policy deny_client_whatsapp_template_drafts
on public.whatsapp_template_drafts
for all to public using (false) with check (false);

revoke all on public.whatsapp_template_drafts from anon, authenticated;
grant all on public.whatsapp_template_drafts to service_role;

commit;
