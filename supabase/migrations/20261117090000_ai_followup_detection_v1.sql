-- AI follow-up detection v1 (Sales AI Job 4)
-- When a lead writes "I'll get back to you" or "call me tomorrow", the server
-- (service role) creates a follow-up task for the lead owner, marked as set by
-- AI. Nothing is sent to the lead by this change.
--
-- ai_followup_detections: one row per inbound message the AI judged, so a
-- message is never processed twice and owners can see why a task exists.
-- Members read their organization's rows; only the service role writes.

begin;

create table if not exists public.ai_followup_detections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  outcome text not null check (outcome in ('created', 'skipped_existing', 'skipped_stage', 'not_followup', 'error')),
  kind text check (kind is null or kind in ('requested_time', 'will_get_back', 'not_now', 'call_request')),
  method text check (method is null or method in ('whatsapp', 'call', 'email', 'instagram')),
  phrase text check (phrase is null or char_length(phrase) <= 200),
  due_at timestamptz,
  decided_by text not null default 'rules' check (decided_by in ('rules', 'claude')),
  reason text check (reason is null or char_length(reason) <= 300),
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (message_id)
);

create index if not exists ai_followup_detections_org_created_idx
  on public.ai_followup_detections (organization_id, created_at desc);
create index if not exists ai_followup_detections_lead_idx
  on public.ai_followup_detections (lead_id, created_at desc);

-- The message and lead must belong to the row's organization.
create or replace function public.ai_followup_detection_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.messages m
    where m.id = new.message_id
      and m.lead_id = new.lead_id
      and m.organization_id = new.organization_id
  ) then
    raise exception 'ai follow-up detection must match its message lead and organization';
  end if;
  return new;
end;
$$;

revoke all on function public.ai_followup_detection_tenant_guard() from public, anon, authenticated;

drop trigger if exists ai_followup_detection_tenant_guard on public.ai_followup_detections;
create trigger ai_followup_detection_tenant_guard
  before insert or update on public.ai_followup_detections
  for each row execute function public.ai_followup_detection_tenant_guard();

alter table public.ai_followup_detections enable row level security;

drop policy if exists ai_followup_detections_member_select on public.ai_followup_detections;
create policy ai_followup_detections_member_select
  on public.ai_followup_detections for select to authenticated
  using (public.is_organization_member(organization_id) and public.can_access_lead(lead_id));

revoke all on public.ai_followup_detections from anon;
revoke insert, update, delete on public.ai_followup_detections from authenticated;
grant select on public.ai_followup_detections to authenticated;

