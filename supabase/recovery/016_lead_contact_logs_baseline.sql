-- SalsysOS cold-recovery compatibility bootstrap for the historical 016 boundary.
--
-- Purpose:
--   Migration 016_journey_workspace_hardening.sql reads public.lead_contact_logs,
--   but the recorded migration chain before 016 never creates that table.
--   Production still contains the table and no recorded migration alters its base
--   schema, so this file version-captures that missing historical prerequisite.
--
-- This file is NOT part of the normal production migration ledger. It is only
-- for isolated cold rebuilds after migrations 001-015 and before migration 016.
-- Never run it against current production as a replacement for normal schema
-- migrations.

begin;

create table if not exists public.lead_contact_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null
    references public.leads(id)
    on delete cascade,
  employee_user_id uuid
    references public.profiles(id)
    on delete set null,
  employee_name_snapshot text,
  method text not null,
  direction text not null,
  outcome text not null,
  contacted_at timestamptz not null default now(),
  comment text not null,
  call_duration_seconds integer,
  source text not null default 'manual'::text,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint lead_contact_logs_method_check
    check (method = any (array['whatsapp'::text,'sms'::text,'phone'::text,'email'::text,'instagram'::text,'other'::text])),
  constraint lead_contact_logs_direction_check
    check (direction = any (array['outbound'::text,'inbound'::text])),
  constraint lead_contact_logs_outcome_check
    check (outcome = any (array['attempted'::text,'sent'::text,'connected'::text,'replied'::text,'no_answer'::text,'left_message'::text,'follow_up_needed'::text,'other'::text])),
  constraint lead_contact_logs_comment_check
    check (char_length(btrim(comment)) >= 1 and char_length(btrim(comment)) <= 4000),
  constraint lead_contact_logs_call_duration_check
    check (call_duration_seconds is null or (call_duration_seconds >= 0 and call_duration_seconds <= 28800)),
  constraint lead_contact_logs_source_check
    check (source = any (array['manual'::text,'automatic'::text,'imported'::text]))
);

create index if not exists idx_lead_contact_logs_employee_time
  on public.lead_contact_logs (employee_user_id, contacted_at desc);

create index if not exists idx_lead_contact_logs_lead_time
  on public.lead_contact_logs (lead_id, contacted_at desc);

create index if not exists idx_lead_contact_logs_method_time
  on public.lead_contact_logs (method, contacted_at desc);

create index if not exists idx_lead_contact_logs_outcome_time
  on public.lead_contact_logs (outcome, contacted_at desc);

create unique index if not exists uq_lead_contact_logs_external_reference
  on public.lead_contact_logs (source, external_reference)
  where external_reference is not null;

alter table public.lead_contact_logs enable row level security;

drop policy if exists lead_contact_logs_read on public.lead_contact_logs;
create policy lead_contact_logs_read
on public.lead_contact_logs
for select
to authenticated
using (public.can_access_lead(lead_id));

revoke all on table public.lead_contact_logs from public, anon, authenticated;
grant select on table public.lead_contact_logs to authenticated;
grant all on table public.lead_contact_logs to service_role;

commit;
