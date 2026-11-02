-- Historical replay repair.
--
-- Production already had lead_contact_logs before migration 016, but no applied
-- migration ever versioned the table creation. Migration 016 and later journey
-- intelligence views depend on it. Reproduce the production base-table shape so
-- clean history replay no longer relies on out-of-band schema state.

begin;

create table if not exists public.lead_contact_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  employee_user_id uuid references public.profiles(id) on delete set null,
  employee_name_snapshot text,
  method text not null,
  direction text not null,
  outcome text not null,
  contacted_at timestamptz not null default now(),
  comment text not null,
  call_duration_seconds integer,
  source text not null default 'manual',
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_contact_logs_method_check
    check (method in ('whatsapp','sms','phone','email','instagram','other')),
  constraint lead_contact_logs_direction_check
    check (direction in ('outbound','inbound')),
  constraint lead_contact_logs_outcome_check
    check (outcome in ('attempted','sent','connected','replied','no_answer','left_message','follow_up_needed','other')),
  constraint lead_contact_logs_comment_check
    check (char_length(btrim(comment)) >= 1 and char_length(btrim(comment)) <= 4000),
  constraint lead_contact_logs_call_duration_check
    check (call_duration_seconds is null or (call_duration_seconds >= 0 and call_duration_seconds <= 28800)),
  constraint lead_contact_logs_source_check
    check (source in ('manual','automatic','imported'))
);

create index if not exists idx_lead_contact_logs_employee_time
  on public.lead_contact_logs(employee_user_id, contacted_at desc);

create index if not exists idx_lead_contact_logs_lead_time
  on public.lead_contact_logs(lead_id, contacted_at desc);

create index if not exists idx_lead_contact_logs_method_time
  on public.lead_contact_logs(method, contacted_at desc);

create index if not exists idx_lead_contact_logs_outcome_time
  on public.lead_contact_logs(outcome, contacted_at desc);

create unique index if not exists uq_lead_contact_logs_external_reference
  on public.lead_contact_logs(source, external_reference)
  where external_reference is not null;

alter table public.lead_contact_logs enable row level security;

revoke all on table public.lead_contact_logs from public, anon, authenticated;
grant select on table public.lead_contact_logs to authenticated;
grant all on table public.lead_contact_logs to service_role;

drop policy if exists lead_contact_logs_read on public.lead_contact_logs;
create policy lead_contact_logs_read
on public.lead_contact_logs
for select
to authenticated
using (public.can_access_lead(lead_id));

commit;
