begin;

create table if not exists public.system_intelligence_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recommendation_key text not null,
  surface text not null default 'system',
  source_version text not null,
  signal_id text not null,
  category text not null,
  role_scope text not null default 'workspace',
  score integer not null check (score between 0 and 100),
  action_text text not null,
  reason_text text not null,
  state text not null default 'active' check (state in ('active','accepted','dismissed','acted','expired')),
  first_shown_at timestamptz not null default now(),
  last_shown_at timestamptz not null default now(),
  shown_count integer not null default 1 check (shown_count >= 1),
  accepted_at timestamptz,
  dismissed_at timestamptz,
  acted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_intelligence_recommendation_key_nonempty check (length(btrim(recommendation_key)) between 1 and 240),
  constraint system_intelligence_signal_id_nonempty check (length(btrim(signal_id)) between 1 and 160),
  constraint system_intelligence_action_bounded check (length(action_text) between 1 and 500),
  constraint system_intelligence_reason_bounded check (length(reason_text) between 1 and 800),
  unique (organization_id, recommendation_key)
);

create index if not exists system_intelligence_recommendations_org_state_idx
  on public.system_intelligence_recommendations (organization_id, state, last_shown_at desc);

create index if not exists system_intelligence_recommendations_org_signal_idx
  on public.system_intelligence_recommendations (organization_id, signal_id, last_shown_at desc);

create table if not exists public.system_intelligence_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recommendation_id uuid not null references public.system_intelligence_recommendations(id) on delete cascade,
  event_type text not null check (event_type in ('shown','accepted','dismissed','action_started','action_completed','outcome_observed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  outcome_class text check (outcome_class is null or outcome_class in ('positive','neutral','negative','mixed','inconclusive')),
  outcome_metric text,
  outcome_delta numeric,
  note text,
  created_at timestamptz not null default now(),
  constraint system_intelligence_event_note_bounded check (note is null or length(note) <= 500),
  constraint system_intelligence_event_metric_bounded check (outcome_metric is null or length(outcome_metric) <= 120)
);

create index if not exists system_intelligence_recommendation_events_org_created_idx
  on public.system_intelligence_recommendation_events (organization_id, created_at desc);

create index if not exists system_intelligence_recommendation_events_rec_created_idx
  on public.system_intelligence_recommendation_events (recommendation_id, created_at desc);

alter table public.system_intelligence_recommendations enable row level security;
alter table public.system_intelligence_recommendation_events enable row level security;

revoke all on public.system_intelligence_recommendations from anon;
revoke all on public.system_intelligence_recommendation_events from anon;

grant select, insert, update on public.system_intelligence_recommendations to authenticated;
grant select, insert on public.system_intelligence_recommendation_events to authenticated;

drop policy if exists system_intelligence_recommendations_select on public.system_intelligence_recommendations;
create policy system_intelligence_recommendations_select
on public.system_intelligence_recommendations
for select
to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
);

drop policy if exists system_intelligence_recommendations_insert on public.system_intelligence_recommendations;
create policy system_intelligence_recommendations_insert
on public.system_intelligence_recommendations
for insert
to authenticated
with check (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists system_intelligence_recommendations_update on public.system_intelligence_recommendations;
create policy system_intelligence_recommendations_update
on public.system_intelligence_recommendations
for update
to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
)
with check (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists system_intelligence_recommendation_events_select on public.system_intelligence_recommendation_events;
create policy system_intelligence_recommendation_events_select
on public.system_intelligence_recommendation_events
for select
to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
);

drop policy if exists system_intelligence_recommendation_events_insert on public.system_intelligence_recommendation_events;
create policy system_intelligence_recommendation_events_insert
on public.system_intelligence_recommendation_events
for insert
to authenticated
with check (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
  and (actor_user_id is null or actor_user_id = auth.uid())
  and exists (
    select 1
    from public.system_intelligence_recommendations r
    where r.id = recommendation_id
      and r.organization_id = organization_id
  )
);

