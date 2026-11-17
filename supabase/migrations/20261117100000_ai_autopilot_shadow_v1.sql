-- AI Autopilot shadow mode v1 (Sales AI Job 2, phase 1: Instagram)
-- The AI drafts a reply to each new inbound message; a person reviews and
-- sends it. Each run records whether real Autopilot would have sent it alone
-- (or why it would hand over) and, after sending, how much the person changed
-- the draft. Nothing here sends a message.

begin;

create table if not exists public.ai_autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  inbound_message_id uuid not null references public.messages(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'whatsapp', 'email')),
  mode text not null default 'shadow' check (mode in ('shadow', 'autopilot')),
  status text not null default 'draft_ready' check (status in ('draft_ready', 'failed', 'sent_as_is', 'sent_small_edit', 'sent_rewritten', 'superseded')),
  would_send boolean not null default false,
  stop_reason text check (stop_reason is null or char_length(stop_reason) <= 60),
  topic text check (topic is null or char_length(topic) <= 40),
  router_risk text check (router_risk is null or router_risk in ('low', 'review', 'human_only')),
  router_intent text check (router_intent is null or char_length(router_intent) <= 120),
  knowledge_used integer not null default 0 check (knowledge_used >= 0),
  model text check (model is null or char_length(model) <= 120),
  draft text check (draft is null or char_length(draft) <= 4000),
  error text check (error is null or char_length(error) <= 500),
  sent_body text check (sent_body is null or char_length(sent_body) <= 4000),
  edit_ratio numeric(5,4) check (edit_ratio is null or (edit_ratio >= 0 and edit_ratio <= 1)),
  created_by uuid references auth.users(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (inbound_message_id, mode)
);

create index if not exists ai_autopilot_runs_org_created_idx on public.ai_autopilot_runs (organization_id, created_at desc);
create index if not exists ai_autopilot_runs_lead_idx on public.ai_autopilot_runs (lead_id, created_at desc);

create or replace function public.ai_autopilot_run_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.messages m
    where m.id = new.inbound_message_id and m.lead_id = new.lead_id and m.organization_id = new.organization_id
  ) then
    raise exception 'autopilot run must match its message lead and organization';
  end if;
  return new;
end;
$$;

revoke all on function public.ai_autopilot_run_tenant_guard() from public, anon, authenticated;

drop trigger if exists ai_autopilot_run_tenant_guard on public.ai_autopilot_runs;
create trigger ai_autopilot_run_tenant_guard
  before insert or update on public.ai_autopilot_runs
  for each row execute function public.ai_autopilot_run_tenant_guard();

alter table public.ai_autopilot_runs enable row level security;

drop policy if exists ai_autopilot_runs_member_select on public.ai_autopilot_runs;
create policy ai_autopilot_runs_member_select
  on public.ai_autopilot_runs for select to authenticated
  using (public.is_organization_member(organization_id) and public.can_access_lead(lead_id));

revoke all on public.ai_autopilot_runs from anon;
revoke insert, update, delete on public.ai_autopilot_runs from authenticated;
grant select on public.ai_autopilot_runs to authenticated;

