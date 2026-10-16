-- Smart Triggers V1: scheduler + wait-state foundation.
-- Additive only. No background scheduler, provider send, or customer auto-send is enabled here.

alter table public.automation_actions
  drop constraint if exists automation_actions_action_type_check;

alter table public.automation_actions
  add constraint automation_actions_action_type_check
  check (action_type in (
    'create_followup',
    'generate_ai_draft',
    'request_human_approval',
    'send_message',
    'assign_owner',
    'change_stage',
    'add_tag',
    'notify_user',
    'wait',
    'wait_for_reply',
    'stop_workflow'
  ));

create table if not exists public.automation_wait_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  enrollment_id uuid,
  run_id uuid,
  action_id uuid,
  lead_id uuid not null references public.leads(id) on delete cascade,
  wait_type text not null check (wait_type in ('delay','until','reply')),
  status text not null default 'waiting'
    check (status in ('waiting','ready','resumed','cancelled','expired','failed')),
  resume_at timestamptz,
  timeout_at timestamptz,
  waiting_since timestamptz not null default now(),
  resumed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  resume_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_wait_states_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_wait_states_enrollment_fk
    foreign key (enrollment_id, organization_id)
    references public.automation_enrollments(id, organization_id)
    on delete cascade,
  constraint automation_wait_states_run_fk
    foreign key (run_id, organization_id)
    references public.automation_runs(id, organization_id)
    on delete set null,
  constraint automation_wait_states_action_fk
    foreign key (action_id, organization_id)
    references public.automation_actions(id, organization_id)
    on delete set null,
  constraint automation_wait_states_resume_event_fk
    foreign key (resume_event_id, organization_id)
    references public.automation_events(id, organization_id)
    on delete set null,
  constraint automation_wait_states_timing_check
    check (
      (wait_type = 'delay' and resume_at is not null)
      or (wait_type = 'until' and resume_at is not null)
      or (wait_type = 'reply' and (resume_at is null or timeout_at is not null))
    )
);

create index if not exists automation_wait_states_due_idx
  on public.automation_wait_states (organization_id, resume_at)
  where status = 'waiting' and resume_at is not null;

create index if not exists automation_wait_states_reply_idx
  on public.automation_wait_states (organization_id, lead_id, waiting_since desc)
  where status = 'waiting' and wait_type = 'reply';

create index if not exists automation_wait_states_enrollment_idx
  on public.automation_wait_states (organization_id, enrollment_id, created_at desc)
  where enrollment_id is not null;

create table if not exists public.automation_scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  enrollment_id uuid,
  wait_state_id uuid,
  lead_id uuid not null references public.leads(id) on delete cascade,
  job_type text not null check (job_type in ('resume_wait','resume_reply_timeout','workflow_wakeup')),
  status text not null default 'scheduled'
    check (status in ('scheduled','claimed','completed','cancelled','failed')),
  scheduled_for timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  dedupe_key text not null,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_scheduled_jobs_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_scheduled_jobs_enrollment_fk
    foreign key (enrollment_id, organization_id)
    references public.automation_enrollments(id, organization_id)
    on delete cascade,
  constraint automation_scheduled_jobs_wait_state_fk
    foreign key (wait_state_id, organization_id)
    references public.automation_wait_states(id, organization_id)
    on delete cascade
);

create unique index if not exists automation_scheduled_jobs_dedupe_idx
  on public.automation_scheduled_jobs (organization_id, dedupe_key);

create index if not exists automation_scheduled_jobs_due_idx
  on public.automation_scheduled_jobs (scheduled_for, organization_id)
  where status = 'scheduled';

create index if not exists automation_scheduled_jobs_lead_idx
  on public.automation_scheduled_jobs (organization_id, lead_id, scheduled_for desc);

-- Reuse the tenant-alignment guard. It reads optional fields through JSON projection.
drop trigger if exists automation_wait_states_tenant_alignment on public.automation_wait_states;
create trigger automation_wait_states_tenant_alignment
before insert or update on public.automation_wait_states
for each row execute function public.enforce_automation_tenant_alignment_v1();

drop trigger if exists automation_scheduled_jobs_tenant_alignment on public.automation_scheduled_jobs;
create trigger automation_scheduled_jobs_tenant_alignment
before insert or update on public.automation_scheduled_jobs
for each row execute function public.enforce_automation_tenant_alignment_v1();

drop trigger if exists automation_wait_states_set_updated_at on public.automation_wait_states;
create trigger automation_wait_states_set_updated_at
before update on public.automation_wait_states
for each row execute function public.set_updated_at();

drop trigger if exists automation_scheduled_jobs_set_updated_at on public.automation_scheduled_jobs;
create trigger automation_scheduled_jobs_set_updated_at
before update on public.automation_scheduled_jobs
for each row execute function public.set_updated_at();

alter table public.automation_wait_states enable row level security;
alter table public.automation_scheduled_jobs enable row level security;

drop policy if exists automation_wait_states_read on public.automation_wait_states;
create policy automation_wait_states_read
on public.automation_wait_states
for select
to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

drop policy if exists automation_scheduled_jobs_read on public.automation_scheduled_jobs;
create policy automation_scheduled_jobs_read
on public.automation_scheduled_jobs
for select
to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

revoke all on public.automation_wait_states from anon;
revoke all on public.automation_scheduled_jobs from anon;
revoke insert, update, delete, truncate, references, trigger on public.automation_wait_states from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.automation_scheduled_jobs from authenticated;
grant select on public.automation_wait_states to authenticated;
grant select on public.automation_scheduled_jobs to authenticated;
grant all on public.automation_wait_states to service_role;
grant all on public.automation_scheduled_jobs to service_role;
