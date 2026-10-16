-- SalsysOS Smart Trigger / Automation Engine V1 foundation
-- Additive only. This migration does NOT enable automatic customer messaging.
-- Workflows default to draft and runtime/event processing will be added separately.

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft','active','paused','archived')),
  approval_mode text not null default 'human_review'
    check (approval_mode in ('human_review','deterministic','auto_low_risk')),
  origin text not null default 'custom'
    check (origin in ('custom','system','legacy_admissions_rule')),
  priority integer not null default 100 check (priority between 0 and 1000),
  stop_on_reply boolean not null default true,
  max_attempts integer not null default 2 check (max_attempts between 1 and 20),
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'Asia/Kolkata',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_workflows_quiet_hours_check
    check (
      quiet_hours_enabled = false
      or (quiet_hours_start is not null and quiet_hours_end is not null)
    )
);

create index if not exists automation_workflows_org_status_idx
  on public.automation_workflows (organization_id, status, priority, updated_at desc);

create table if not exists public.automation_triggers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  trigger_type text not null
    check (trigger_type in ('event','time','ai_signal')),
  event_name text,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_triggers_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_triggers_event_name_check
    check (
      trigger_type <> 'event'
      or nullif(btrim(event_name), '') is not null
    )
);

create index if not exists automation_triggers_org_workflow_idx
  on public.automation_triggers (organization_id, workflow_id, enabled, position);
create index if not exists automation_triggers_event_idx
  on public.automation_triggers (organization_id, event_name)
  where enabled = true and trigger_type = 'event';

create table if not exists public.automation_conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  field text not null,
  operator text not null
    check (operator in (
      'eq','neq','in','not_in','gt','gte','lt','lte',
      'contains','not_contains','is_set','is_not_set'
    )),
  value jsonb,
  group_no integer not null default 0 check (group_no >= 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_conditions_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade
);

create index if not exists automation_conditions_org_workflow_idx
  on public.automation_conditions (organization_id, workflow_id, group_no, position);

create table if not exists public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  action_type text not null
    check (action_type in (
      'create_followup',
      'generate_ai_draft',
      'request_human_approval',
      'send_message',
      'assign_owner',
      'change_stage',
      'add_tag',
      'notify_user',
      'stop_workflow'
    )),
  config jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default true,
  position integer not null default 0 check (position >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_actions_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade
);

create index if not exists automation_actions_org_workflow_idx
  on public.automation_actions (organization_id, workflow_id, enabled, position);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_name text not null,
  source_system text not null default 'salsysos',
  source_event_id text,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index if not exists automation_events_source_dedupe_idx
  on public.automation_events (organization_id, source_system, source_event_id)
  where source_event_id is not null;
create index if not exists automation_events_org_name_time_idx
  on public.automation_events (organization_id, event_name, occurred_at desc);
create index if not exists automation_events_lead_idx
  on public.automation_events (organization_id, lead_id, occurred_at desc)
  where lead_id is not null;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  event_id uuid,
  lead_id uuid references public.leads(id) on delete set null,
  dedupe_key text,
  status text not null default 'pending'
    check (status in (
      'pending','evaluating','awaiting_approval','running',
      'completed','skipped','failed','cancelled'
    )),
  decision jsonb not null default '{}'::jsonb,
  reason text,
  attempt_no integer not null default 1 check (attempt_no between 1 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_runs_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_runs_event_fk
    foreign key (event_id, organization_id)
    references public.automation_events(id, organization_id)
    on delete set null
);

create unique index if not exists automation_runs_dedupe_idx
  on public.automation_runs (organization_id, workflow_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists automation_runs_org_status_idx
  on public.automation_runs (organization_id, status, created_at desc);
create index if not exists automation_runs_lead_idx
  on public.automation_runs (organization_id, lead_id, created_at desc)
  where lead_id is not null;

create table if not exists public.automation_action_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  action_id uuid not null,
  status text not null default 'pending'
    check (status in (
      'pending','awaiting_approval','approved','running',
      'completed','skipped','failed','cancelled'
    )),
  requires_approval boolean not null default true,
  approved_by uuid,
  approved_at timestamptz,
  executed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (run_id, action_id),
  constraint automation_action_runs_run_fk
    foreign key (run_id, organization_id)
    references public.automation_runs(id, organization_id)
    on delete cascade,
  constraint automation_action_runs_action_fk
    foreign key (action_id, organization_id)
    references public.automation_actions(id, organization_id)
    on delete cascade
);

