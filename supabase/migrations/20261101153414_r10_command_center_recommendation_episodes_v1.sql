-- R10-P1 — Deterministic Command Center recommendation episodes V1.
--
-- Adds canonical CRM recommendation candidates plus persistent per-signal episode
-- state. This migration does not create any recommendation or recommendation-
-- event rows; presentation remains an authenticated application action.

begin;

create table public.system_intelligence_recommendation_signal_state (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_id text not null,
  is_active boolean not null default false,
  episode_sequence bigint not null default 0,
  episode_started_at timestamptz,
  last_evaluated_at timestamptz not null default now(),
  last_cleared_at timestamptz,
  last_signal_value numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, signal_id),
  constraint system_intelligence_recommendation_signal_state_signal_check
    check (signal_id in ('reply_backlog','overdue_followups','first_touch_needed','payment_pending')),
  constraint system_intelligence_recommendation_signal_state_sequence_check
    check (episode_sequence >= 0),
  constraint system_intelligence_recommendation_signal_state_value_check
    check (last_signal_value >= 0),
  constraint system_intelligence_recommendation_signal_state_active_episode_check
    check ((is_active = false) or (episode_sequence > 0 and episode_started_at is not null))
);

alter table public.system_intelligence_recommendation_signal_state enable row level security;
revoke all on table public.system_intelligence_recommendation_signal_state from public, anon, authenticated;
grant select on table public.system_intelligence_recommendation_signal_state to authenticated;
grant all on table public.system_intelligence_recommendation_signal_state to service_role;

create policy system_intelligence_recommendation_signal_state_select
on public.system_intelligence_recommendation_signal_state
for select to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
);

create or replace view public.v_r10_command_center_recommendation_candidates_v1
with (security_invoker = true)
as
with lead_attention as materialized (
  select
    v.organization_id,
    v.id as lead_id,
    v.current_stage::text as current_stage,
    v.last_contacted_at,
    v.created_at,
    a.latest_message_at,
    a.last_inbound_at,
    coalesce(a.needs_reply, false) as needs_reply
  from public.v_leads_overview v
  left join public.v_lead_inbox_attention a
    on a.organization_id = v.organization_id
   and a.lead_id = v.id
),
reply_candidates as (
  select organization_id, 'reply_backlog'::text as signal_id, lead_id,
         coalesce(last_inbound_at, latest_message_at, created_at) as signal_at
  from lead_attention
  where needs_reply = true
),
overdue_per_lead as (
  select f.organization_id, f.lead_id, min(f.due_at) as signal_at
  from public.v_followups_due f
  where f.lead_id is not null
  group by f.organization_id, f.lead_id
),
overdue_metrics as (
  select f.organization_id, count(*)::bigint as baseline_value
  from public.v_followups_due f
  group by f.organization_id
),
overdue_candidates as (
  select o.organization_id, 'overdue_followups'::text as signal_id, o.lead_id, o.signal_at
  from overdue_per_lead o
),
first_touch_candidates as (
  select organization_id, 'first_touch_needed'::text as signal_id, lead_id, created_at as signal_at
  from lead_attention
  where current_stage = 'new'
    and latest_message_at is null
    and last_contacted_at is null
),
payment_candidates as (
  select
    l.organization_id,
    'payment_pending'::text as signal_id,
    l.id as lead_id,
    coalesce(stage.payment_pending_entered_at, l.created_at) as signal_at
  from public.v_leads_overview l
  left join lateral (
    select max(h.changed_at) as payment_pending_entered_at
    from public.lead_stage_history h
    where h.lead_id = l.id
      and h.to_stage = 'payment_pending'
  ) stage on true
  where l.current_stage::text = 'payment_pending'
),
all_candidates as (
  select * from reply_candidates
  union all select * from overdue_candidates
  union all select * from first_touch_candidates
  union all select * from payment_candidates
),
ranked as (
  select
    c.organization_id,
    c.signal_id,
    c.lead_id,
    c.signal_at,
    row_number() over (
      partition by c.organization_id, c.signal_id
      order by c.signal_at asc nulls last, c.lead_id
    )::bigint as target_rank,
    count(*) over (partition by c.organization_id, c.signal_id)::bigint as candidate_lead_count
  from all_candidates c
)
select
  r.organization_id,
  r.signal_id,
  r.lead_id,
  r.signal_at,
  r.target_rank,
  case
    when r.signal_id = 'overdue_followups' then coalesce(o.baseline_value, 0::bigint)
    else r.candidate_lead_count
  end::bigint as baseline_value
from ranked r
left join overdue_metrics o
  on o.organization_id = r.organization_id
 and r.signal_id = 'overdue_followups';

