-- W6-OG9 Human-Approved Autonomous Optimization v1
-- Human approval is mandatory; automatic publishing remains disabled.

create table if not exists public.seo_optimization_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid not null references public.seo_experiments(id) on delete cascade,
  target_page_id uuid null references public.seo_pages(id) on delete set null,
  target_url text null,
  source_layer text not null default 'manual',
  source_action text null,
  action_kind text not null,
  proposal jsonb not null default '{}'::jsonb,
  risk_level text not null default 'low',
  executor_kind text not null default 'manual',
  execution_gate text not null default 'human_approved',
  automatic_publish_enabled boolean not null default false,
  reversible boolean not null default true,
  approval_status text not null default 'pending',
  approval_note text null,
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  rejected_at timestamptz null,
  rejected_by uuid null references auth.users(id) on delete set null,
  execution_status text not null default 'blocked',
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  rollback_payload jsonb not null default '{}'::jsonb,
  execution_evidence jsonb not null default '{}'::jsonb,
  last_error text null,
  applied_at timestamptz null,
  rolled_back_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_optimization_actions_kind_check check (action_kind in ('content_edit','metadata_edit','schema_update','internal_link','technical','other')),
  constraint seo_optimization_actions_risk_check check (risk_level in ('low','medium','high')),
  constraint seo_optimization_actions_executor_check check (executor_kind in ('manual','cms','mcp','api')),
  constraint seo_optimization_actions_gate_check check (execution_gate='human_approved'),
  constraint seo_optimization_actions_approval_check check (approval_status in ('pending','approved','rejected')),
  constraint seo_optimization_actions_execution_check check (execution_status in ('blocked','ready','queued','running','applied','failed','rolled_back'))
);

create index if not exists seo_optimization_actions_org_status_idx
  on public.seo_optimization_actions(organization_id, approval_status, execution_status, created_at desc);
create index if not exists seo_optimization_actions_experiment_idx
  on public.seo_optimization_actions(experiment_id, created_at desc);

create table if not exists public.seo_optimization_action_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_id uuid not null references public.seo_optimization_actions(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_kind text not null default 'user',
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint seo_optimization_action_events_actor_check check (actor_kind in ('user','service'))
);

create index if not exists seo_optimization_action_events_org_action_idx
  on public.seo_optimization_action_events(organization_id, action_id, created_at desc);

alter table public.seo_optimization_actions enable row level security;
alter table public.seo_optimization_action_events enable row level security;

drop policy if exists seo_optimization_actions_member_read on public.seo_optimization_actions;
create policy seo_optimization_actions_member_read
  on public.seo_optimization_actions
  for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists seo_optimization_action_events_member_read on public.seo_optimization_action_events;
create policy seo_optimization_action_events_member_read
  on public.seo_optimization_action_events
  for select to authenticated
  using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.seo_optimization_actions from anon, authenticated;
revoke insert, update, delete on public.seo_optimization_action_events from anon, authenticated;
grant select on public.seo_optimization_actions to authenticated;
grant select on public.seo_optimization_action_events to authenticated;