create index if not exists automation_action_runs_org_status_idx
  on public.automation_action_runs (organization_id, status, created_at desc);

create table if not exists public.automation_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','paused','completed','stopped','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_action_at timestamptz,
  last_event_at timestamptz,
  stopped_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_enrollments_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade
);

create unique index if not exists automation_enrollments_active_idx
  on public.automation_enrollments (organization_id, workflow_id, lead_id)
  where status in ('active','paused');
create index if not exists automation_enrollments_due_idx
  on public.automation_enrollments (organization_id, next_action_at)
  where status = 'active' and next_action_at is not null;

create table if not exists public.automation_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  workflow_id uuid,
  channel text,
  scope text not null default 'messaging'
    check (scope in ('all','messaging','workflow')),
  reason text not null,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint automation_suppressions_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete cascade,
  constraint automation_suppressions_workflow_scope_check
    check (scope <> 'workflow' or workflow_id is not null)
);

create index if not exists automation_suppressions_org_lead_idx
  on public.automation_suppressions (organization_id, lead_id, active, expires_at);
create unique index if not exists automation_suppressions_active_unique_idx
  on public.automation_suppressions (
    organization_id,
    lead_id,
    coalesce(workflow_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(channel, ''),
    scope
  )
  where active = true;

-- Keep referenced CRM objects tenant-aligned. The engine must never be able to
-- attach an event/run/suppression/enrollment to an object from another tenant.
create or replace function public.enforce_automation_tenant_alignment_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_org uuid;
begin
  if new.organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if tg_table_name in ('automation_events','automation_runs','automation_enrollments','automation_suppressions')
     and new.lead_id is not null then
    select organization_id into v_org from public.leads where id = new.lead_id;
    if v_org is null or v_org <> new.organization_id then
      raise exception 'Automation lead does not belong to organization %', new.organization_id;
    end if;
  end if;

  if tg_table_name = 'automation_events' and new.conversation_id is not null then
    select organization_id into v_org from public.conversations where id = new.conversation_id;
    if v_org is null or v_org <> new.organization_id then
      raise exception 'Automation conversation does not belong to organization %', new.organization_id;
    end if;
  end if;

  if tg_table_name = 'automation_events' and new.message_id is not null then
    select organization_id into v_org from public.messages where id = new.message_id;
    if v_org is null or v_org <> new.organization_id then
      raise exception 'Automation message does not belong to organization %', new.organization_id;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists automation_events_tenant_alignment on public.automation_events;
create trigger automation_events_tenant_alignment
before insert or update on public.automation_events
for each row execute function public.enforce_automation_tenant_alignment_v1();

drop trigger if exists automation_runs_tenant_alignment on public.automation_runs;
create trigger automation_runs_tenant_alignment
before insert or update on public.automation_runs
for each row execute function public.enforce_automation_tenant_alignment_v1();

drop trigger if exists automation_enrollments_tenant_alignment on public.automation_enrollments;
create trigger automation_enrollments_tenant_alignment
before insert or update on public.automation_enrollments
for each row execute function public.enforce_automation_tenant_alignment_v1();

drop trigger if exists automation_suppressions_tenant_alignment on public.automation_suppressions;
create trigger automation_suppressions_tenant_alignment
before insert or update on public.automation_suppressions
for each row execute function public.enforce_automation_tenant_alignment_v1();

-- Updated-at triggers.
drop trigger if exists automation_workflows_set_updated_at on public.automation_workflows;
create trigger automation_workflows_set_updated_at
before update on public.automation_workflows
for each row execute function public.set_updated_at();

drop trigger if exists automation_triggers_set_updated_at on public.automation_triggers;
create trigger automation_triggers_set_updated_at
before update on public.automation_triggers
for each row execute function public.set_updated_at();

drop trigger if exists automation_conditions_set_updated_at on public.automation_conditions;
create trigger automation_conditions_set_updated_at
before update on public.automation_conditions
for each row execute function public.set_updated_at();

drop trigger if exists automation_actions_set_updated_at on public.automation_actions;
create trigger automation_actions_set_updated_at
before update on public.automation_actions
for each row execute function public.set_updated_at();

drop trigger if exists automation_runs_set_updated_at on public.automation_runs;
create trigger automation_runs_set_updated_at
before update on public.automation_runs
for each row execute function public.set_updated_at();

drop trigger if exists automation_action_runs_set_updated_at on public.automation_action_runs;
create trigger automation_action_runs_set_updated_at
before update on public.automation_action_runs
for each row execute function public.set_updated_at();

drop trigger if exists automation_enrollments_set_updated_at on public.automation_enrollments;
create trigger automation_enrollments_set_updated_at
before update on public.automation_enrollments
for each row execute function public.set_updated_at();

drop trigger if exists automation_suppressions_set_updated_at on public.automation_suppressions;
create trigger automation_suppressions_set_updated_at
before update on public.automation_suppressions
for each row execute function public.set_updated_at();

-- RLS: definitions are readable by organization members and manageable by org admins.
-- Runtime ledgers are readable by members but are written by service-role/runtime code.
alter table public.automation_workflows enable row level security;
alter table public.automation_triggers enable row level security;
alter table public.automation_conditions enable row level security;
alter table public.automation_actions enable row level security;
alter table public.automation_events enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_action_runs enable row level security;
alter table public.automation_enrollments enable row level security;
alter table public.automation_suppressions enable row level security;

create policy automation_workflows_read on public.automation_workflows
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));
create policy automation_workflows_manage on public.automation_workflows
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy automation_triggers_read on public.automation_triggers
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));
create policy automation_triggers_manage on public.automation_triggers
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy automation_conditions_read on public.automation_conditions
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));
create policy automation_conditions_manage on public.automation_conditions
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy automation_actions_read on public.automation_actions
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));
create policy automation_actions_manage on public.automation_actions
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy automation_events_read on public.automation_events
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