create or replace function public.touch_system_intelligence_recommendation_v1(
  p_recommendation_key text,
  p_surface text,
  p_source_version text,
  p_signal_id text,
  p_category text,
  p_role_scope text,
  p_score integer,
  p_action_text text,
  p_reason_text text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
  v_id uuid;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.session_is_bound_to_organization(v_organization_id)
     or not public.is_organization_member(v_organization_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  insert into public.system_intelligence_recommendations (
    organization_id,
    recommendation_key,
    surface,
    source_version,
    signal_id,
    category,
    role_scope,
    score,
    action_text,
    reason_text,
    created_by,
    updated_by
  ) values (
    v_organization_id,
    left(btrim(p_recommendation_key), 240),
    left(coalesce(nullif(btrim(p_surface), ''), 'system'), 80),
    left(btrim(p_source_version), 80),
    left(btrim(p_signal_id), 160),
    left(btrim(p_category), 80),
    left(coalesce(nullif(btrim(p_role_scope), ''), 'workspace'), 80),
    greatest(0, least(100, p_score)),
    left(btrim(p_action_text), 500),
    left(btrim(p_reason_text), 800),
    auth.uid(),
    auth.uid()
  )
  on conflict (organization_id, recommendation_key)
  do update set
    surface = excluded.surface,
    source_version = excluded.source_version,
    signal_id = excluded.signal_id,
    category = excluded.category,
    role_scope = excluded.role_scope,
    score = excluded.score,
    action_text = excluded.action_text,
    reason_text = excluded.reason_text,
    last_shown_at = now(),
    shown_count = public.system_intelligence_recommendations.shown_count + 1,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into v_id;

  insert into public.system_intelligence_recommendation_events (
    organization_id,
    recommendation_id,
    event_type,
    actor_user_id
  ) values (
    v_organization_id,
    v_id,
    'shown',
    auth.uid()
  );

  return v_id;
end;
$$;

create or replace function public.record_system_intelligence_recommendation_feedback_v1(
  p_recommendation_id uuid,
  p_event_type text,
  p_note text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
  v_state text;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if p_event_type not in ('accepted','dismissed','action_started','action_completed') then
    raise exception 'INTELLIGENCE_FEEDBACK_EVENT_INVALID';
  end if;

  if not exists (
    select 1
    from public.system_intelligence_recommendations r
    where r.id = p_recommendation_id
      and r.organization_id = v_organization_id
  ) then
    raise exception 'INTELLIGENCE_RECOMMENDATION_NOT_FOUND';
  end if;

  insert into public.system_intelligence_recommendation_events (
    organization_id,
    recommendation_id,
    event_type,
    actor_user_id,
    note
  ) values (
    v_organization_id,
    p_recommendation_id,
    p_event_type,
    auth.uid(),
    nullif(left(btrim(coalesce(p_note, '')), 500), '')
  );

  v_state := case
    when p_event_type = 'dismissed' then 'dismissed'
    when p_event_type in ('action_started','action_completed') then 'acted'
    else 'accepted'
  end;

  update public.system_intelligence_recommendations
  set
    state = v_state,
    accepted_at = case when p_event_type = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
    dismissed_at = case when p_event_type = 'dismissed' then coalesce(dismissed_at, now()) else dismissed_at end,
    acted_at = case when p_event_type in ('action_started','action_completed') then coalesce(acted_at, now()) else acted_at end,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_recommendation_id
    and organization_id = v_organization_id;

  return true;
end;
$$;

revoke all on function public.touch_system_intelligence_recommendation_v1(text,text,text,text,text,text,integer,text,text) from public, anon;
revoke all on function public.record_system_intelligence_recommendation_feedback_v1(uuid,text,text) from public, anon;
grant execute on function public.touch_system_intelligence_recommendation_v1(text,text,text,text,text,text,integer,text,text) to authenticated;
grant execute on function public.record_system_intelligence_recommendation_feedback_v1(uuid,text,text) to authenticated;

commit;
