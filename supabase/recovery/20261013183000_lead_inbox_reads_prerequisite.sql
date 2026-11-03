-- CI-only historical recovery prerequisite.
-- public.lead_inbox_reads existed before the recorded
-- 20261013183130_sales_conversation_contact_capability migration, but its
-- creator was applied out-of-band and is absent from schema_migrations.
-- Reconstructed from the saved October implementation/audit evidence.

begin;

create table if not exists public.lead_inbox_reads (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  lead_id uuid not null
    references public.leads(id)
    on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lead_id)
);

alter table public.lead_inbox_reads enable row level security;

drop policy if exists "Users can read own inbox state"
  on public.lead_inbox_reads;
create policy "Users can read own inbox state"
  on public.lead_inbox_reads
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

drop policy if exists "Users can create own inbox state"
  on public.lead_inbox_reads;
create policy "Users can create own inbox state"
  on public.lead_inbox_reads
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

drop policy if exists "Users can update own inbox state"
  on public.lead_inbox_reads;
create policy "Users can update own inbox state"
  on public.lead_inbox_reads
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  )
  with check (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

grant select, insert, update
  on public.lead_inbox_reads
  to authenticated;

commit;
