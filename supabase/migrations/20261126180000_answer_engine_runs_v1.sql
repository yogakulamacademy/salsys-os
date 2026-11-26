-- Answer Engine shadow mode (owner-approved 26 Nov 2026). The rules-and-facts
-- engine drafts an answer for incoming enquiry messages but never sends one.
-- Each run records what it would have said, why it stayed quiet otherwise,
-- Claude's check of the draft and the reply the team actually sent (a
-- reference only, no copy). Written only by the server (service_role); members
-- of the organization can read their own rows.

create table if not exists public.answer_engine_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  inbound_message_id uuid not null references public.messages(id) on delete cascade,
  engine_version text not null check (char_length(engine_version) <= 20),
  topic text check (topic is null or char_length(topic) <= 40),
  answered boolean not null,
  reason text check (reason is null or char_length(reason) <= 200),
  draft text check (draft is null or char_length(draft) <= 2000),
  facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array'),
  course_id uuid references public.courses(id) on delete set null,
  market text check (market is null or market in ('india', 'international', 'unknown')),
  verdict text check (verdict is null or verdict in ('agree', 'disagree', 'unsure')),
  verdict_note text check (verdict_note is null or char_length(verdict_note) <= 400),
  verdict_model text check (verdict_model is null or char_length(verdict_model) <= 80),
  verdict_at timestamptz,
  staff_reply_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (inbound_message_id, engine_version)
);
create index if not exists answer_engine_runs_org_idx on public.answer_engine_runs (organization_id, created_at desc);
create index if not exists answer_engine_runs_verdict_idx on public.answer_engine_runs (organization_id, answered, verdict) where answered;

alter table public.answer_engine_runs enable row level security;
drop policy if exists answer_engine_runs_select on public.answer_engine_runs;
create policy answer_engine_runs_select on public.answer_engine_runs
  for select to authenticated using (public.is_organization_member(organization_id));

revoke all on table public.answer_engine_runs from anon, authenticated;
grant select on table public.answer_engine_runs to authenticated;
grant all on table public.answer_engine_runs to service_role;
