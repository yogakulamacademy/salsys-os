-- Sales AI Job 2, phase 2: live Autopilot on Instagram (pilot).
-- The AI takes over a lead, replies by itself when it is confident, and hands
-- the lead to a person (Inbox flag + task + bell alert) when it is not.
-- Payment links are never sent by the AI.

create table if not exists public.ai_autopilot_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null default 'instagram' check (channel in ('instagram')),
  status text not null default 'active' check (status in ('active', 'paused', 'handed_over', 'completed')),
  enrolled_reason text not null check (enrolled_reason in ('pilot_new_lead', 'manual')),
  enrolled_by uuid references auth.users(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  ai_messages_sent integer not null default 0 check (ai_messages_sent >= 0),
  followups_sent integer not null default 0 check (followups_sent >= 0),
  last_ai_message_at timestamptz,
  handover_reason text check (handover_reason is null or length(handover_reason) <= 60),
  handover_detail text check (handover_detail is null or length(handover_detail) <= 500),
  handover_task_id uuid references public.tasks(id) on delete set null,
  handed_over_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  paused_by uuid references auth.users(id) on delete set null,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_autopilot_leads_one_per_lead unique (lead_id)
);

create index if not exists ai_autopilot_leads_org_status_idx on public.ai_autopilot_leads (organization_id, status);
create index if not exists ai_autopilot_leads_enrolled_idx on public.ai_autopilot_leads (organization_id, enrolled_at desc);

create or replace function public.ai_autopilot_leads_tenant_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if not exists (select 1 from public.leads l where l.id = new.lead_id and l.organization_id = new.organization_id) then
    raise exception 'autopilot lead must match its organization';
  end if;
  return new;
end;
$function$;

drop trigger if exists ai_autopilot_leads_tenant_guard on public.ai_autopilot_leads;
create trigger ai_autopilot_leads_tenant_guard before insert or update of lead_id, organization_id
  on public.ai_autopilot_leads for each row execute function public.ai_autopilot_leads_tenant_guard();

drop trigger if exists ai_autopilot_leads_set_updated_at on public.ai_autopilot_leads;
create trigger ai_autopilot_leads_set_updated_at before update on public.ai_autopilot_leads
  for each row execute function public.set_updated_at();

alter table public.ai_autopilot_leads enable row level security;
drop policy if exists ai_autopilot_leads_select on public.ai_autopilot_leads;
create policy ai_autopilot_leads_select on public.ai_autopilot_leads for select to authenticated
  using (public.is_organization_member(organization_id) and public.can_access_lead(lead_id));
revoke all on public.ai_autopilot_leads from anon, authenticated;
grant select on public.ai_autopilot_leads to authenticated;
grant all on public.ai_autopilot_leads to service_role;

-- Live runs reuse ai_autopilot_runs (mode 'autopilot', one per inbound message).
alter table public.ai_autopilot_runs add column if not exists confidence numeric
  check (confidence is null or (confidence >= 0 and confidence <= 1));
alter table public.ai_autopilot_runs add column if not exists provider_message_id text
  check (provider_message_id is null or length(provider_message_id) <= 300);
alter table public.ai_autopilot_runs add column if not exists kind text not null default 'reply'
  check (kind in ('reply', 'followup'));
alter table public.ai_autopilot_runs drop constraint if exists ai_autopilot_runs_status_check;
alter table public.ai_autopilot_runs add constraint ai_autopilot_runs_status_check check (status = any (array[
  'draft_ready', 'failed', 'sent_as_is', 'sent_small_edit', 'sent_rewritten', 'superseded',
  'sent', 'handed_over', 'skipped'
]));