revoke all on table public.v_r10_command_center_recommendation_candidates_v1 from public, anon;
grant select on table public.v_r10_command_center_recommendation_candidates_v1 to authenticated, service_role;

comment on view public.v_r10_command_center_recommendation_candidates_v1 is
  'R10-P1 deterministic Command Center recommendation candidates. Mirrors current CRM attention semantics, ranks oldest actionable Leads first, and keeps overdue task baseline count separate from deduplicated Lead targets.';

create or replace function public.resolve_system_intelligence_signal_episode_v1(
  p_signal_id text,
  p_is_active boolean,
  p_signal_value numeric
)
returns table (
  signal_id text,
  is_active boolean,
  episode_sequence bigint,
  episode_started_at timestamptz,
  last_cleared_at timestamptz,
  is_new_episode boolean,
  recommendation_key text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
  v_state public.system_intelligence_recommendation_signal_state%rowtype;
  v_new_episode boolean := false;
  v_current_key text;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.has_organization_role(v_organization_id, array['owner','admin','manager']::text[]) then
    raise exception 'INTELLIGENCE_PRIVILEGED_ROLE_REQUIRED';
  end if;

  if p_signal_id not in ('reply_backlog','overdue_followups','first_touch_needed','payment_pending') then
    raise exception 'INTELLIGENCE_SIGNAL_UNSUPPORTED';
  end if;

  if p_signal_value is null or p_signal_value < 0 then
    raise exception 'INTELLIGENCE_SIGNAL_VALUE_INVALID';
  end if;

  insert into public.system_intelligence_recommendation_signal_state (
    organization_id, signal_id, is_active, episode_sequence, last_signal_value, last_evaluated_at
  ) values (
    v_organization_id, p_signal_id, false, 0, 0, now()
  )
  on conflict (organization_id, signal_id) do nothing;

  select s.* into v_state
  from public.system_intelligence_recommendation_signal_state s
  where s.organization_id = v_organization_id
    and s.signal_id = p_signal_id
  for update;

  if p_is_active then
    if not v_state.is_active then
      v_new_episode := true;
      update public.system_intelligence_recommendation_signal_state s
      set
        is_active = true,
        episode_sequence = s.episode_sequence + 1,
        episode_started_at = now(),
        last_signal_value = p_signal_value,
        last_evaluated_at = now(),
        updated_at = now()
      where s.organization_id = v_organization_id
        and s.signal_id = p_signal_id;
    else
      update public.system_intelligence_recommendation_signal_state s
      set
        last_signal_value = p_signal_value,
        last_evaluated_at = now(),
        updated_at = now()
      where s.organization_id = v_organization_id
        and s.signal_id = p_signal_id;
    end if;
  else
    if v_state.is_active and v_state.episode_sequence > 0 then
      v_current_key := format('home:%s:episode:%s', v_state.signal_id, v_state.episode_sequence);

      update public.system_intelligence_recommendations r
      set state = 'expired', updated_by = auth.uid(), updated_at = now()
      where r.organization_id = v_organization_id
        and r.recommendation_key = v_current_key
        and r.state = 'active'
        and r.accepted_at is null
        and r.dismissed_at is null
        and r.acted_at is null
        and r.completed_at is null;
    end if;

    update public.system_intelligence_recommendation_signal_state s
    set
      is_active = false,
      last_cleared_at = case when s.is_active then now() else s.last_cleared_at end,
      last_signal_value = p_signal_value,
      last_evaluated_at = now(),
      updated_at = now()
    where s.organization_id = v_organization_id
      and s.signal_id = p_signal_id;
  end if;

  select s.* into v_state
  from public.system_intelligence_recommendation_signal_state s
  where s.organization_id = v_organization_id
    and s.signal_id = p_signal_id;

  return query
  select
    v_state.signal_id,
    v_state.is_active,
    v_state.episode_sequence,
    v_state.episode_started_at,
    v_state.last_cleared_at,
    v_new_episode,
    case
      when v_state.is_active then format('home:%s:episode:%s', v_state.signal_id, v_state.episode_sequence)
      else null::text
    end;
end;
$$;

revoke all on function public.resolve_system_intelligence_signal_episode_v1(text,boolean,numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_system_intelligence_signal_episode_v1(text,boolean,numeric)
  to authenticated;

comment on function public.resolve_system_intelligence_signal_episode_v1(text,boolean,numeric) is
  'R10-P1 privileged signal episode resolver. A new episode begins only after the signal was previously observed inactive; missing clear observations never fabricate a recurrence. Clearing expires only untouched active recommendations for that episode.';

commit;