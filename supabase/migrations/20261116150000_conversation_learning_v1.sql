-- Conversation learning v1
-- Stores evidence-counted insights learned from an organization's own past
-- conversations (questions, stall points, objections, offer requests, buying
-- signals, timing, data gaps). No model training: insights are reviewed by a
-- manager, and only `approved` insights may be used as AI playbook context.
--
-- Tenant isolation: every row carries organization_id; members can read their
-- organization's rows; only managers can review. Rows are written by the
-- server (service role) after a can_manage_organization check.

begin;

create table if not exists public.conversation_learning_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  started_by uuid references auth.users(id) on delete set null,
  status text not null default 'completed' check (status in ('running', 'completed', 'failed')),
  -- crm_messages: messages stored in SalsysOS. *_export: a chat export a manager
  -- uploaded; raw chats from exports are never stored, only these insights.
  source text not null default 'crm_messages' check (source in ('crm_messages', 'whatsapp_export', 'instagram_export')),
  source_label text check (source_label is null or char_length(source_label) <= 200),
  window_start timestamptz,
  window_end timestamptz,
  conversations_analyzed integer not null default 0 check (conversations_analyzed >= 0),
  messages_analyzed integer not null default 0 check (messages_analyzed >= 0),
  inbound_messages integer not null default 0 check (inbound_messages >= 0),
  outbound_messages integer not null default 0 check (outbound_messages >= 0),
  conversations_with_team_reply integer not null default 0 check (conversations_with_team_reply >= 0),
  won_conversations integer not null default 0 check (won_conversations >= 0),
  enough_for_outcome_learning boolean not null default false,
  analyzer_version text not null default 'conversation-learning-v1',
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists conversation_learning_runs_org_created_idx
  on public.conversation_learning_runs (organization_id, source, created_at desc);

create table if not exists public.conversation_learning_insights (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.conversation_learning_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('question', 'objection', 'stall_point', 'buying_signal', 'offer_request', 'timing', 'data_gap', 'outcome_driver')),
  insight_key text not null check (char_length(insight_key) between 1 and 80),
  label text not null check (char_length(label) between 1 and 160),
  conversations integer not null check (conversations >= 0),
  share numeric(6,5) not null check (share >= 0 and share <= 1),
  detail text not null check (char_length(detail) <= 600),
  examples jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array' and jsonb_array_length(examples) <= 3),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, kind, insight_key)
);

create index if not exists conversation_learning_insights_org_status_idx
  on public.conversation_learning_insights (organization_id, review_status, kind);

-- The insight must belong to the same organization as its run.
create or replace function public.conversation_learning_insight_tenant_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.conversation_learning_runs r
    where r.id = new.run_id and r.organization_id = new.organization_id
  ) then
    raise exception 'conversation learning insight organization must match its run';
  end if;
  return new;
end;
$$;

revoke all on function public.conversation_learning_insight_tenant_guard() from public, anon, authenticated;

drop trigger if exists conversation_learning_insight_tenant_guard on public.conversation_learning_insights;
create trigger conversation_learning_insight_tenant_guard
  before insert or update of run_id, organization_id on public.conversation_learning_insights
  for each row execute function public.conversation_learning_insight_tenant_guard();

alter table public.conversation_learning_runs enable row level security;
alter table public.conversation_learning_insights enable row level security;

drop policy if exists conversation_learning_runs_member_select on public.conversation_learning_runs;
create policy conversation_learning_runs_member_select
  on public.conversation_learning_runs for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists conversation_learning_insights_member_select on public.conversation_learning_insights;
create policy conversation_learning_insights_member_select
  on public.conversation_learning_insights for select to authenticated
  using (public.is_organization_member(organization_id));

-- Managers review (approve / reject) insights; they cannot change the evidence.
drop policy if exists conversation_learning_insights_manager_review on public.conversation_learning_insights;
create policy conversation_learning_insights_manager_review
  on public.conversation_learning_insights for update to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

revoke all on public.conversation_learning_runs from anon, authenticated;
revoke all on public.conversation_learning_insights from anon, authenticated;
grant select on public.conversation_learning_runs to authenticated;
grant select on public.conversation_learning_insights to authenticated;
grant update (review_status, review_note, reviewed_by, reviewed_at) on public.conversation_learning_insights to authenticated;

-- Approved playbook for AI context: approved insights from the latest completed
-- run of each source (CRM messages, WhatsApp export, Instagram export).
create or replace view public.v_conversation_learning_playbook
with (security_invoker = true) as
select i.organization_id, r.source, i.kind, i.insight_key, i.label, i.conversations, i.share, i.detail, i.examples, i.reviewed_at, r.created_at as learned_at
from public.conversation_learning_insights i
join public.conversation_learning_runs r on r.id = i.run_id
where i.review_status = 'approved'
  and r.id = (
    select r2.id from public.conversation_learning_runs r2
    where r2.organization_id = i.organization_id and r2.source = r.source and r2.status = 'completed'
    order by r2.created_at desc limit 1
  );

revoke all on public.v_conversation_learning_playbook from anon;
grant select on public.v_conversation_learning_playbook to authenticated;

commit;