-- Save a shadow draft for the lead's inbound message. Caller must be able to
-- work the lead. One shadow run per message: a second call returns the first.
create or replace function public.record_autopilot_shadow_draft_v1(
  p_lead_id uuid,
  p_inbound_message_id uuid,
  p_channel text,
  p_would_send boolean,
  p_stop_reason text,
  p_topic text,
  p_router_risk text,
  p_router_intent text,
  p_knowledge_used integer,
  p_model text,
  p_draft text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message public.messages;
  v_run public.ai_autopilot_runs;
begin
  if auth.uid() is null or not public.can_work_lead(p_lead_id) then
    raise exception 'not authorized for this lead';
  end if;

  select * into v_run from public.ai_autopilot_runs where inbound_message_id = p_inbound_message_id and mode = 'shadow';
  if found then
    return jsonb_build_object('ok', true, 'run_id', v_run.id, 'existing', true);
  end if;

  select * into v_message from public.messages where id = p_inbound_message_id and lead_id = p_lead_id;
  if not found or v_message.direction <> 'inbound' then
    raise exception 'inbound message not found for this lead';
  end if;

  -- An older shadow draft for this lead is overtaken by the newer message.
  update public.ai_autopilot_runs set status = 'superseded', resolved_at = now()
  where lead_id = p_lead_id and mode = 'shadow' and status = 'draft_ready';

  insert into public.ai_autopilot_runs (
    organization_id, lead_id, inbound_message_id, channel, mode, status, would_send, stop_reason, topic,
    router_risk, router_intent, knowledge_used, model, draft, error, created_by
  ) values (
    v_message.organization_id, p_lead_id, p_inbound_message_id, p_channel, 'shadow',
    case when p_error is null then 'draft_ready' else 'failed' end,
    coalesce(p_would_send, false), left(p_stop_reason, 60), left(p_topic, 40),
    case when p_router_risk in ('low', 'review', 'human_only') then p_router_risk end,
    left(p_router_intent, 120), greatest(coalesce(p_knowledge_used, 0), 0), left(p_model, 120),
    left(p_draft, 4000), left(p_error, 500), auth.uid()
  ) returning * into v_run;

  return jsonb_build_object('ok', true, 'run_id', v_run.id, 'existing', false);
end;
$$;

revoke all on function public.record_autopilot_shadow_draft_v1(uuid, uuid, text, boolean, text, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.record_autopilot_shadow_draft_v1(uuid, uuid, text, boolean, text, text, text, text, integer, text, text, text) to authenticated;

-- Record what the person actually sent and how much they changed the draft.
create or replace function public.record_autopilot_shadow_outcome_v1(
  p_run_id uuid,
  p_sent_body text,
  p_edit_ratio numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.ai_autopilot_runs;
  v_status text;
begin
  select * into v_run from public.ai_autopilot_runs where id = p_run_id;
  if not found then
    raise exception 'autopilot run not found';
  end if;
  if auth.uid() is null or not public.can_work_lead(v_run.lead_id) then
    raise exception 'not authorized for this lead';
  end if;
  if v_run.status <> 'draft_ready' then
    return jsonb_build_object('ok', true, 'status', v_run.status, 'unchanged', true);
  end if;
  if p_edit_ratio is null or p_edit_ratio < 0 or p_edit_ratio > 1 then
    raise exception 'edit ratio must be between 0 and 1';
  end if;

  v_status := case when p_edit_ratio <= 0.02 then 'sent_as_is' when p_edit_ratio <= 0.25 then 'sent_small_edit' else 'sent_rewritten' end;
  update public.ai_autopilot_runs
  set status = v_status, sent_body = left(p_sent_body, 4000), edit_ratio = round(p_edit_ratio, 4), sent_by = auth.uid(), resolved_at = now()
  where id = p_run_id;

  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

revoke all on function public.record_autopilot_shadow_outcome_v1(uuid, text, numeric) from public, anon;
grant execute on function public.record_autopilot_shadow_outcome_v1(uuid, text, numeric) to authenticated;

-- Shadow results per organization: the gate for switching Autopilot on.
create or replace view public.v_autopilot_shadow_summary
with (security_invoker = true)
as
select
  r.organization_id,
  r.channel,
  count(*) filter (where r.status in ('sent_as_is', 'sent_small_edit', 'sent_rewritten')) as sent,
  count(*) filter (where r.status = 'sent_as_is') as sent_as_is,
  count(*) filter (where r.status = 'sent_small_edit') as sent_small_edit,
  count(*) filter (where r.status = 'sent_rewritten') as sent_rewritten,
  count(*) filter (where r.would_send) as would_send,
  count(*) filter (where not r.would_send) as would_hand_over,
  count(*) as drafts,
  min(r.created_at) as first_draft_at
from public.ai_autopilot_runs r
where r.mode = 'shadow'
group by r.organization_id, r.channel;

grant select on public.v_autopilot_shadow_summary to authenticated;

commit;
