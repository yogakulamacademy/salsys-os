-- Cold-recovery compatibility only.
--
-- Production created the durable WhatsApp provider-send / human-approval tables
-- in the missing Oct 16-17 Smart Triggers migration block. The normal Git
-- migration chain begins consuming them again on Oct 19. Reconstruct only the
-- durable table contract required by those later migrations; do not seed any
-- runtime request, approval, send, lead, or provider data.
--
-- This file is staged only by Migration Replay and is never part of the normal
-- production migration ledger.

begin;

create table if not exists public.automation_provider_send_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null,
  provider text not null,
  provider_send_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pilot_mode_enabled boolean not null default true,
  pilot_lead_id uuid,
  pilot_started_at timestamptz,
  pilot_max_messages integer not null default 1,
  pilot_require_verified_primary_whatsapp boolean not null default true,
  constraint automation_provider_send_settings_channel_nonempty_check
    check (nullif(btrim(channel), '') is not null),
  constraint automation_provider_send_settings_provider_nonempty_check
    check (nullif(btrim(provider), '') is not null),
  constraint automation_provider_send_settings_org_channel_provider_key
    unique (organization_id, channel, provider),
  constraint automation_provider_send_settings_pilot_max_messages_check
    check (pilot_max_messages >= 1 and pilot_max_messages <= 10)
);

create table if not exists public.automation_approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  enrollment_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  flow_version integer not null,
  node_id uuid not null,
  approval_type text not null default 'whatsapp_send',
  channel text not null default 'whatsapp',
  status text not null default 'pending',
  whatsapp_account_id uuid,
  template_name text,
  template_language text,
  request_payload jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  provider_send_audit_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_approval_requests_flow_version_check check (flow_version >= 1),
  constraint automation_approval_requests_approval_type_check check (approval_type = 'whatsapp_send'),
  constraint automation_approval_requests_channel_check check (channel = 'whatsapp'),
  constraint automation_approval_requests_status_check
    check (status in ('pending','approved','rejected','cancelled','expired'))
);

create table if not exists public.automation_provider_send_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid,
  enrollment_id uuid,
  action_run_id uuid,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null,
  provider text not null,
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  whatsapp_template_id uuid,
  request_mode text not null default 'dry_run',
  idempotency_key text not null,
  status text not null,
  policy_snapshot jsonb not null default '{}'::jsonb,
  request_payload jsonb not null default '{}'::jsonb,
  block_reasons jsonb not null default '[]'::jsonb,
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  provider_error text,
  customer_message_sent boolean not null default false,
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  crm_message_id uuid references public.messages(id) on delete set null,
  provider_delivery_status text,
  delivered_at timestamptz,
  read_at timestamptz,
  delivery_failed_at timestamptz,
  delivery_error jsonb not null default '{}'::jsonb,
  approval_request_id uuid references public.automation_approval_requests(id) on delete set null,
  constraint automation_provider_send_audits_mode_check
    check (request_mode in ('dry_run','live')),
  constraint automation_provider_send_audits_status_check
    check (status in ('blocked','dry_run','ready','sending','sent','failed','cancelled')),
  constraint automation_provider_send_audits_channel_nonempty_check
    check (nullif(btrim(channel), '') is not null),
  constraint automation_provider_send_audits_provider_nonempty_check
    check (nullif(btrim(provider), '') is not null),
  constraint automation_provider_send_audits_idempotency_nonempty_check
    check (nullif(btrim(idempotency_key), '') is not null),
  constraint automation_provider_send_audits_org_idempotency_key
    unique (organization_id, idempotency_key)
);

create index if not exists automation_provider_send_audits_org_status_idx
  on public.automation_provider_send_audits (organization_id, status, created_at desc);
create index if not exists automation_provider_send_audits_lead_idx
  on public.automation_provider_send_audits (organization_id, lead_id, created_at desc);
create index if not exists automation_approval_requests_org_status_idx
  on public.automation_approval_requests (organization_id, status, requested_at desc);

alter table public.automation_provider_send_settings enable row level security;
alter table public.automation_approval_requests enable row level security;
alter table public.automation_provider_send_audits enable row level security;

revoke all on table public.automation_provider_send_settings from public, anon, authenticated;
revoke all on table public.automation_approval_requests from public, anon, authenticated;
revoke all on table public.automation_provider_send_audits from public, anon, authenticated;

grant select, insert, update, delete on table public.automation_provider_send_settings to service_role;
grant select, insert, update, delete on table public.automation_approval_requests to service_role;
grant select, insert, update, delete on table public.automation_provider_send_audits to service_role;

commit;