create policy automation_runs_read on public.automation_runs
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

create policy automation_action_runs_read on public.automation_action_runs
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));

create policy automation_enrollments_read on public.automation_enrollments
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));
create policy automation_enrollments_manage on public.automation_enrollments
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy automation_suppressions_read on public.automation_suppressions
for select to authenticated
using (public.is_crm_user() and public.is_organization_member(organization_id));
create policy automation_suppressions_manage on public.automation_suppressions
for all to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

revoke all on table public.automation_workflows from anon;
revoke all on table public.automation_triggers from anon;
revoke all on table public.automation_conditions from anon;
revoke all on table public.automation_actions from anon;
revoke all on table public.automation_events from anon;
revoke all on table public.automation_runs from anon;
revoke all on table public.automation_action_runs from anon;
revoke all on table public.automation_enrollments from anon;
revoke all on table public.automation_suppressions from anon;

grant select, insert, update, delete on table public.automation_workflows to authenticated;
grant select, insert, update, delete on table public.automation_triggers to authenticated;
grant select, insert, update, delete on table public.automation_conditions to authenticated;
grant select, insert, update, delete on table public.automation_actions to authenticated;
grant select on table public.automation_events to authenticated;
grant select on table public.automation_runs to authenticated;
grant select on table public.automation_action_runs to authenticated;
grant select, insert, update, delete on table public.automation_enrollments to authenticated;
grant select, insert, update, delete on table public.automation_suppressions to authenticated;

comment on table public.automation_workflows is
  'Tenant-scoped Smart Trigger workflow definitions. Workflows default to draft; no automatic customer messaging is enabled by this schema.';
comment on table public.automation_events is
  'Tenant-scoped immutable-style domain event ledger used by the Smart Trigger evaluator.';
comment on table public.automation_runs is
  'Idempotent workflow execution ledger. dedupe_key prevents the same workflow/event action from running twice.';
comment on table public.automation_action_runs is
  'Per-action execution and human-approval ledger for Smart Trigger workflow runs.';
comment on table public.automation_suppressions is
  'Lead/channel/workflow automation suppression records for opt-out and safety controls.';