create or replace function public.create_seo_optimization_action(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_action_kind text,
  p_proposal jsonb default '{}'::jsonb,
  p_risk_level text default 'low',
  p_executor_kind text default 'manual',
  p_target_page_id uuid default null,
  p_target_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_experiment public.seo_experiments;
  v_id uuid;
  v_page_id uuid;
  v_url text;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;
  if p_action_kind not in ('content_edit','metadata_edit','schema_update','internal_link','technical','other') then raise exception 'Invalid action kind'; end if;
  if p_risk_level not in ('low','medium','high') then raise exception 'Invalid risk level'; end if;
  if p_executor_kind not in ('manual','cms','mcp','api') then raise exception 'Invalid executor kind'; end if;

  select * into v_experiment
  from public.seo_experiments
  where id=p_experiment_id and organization_id=p_organization_id;
  if not found then raise exception 'Experiment not found'; end if;
  if v_experiment.status not in ('approved','running') then raise exception 'Experiment must be approved before an optimization action is proposed'; end if;

  v_page_id := coalesce(p_target_page_id, v_experiment.target_page_id);
  v_url := coalesce(nullif(btrim(p_target_url),''), v_experiment.target_url);
  if v_page_id is not null and not exists (
    select 1 from public.seo_pages where id=v_page_id and organization_id=p_organization_id
  ) then raise exception 'Target page is not available in this organization'; end if;

  insert into public.seo_optimization_actions(
    organization_id,experiment_id,target_page_id,target_url,source_layer,source_action,
    action_kind,proposal,risk_level,executor_kind,execution_gate,automatic_publish_enabled,
    reversible,approval_status,execution_status,created_by
  ) values (
    p_organization_id,p_experiment_id,v_page_id,v_url,v_experiment.source_layer,v_experiment.source_action,
    p_action_kind,coalesce(p_proposal,'{}'::jsonb),p_risk_level,p_executor_kind,'human_approved',false,
    true,'pending','blocked',auth.uid()
  ) returning id into v_id;

  insert into public.seo_optimization_action_events(
    organization_id,action_id,event_type,actor_user_id,actor_kind,event_payload
  ) values (
    p_organization_id,v_id,'created',auth.uid(),'user',
    jsonb_build_object('action_kind',p_action_kind,'risk_level',p_risk_level,'executor_kind',p_executor_kind)
  );

  return v_id;
end;
$$;

create or replace function public.review_seo_optimization_action(
  p_organization_id uuid,
  p_action_id uuid,
  p_decision text,
  p_note text default null
)
returns public.seo_optimization_actions
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_row public.seo_optimization_actions;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then raise exception 'Not authorized for organization'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;

  select * into v_row from public.seo_optimization_actions
  where id=p_action_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Optimization action not found'; end if;
  if v_row.approval_status <> 'pending' then raise exception 'Optimization action has already been reviewed'; end if;

  update public.seo_optimization_actions
  set approval_status=p_decision,
      approval_note=nullif(btrim(p_note),''),
      approved_at=case when p_decision='approved' then now() else approved_at end,
      approved_by=case when p_decision='approved' then auth.uid() else approved_by end,
      rejected_at=case when p_decision='rejected' then now() else rejected_at end,
      rejected_by=case when p_decision='rejected' then auth.uid() else rejected_by end,
      execution_status=case when p_decision='approved' then 'ready' else 'blocked' end,
      updated_at=now()
  where id=p_action_id and organization_id=p_organization_id
  returning * into v_row;

  insert into public.seo_optimization_action_events(
    organization_id,action_id,event_type,actor_user_id,actor_kind,event_payload
  ) values (
    p_organization_id,p_action_id,p_decision,auth.uid(),'user',
    jsonb_build_object('note',p_note,'execution_status',v_row.execution_status)
  );

  return v_row;
end;
$$;

create or replace function public.transition_seo_optimization_action(
  p_organization_id uuid,
  p_action_id uuid,
  p_new_status text,
  p_evidence jsonb default '{}'::jsonb,
  p_after_state jsonb default '{}'::jsonb,
  p_error text default null
)
returns public.seo_optimization_actions
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row public.seo_optimization_actions;
  v_is_service boolean := coalesce(auth.role(),'')='service_role';
  v_actor_kind text := case when coalesce(auth.role(),'')='service_role' then 'service' else 'user' end;
begin
  if p_organization_id is null then raise exception 'Organization is required'; end if;
  if not v_is_service and not public.is_organization_admin(p_organization_id) then raise exception 'Not authorized for organization'; end if;
  if p_new_status not in ('ready','queued','running','applied','failed','rolled_back') then raise exception 'Invalid execution status'; end if;

  select * into v_row from public.seo_optimization_actions
  where id=p_action_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Optimization action not found'; end if;
  if v_row.approval_status <> 'approved' then raise exception 'Human approval is required before execution'; end if;
  if v_row.automatic_publish_enabled then raise exception 'Automatic publish must remain disabled in OG9 v1'; end if;

  if not (
    (v_row.execution_status='ready' and p_new_status in ('queued','running','applied')) or
    (v_row.execution_status='queued' and p_new_status in ('running','failed')) or
    (v_row.execution_status='running' and p_new_status in ('applied','failed')) or
    (v_row.execution_status='failed' and p_new_status='ready') or
    (v_row.execution_status='applied' and p_new_status='rolled_back')
  ) then raise exception 'Invalid optimization execution transition: % -> %', v_row.execution_status, p_new_status; end if;

  update public.seo_optimization_actions
  set execution_status=p_new_status,
      after_state=case when p_new_status='applied' and coalesce(p_after_state,'{}'::jsonb) <> '{}'::jsonb then p_after_state else after_state end,
      execution_evidence=case when coalesce(p_evidence,'{}'::jsonb) <> '{}'::jsonb then execution_evidence || p_evidence else execution_evidence end,
      last_error=case when p_new_status='failed' then nullif(btrim(p_error),'') when p_new_status in ('ready','running','applied') then null else last_error end,
      applied_at=case when p_new_status='applied' then coalesce(applied_at,now()) else applied_at end,
      rolled_back_at=case when p_new_status='rolled_back' then now() else rolled_back_at end,
      updated_at=now()
  where id=p_action_id and organization_id=p_organization_id
  returning * into v_row;

  insert into public.seo_optimization_action_events(
    organization_id,action_id,event_type,actor_user_id,actor_kind,event_payload
  ) values (
    p_organization_id,p_action_id,'execution_'||p_new_status,
    case when v_is_service then null else auth.uid() end,v_actor_kind,
    jsonb_build_object('evidence',coalesce(p_evidence,'{}'::jsonb),'error',p_error)
  );
  return v_row;
end;
$$;

create or replace function public.get_seo_optimization_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare v_payload jsonb;
begin
  if p_organization_id is null or not public.is_organization_member(p_organization_id) then raise exception 'Not authorized for organization'; end if;

  select jsonb_build_object(
    'summary',jsonb_build_object(
      'total_actions',count(*),
      'pending_approval',count(*) filter (where approval_status='pending'),
      'approved_actions',count(*) filter (where approval_status='approved'),
      'rejected_actions',count(*) filter (where approval_status='rejected'),
      'ready_actions',count(*) filter (where execution_status='ready'),
      'running_actions',count(*) filter (where execution_status in ('queued','running')),
      'applied_actions',count(*) filter (where execution_status='applied'),
      'failed_actions',count(*) filter (where execution_status='failed'),
      'rolled_back_actions',count(*) filter (where execution_status='rolled_back'),
      'automatic_publish_enabled',count(*) filter (where automatic_publish_enabled)
    ),
    'actions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select id,experiment_id,target_page_id,target_url,source_layer,source_action,
               action_kind,proposal,risk_level,executor_kind,execution_gate,
               automatic_publish_enabled,reversible,approval_status,approval_note,
               approved_at,rejected_at,execution_status,last_error,applied_at,
               rolled_back_at,created_at,updated_at
        from public.seo_optimization_actions
        where organization_id=p_organization_id
        order by created_at desc limit 60
      ) x
    ),'[]'::jsonb),
    'guardrails',jsonb_build_object(
      'human_approval_required',true,
      'automatic_publish_enabled',false,
      'tenant_scoped',true,
      'reversible_actions_expected',true,
      'direct_authenticated_writes_enabled',false
    )
  ) into v_payload
  from public.seo_optimization_actions where organization_id=p_organization_id;

  return coalesce(v_payload,jsonb_build_object(
    'summary',jsonb_build_object('total_actions',0,'pending_approval',0,'approved_actions',0,'rejected_actions',0,'ready_actions',0,'running_actions',0,'applied_actions',0,'failed_actions',0,'rolled_back_actions',0,'automatic_publish_enabled',0),
    'actions','[]'::jsonb,
    'guardrails',jsonb_build_object('human_approval_required',true,'automatic_publish_enabled',false,'tenant_scoped',true,'reversible_actions_expected',true,'direct_authenticated_writes_enabled',false)
  ));
end;
$$;