-- Creates the follow-up task for an inbound message, assigned to the lead
-- owner, audited as AI. Idempotent per message: a second call returns the
-- first result. Service role only.
create or replace function public.create_ai_followup_task_v1(
  p_message_id uuid,
  p_title text,
  p_due_at timestamptz,
  p_kind text,
  p_method text,
  p_phrase text,
  p_decided_by text default 'rules',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message public.messages;
  v_lead public.leads;
  v_existing public.ai_followup_detections;
  v_task public.tasks;
  v_open_task_id uuid;
begin
  if nullif(trim(p_title), '') is null or char_length(p_title) > 240 then
    raise exception 'follow-up title is required (max 240 characters)';
  end if;
  if p_due_at is null or p_due_at < now() - interval '5 minutes' or p_due_at > now() + interval '200 days' then
    raise exception 'follow-up due time must be between now and 200 days ahead';
  end if;

  select * into v_existing from public.ai_followup_detections where message_id = p_message_id;
  if found then
    return jsonb_build_object('ok', true, 'outcome', v_existing.outcome, 'task_id', v_existing.task_id, 'already_processed', true);
  end if;

  select * into v_message from public.messages where id = p_message_id;
  if not found then
    raise exception 'message not found';
  end if;
  if v_message.direction <> 'inbound' then
    raise exception 'only inbound lead messages can create AI follow-ups';
  end if;

  select * into v_lead from public.leads
  where id = v_message.lead_id and organization_id = v_message.organization_id;
  if not found then
    raise exception 'lead not found for message';
  end if;

  -- Closed or invalid leads get no follow-up.
  if v_lead.current_stage::text in ('enrolled', 'lost', 'unqualified', 'duplicate') then
    insert into public.ai_followup_detections (organization_id, lead_id, message_id, outcome, kind, method, phrase, due_at, decided_by, reason)
    values (v_lead.organization_id, v_lead.id, v_message.id, 'skipped_stage', p_kind, p_method, left(p_phrase, 200), p_due_at, p_decided_by, 'Lead stage is ' || v_lead.current_stage::text);
    return jsonb_build_object('ok', true, 'outcome', 'skipped_stage');
  end if;

  -- One open future follow-up is enough; do not stack duplicates.
  select t.id into v_open_task_id from public.tasks t
  where t.lead_id = v_lead.id and t.organization_id = v_lead.organization_id
    and t.task_type in ('follow_up', 'call') and t.status = 'open'
    and t.due_at >= now()
  order by t.due_at
  limit 1;
  if v_open_task_id is not null then
    insert into public.ai_followup_detections (organization_id, lead_id, message_id, outcome, kind, method, phrase, due_at, decided_by, reason, task_id)
    values (v_lead.organization_id, v_lead.id, v_message.id, 'skipped_existing', p_kind, p_method, left(p_phrase, 200), p_due_at, p_decided_by, 'An open follow-up already exists', v_open_task_id);
    return jsonb_build_object('ok', true, 'outcome', 'skipped_existing', 'task_id', v_open_task_id);
  end if;

  insert into public.tasks (organization_id, lead_id, task_type, title, description, status, due_at, assigned_to, created_by_type, created_by_id, metadata)
  values (
    v_lead.organization_id, v_lead.id,
    case when p_method = 'call' then 'call'::task_type else 'follow_up'::task_type end,
    trim(p_title),
    'Set by AI from the lead''s message: "' || left(coalesce(p_phrase, ''), 200) || '"',
    'open', p_due_at, v_lead.owner_user_id, 'ai', 'ai_followup_detection_v1',
    jsonb_build_object('source', 'ai_followup_detection_v1', 'message_id', v_message.id, 'kind', p_kind, 'method', p_method, 'decided_by', p_decided_by)
  )
  returning * into v_task;

  update public.leads
  set next_followup_at = case when next_followup_at is null then p_due_at else least(next_followup_at, p_due_at) end
  where id = v_lead.id and organization_id = v_lead.organization_id;

  insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
  values (
    v_lead.id, 'followup_created', 'ai', 'ai_followup_detection_v1',
    'Follow-up set by AI',
    trim(p_title) || ' · due ' || to_char(p_due_at at time zone 'Asia/Kolkata', 'DD Mon, HH24:MI') || ' IST',
    jsonb_build_object('task_id', v_task.id, 'message_id', v_message.id, 'kind', p_kind, 'method', p_method, 'due_at', p_due_at)
  );

  insert into public.ai_followup_detections (organization_id, lead_id, message_id, outcome, kind, method, phrase, due_at, decided_by, reason, task_id)
  values (v_lead.organization_id, v_lead.id, v_message.id, 'created', p_kind, p_method, left(p_phrase, 200), p_due_at, p_decided_by, left(p_reason, 300), v_task.id);

  return jsonb_build_object('ok', true, 'outcome', 'created', 'task_id', v_task.id);
end;
$$;

revoke all on function public.create_ai_followup_task_v1(uuid, text, timestamptz, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_ai_followup_task_v1(uuid, text, timestamptz, text, text, text, text, text) to service_role;

comment on table public.ai_followup_detections is 'Sales AI Job 4: inbound messages judged for follow-up requests; one row per message.';

commit;