-- A person takes a lead back, gives it to the AI, or acknowledges a handover alert.
create or replace function public.set_ai_autopilot_lead_state_v1(p_lead_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp
as $function$
declare
  v_lead record;
  v_row public.ai_autopilot_leads%rowtype;
begin
  if auth.uid() is null or not public.can_work_lead(p_lead_id) then
    raise exception 'You cannot change Autopilot for this lead';
  end if;
  if p_action not in ('take_over', 'hand_to_ai', 'acknowledge') then
    raise exception 'Unknown Autopilot action';
  end if;
  select id, organization_id, current_contact_channel into v_lead from public.leads where id = p_lead_id;
  if not found then raise exception 'Lead not found'; end if;

  select * into v_row from public.ai_autopilot_leads where lead_id = p_lead_id for update;

  if p_action = 'hand_to_ai' then
    if coalesce(v_lead.current_contact_channel::text, '') <> 'instagram' then
      raise exception 'Autopilot runs on Instagram conversations only';
    end if;
    if v_row.id is null then
      insert into public.ai_autopilot_leads (organization_id, lead_id, enrolled_reason, enrolled_by)
      values (v_lead.organization_id, p_lead_id, 'manual', auth.uid())
      returning * into v_row;
    else
      update public.ai_autopilot_leads
      set status = 'active', paused_by = null, paused_at = null, handover_reason = null, handover_detail = null,
          handed_over_at = null, acknowledged_at = null, acknowledged_by = null
      where id = v_row.id returning * into v_row;
    end if;
    insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
    values (p_lead_id, 'ai_autopilot_on', 'human', auth.uid()::text, 'Handed to AI Autopilot', null, jsonb_build_object('autopilot_lead_id', v_row.id));
    return jsonb_build_object('ok', true, 'status', v_row.status);
  end if;

  if v_row.id is null then
    return jsonb_build_object('ok', true, 'status', 'not_enrolled');
  end if;

  if p_action = 'take_over' then
    update public.ai_autopilot_leads set status = 'paused', paused_by = auth.uid(), paused_at = now(),
      acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, auth.uid())
    where id = v_row.id returning * into v_row;
    insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
    values (p_lead_id, 'ai_autopilot_off', 'human', auth.uid()::text, 'Taken over from AI Autopilot', null, jsonb_build_object('autopilot_lead_id', v_row.id));
  else
    update public.ai_autopilot_leads set acknowledged_at = now(), acknowledged_by = auth.uid()
    where id = v_row.id returning * into v_row;
  end if;
  return jsonb_build_object('ok', true, 'status', v_row.status);
end;
$function$;

-- The Autopilot worker hands a lead to a person: flag + task (visible on
-- Follow-ups and the dashboard) + activity. Idempotent while handed over.
create or replace function public.ai_autopilot_handover_v1(p_lead_id uuid, p_reason text, p_detail text default null)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp
as $function$
declare
  v_row public.ai_autopilot_leads%rowtype;
  v_lead record;
  v_task_id uuid;
begin
  if auth.role() is distinct from 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Autopilot handovers are made by the system only';
  end if;
  select * into v_row from public.ai_autopilot_leads where lead_id = p_lead_id for update;
  if not found then raise exception 'Lead is not on Autopilot'; end if;
  if v_row.status = 'handed_over' then
    return jsonb_build_object('ok', true, 'outcome', 'already_handed_over', 'task_id', v_row.handover_task_id);
  end if;
  select id, organization_id, owner_user_id, display_name into v_lead from public.leads where id = p_lead_id;

  insert into public.tasks (organization_id, lead_id, task_type, title, description, status, due_at, assigned_to, created_by_type, created_by_id, metadata)
  values (v_lead.organization_id, p_lead_id, 'human_review',
    left('AI handed over: ' || coalesce(p_detail, p_reason), 240),
    'AI Autopilot stopped on this lead and needs a person to reply.',
    'open', now(), v_lead.owner_user_id, 'ai', 'ai_autopilot_v1',
    jsonb_build_object('source', 'ai_autopilot_v1', 'reason', p_reason))
  returning id into v_task_id;

  update public.ai_autopilot_leads
  set status = 'handed_over', handover_reason = left(p_reason, 60), handover_detail = left(p_detail, 500),
      handover_task_id = v_task_id, handed_over_at = now(), acknowledged_at = null, acknowledged_by = null
  where id = v_row.id;

  insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
  values (p_lead_id, 'ai_handover', 'ai', 'ai_autopilot_v1', 'AI Autopilot handed this lead to the team',
    left(coalesce(p_detail, p_reason), 300), jsonb_build_object('task_id', v_task_id, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'outcome', 'handed_over', 'task_id', v_task_id);
end;
$function$;

revoke all on function public.set_ai_autopilot_lead_state_v1(uuid, text) from public, anon;
grant execute on function public.set_ai_autopilot_lead_state_v1(uuid, text) to authenticated, service_role;
revoke all on function public.ai_autopilot_handover_v1(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_autopilot_handover_v1(uuid, text, text) to service_role;

comment on table public.ai_autopilot_leads is
  'Leads handled by AI Autopilot (Instagram pilot): active, paused by a person, handed over to the team, or completed.';
