begin;

-- CI-only historical recovery prerequisite.
-- These global CRM defaults existed out-of-band before
-- 20261014055555_tenant_scoped_crm_settings_foundation.sql copied them into
-- organization-scoped settings. Production already contains both legacy and
-- organization-scoped state. Do not promote this file into the normal ledger.

create table if not exists public.lead_stage_probabilities (
  stage text primary key,
  probability numeric not null check (probability >= 0 and probability <= 1),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_stage_aging_rules (
  stage text primary key,
  warning_after_days numeric not null check (warning_after_days >= 0),
  stuck_after_days numeric not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stuck_after_days >= warning_after_days)
);

insert into public.lead_stage_probabilities(stage,probability,updated_at)
values
  ('contacted',0.2000,'2026-09-25 13:58:25.044942+00'),
  ('duplicate',0.0000,'2026-09-25 13:58:25.044942+00'),
  ('engaged',0.3500,'2026-09-25 13:58:25.044942+00'),
  ('enrolled',1.0000,'2026-09-25 13:58:25.044942+00'),
  ('high_intent',0.7000,'2026-09-25 13:58:25.044942+00'),
  ('lost',0.0000,'2026-09-25 13:58:25.044942+00'),
  ('new',0.1000,'2026-09-25 13:58:25.044942+00'),
  ('not_now',0.0500,'2026-09-25 13:58:25.044942+00'),
  ('nurture',0.1000,'2026-09-25 13:58:25.044942+00'),
  ('payment_pending',0.9000,'2026-09-25 13:58:25.044942+00'),
  ('qualified',0.5000,'2026-09-25 13:58:25.044942+00'),
  ('unqualified',0.0000,'2026-09-25 13:58:25.044942+00')
on conflict (stage) do nothing;

insert into public.pipeline_stage_aging_rules(
  stage,warning_after_days,stuck_after_days,active,notes,created_at,updated_at
)
values
  ('contacted',2.00,4.00,true,'Contacted leads should not sit without engagement for long.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00'),
  ('engaged',3.00,7.00,true,'Engaged leads need qualification or a next step.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00'),
  ('high_intent',2.00,4.00,true,'High-intent leads need close follow-up.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00'),
  ('new',0.50,1.00,true,'New enquiries should receive attention quickly.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00'),
  ('not_now',30.00,60.00,true,'Not-now leads can remain parked for longer.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00'),
  ('nurture',14.00,30.00,true,'Longer aging is expected in nurture.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00'),
  ('payment_pending',1.00,3.00,true,'Payment-pending leads should be actively followed up.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00'),
  ('qualified',4.00,8.00,true,'Qualified leads should progress toward high intent, payment or a clear nurture state.','2026-09-29 11:17:10.726987+00','2026-09-29 11:17:10.726987+00')
on conflict (stage) do nothing;

alter table public.lead_stage_probabilities enable row level security;
alter table public.pipeline_stage_aging_rules enable row level security;

drop policy if exists lead_stage_probabilities_read_crm on public.lead_stage_probabilities;
create policy lead_stage_probabilities_read_crm
  on public.lead_stage_probabilities for select to authenticated
  using (public.is_crm_user());

drop policy if exists pipeline_stage_aging_rules_read on public.pipeline_stage_aging_rules;
create policy pipeline_stage_aging_rules_read
  on public.pipeline_stage_aging_rules for select to authenticated
  using (public.is_crm_user());

drop policy if exists pipeline_stage_aging_rules_insert on public.pipeline_stage_aging_rules;
create policy pipeline_stage_aging_rules_insert
  on public.pipeline_stage_aging_rules for insert to authenticated
  with check (public.can_write_crm());

drop policy if exists pipeline_stage_aging_rules_update on public.pipeline_stage_aging_rules;
create policy pipeline_stage_aging_rules_update
  on public.pipeline_stage_aging_rules for update to authenticated
  using (public.can_write_crm())
  with check (public.can_write_crm());

grant select on public.lead_stage_probabilities to authenticated, service_role;
grant select,insert,update on public.pipeline_stage_aging_rules to authenticated;
grant all on public.pipeline_stage_aging_rules to service_role;

commit;
