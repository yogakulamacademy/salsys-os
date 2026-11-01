-- R10-P0 — Recommendation Security & Reproducibility Hardening V1.
--
-- This migration activates no recommendation product surface and creates no
-- recommendation/business-outcome evidence. It only tightens the dormant R10
-- recommendation ledger before any production recommendation is shown.

begin;

alter table public.system_intelligence_recommendations
  add constraint system_intelligence_recommendations_id_org_key
  unique (id, organization_id);

alter table public.system_intelligence_recommendation_events
  add constraint system_intelligence_recommendation_events_rec_org_fkey
  foreign key (recommendation_id, organization_id)
  references public.system_intelligence_recommendations (id, organization_id)
  on delete cascade;

alter table public.system_intelligence_recommendations
  add constraint system_intelligence_recommendations_target_array_bound_check
  check (cardinality(target_lead_ids) <= 500);

alter table public.system_intelligence_recommendations
  add constraint system_intelligence_recommendations_target_count_matches_check
  check (target_lead_count = cardinality(target_lead_ids));

create unique index system_intelligence_recommendation_events_single_lifecycle_uidx
  on public.system_intelligence_recommendation_events (recommendation_id, event_type)
  where event_type in ('accepted','dismissed','action_started','action_completed');

revoke all on table public.system_intelligence_recommendations from anon, authenticated;
revoke all on table public.system_intelligence_recommendation_events from anon, authenticated;

grant select on table public.system_intelligence_recommendations to authenticated;
grant select on table public.system_intelligence_recommendation_events to authenticated;

drop policy if exists system_intelligence_recommendations_select
  on public.system_intelligence_recommendations;
create policy system_intelligence_recommendations_select
on public.system_intelligence_recommendations
for select
to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
);

drop policy if exists system_intelligence_recommendation_events_select
  on public.system_intelligence_recommendation_events;
create policy system_intelligence_recommendation_events_select
on public.system_intelligence_recommendation_events
for select
to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
);

drop policy if exists system_intelligence_recommendations_insert
  on public.system_intelligence_recommendations;
create policy system_intelligence_recommendations_insert
on public.system_intelligence_recommendations
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array['owner','admin','manager']::text[]
  )
  and (created_by is null or created_by = auth.uid())
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists system_intelligence_recommendations_update
  on public.system_intelligence_recommendations;
create policy system_intelligence_recommendations_update
on public.system_intelligence_recommendations
for update
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['owner','admin','manager']::text[]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array['owner','admin','manager']::text[]
  )
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists system_intelligence_recommendation_events_insert
  on public.system_intelligence_recommendation_events;
create policy system_intelligence_recommendation_events_insert
on public.system_intelligence_recommendation_events
for insert
to authenticated
with check (
  public.has_organization_role(
    organization_id,
    array['owner','admin','manager']::text[]
  )
  and (actor_user_id is null or actor_user_id = auth.uid())
  and exists (
    select 1
    from public.system_intelligence_recommendations r
    where r.id = system_intelligence_recommendation_events.recommendation_id
      and r.organization_id = system_intelligence_recommendation_events.organization_id
  )
);

revoke all on function public.touch_system_intelligence_recommendation_v1(
  text,text,text,text,text,text,integer,text,text,text,numeric,text
) from public, anon, authenticated, service_role;

create or replace function public.touch_system_intelligence_recommendation_v2(
  p_recommendation_key text,
  p_surface text,
  p_source_version text,
  p_signal_id text,
  p_category text,
  p_role_scope text,
  p_score integer,
  p_action_text text,
  p_reason_text text,
  p_baseline_metric text default null,
  p_baseline_value numeric default null,
  p_desired_direction text default null,
  p_target_lead_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
  v_id uuid;
  v_targets uuid[] := '{}'::uuid[];
  v_requested_distinct_count integer := 0;
  v_valid_target_count integer := 0;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.has_organization_role(
    v_organization_id,
    array['owner','admin','manager']::text[]
  ) then
    raise exception 'INTELLIGENCE_PRIVILEGED_ROLE_REQUIRED';
  end if;

  if p_desired_direction is not null
     and p_desired_direction not in ('increase','decrease') then
    raise exception 'INTELLIGENCE_DIRECTION_INVALID';
  end if;

  if cardinality(coalesce(p_target_lead_ids, '{}'::uuid[])) > 500 then
    raise exception 'INTELLIGENCE_TARGET_LIMIT_EXCEEDED';
  end if;

  select count(distinct requested.lead_id)::integer
    into v_requested_distinct_count
  from unnest(coalesce(p_target_lead_ids, '{}'::uuid[])) as requested(lead_id);

  select
    coalesce(array_agg(distinct l.id), '{}'::uuid[]),
    count(distinct l.id)::integer
  into v_targets, v_valid_target_count
  from unnest(coalesce(p_target_lead_ids, '{}'::uuid[])) as requested(lead_id)
  join public.leads l
    on l.id = requested.lead_id
   and l.organization_id = v_organization_id;

  if v_valid_target_count <> v_requested_distinct_count then
    raise exception 'INTELLIGENCE_TARGET_TENANT_MISMATCH';
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
    baseline_metric,
    baseline_value,
    desired_direction,
    target_lead_ids,
    target_lead_count,
    created_by,
    updated_by
  ) values (
    v_organization_id,
    left(btrim(p_recommendation_key),240),
    left(coalesce(nullif(btrim(p_surface),''),'system'),80),
    left(btrim(p_source_version),80),
    left(btrim(p_signal_id),160),
    left(btrim(p_category),80),
    left(coalesce(nullif(btrim(p_role_scope),''),'workspace'),80),
    greatest(0,least(100,p_score)),
    left(btrim(p_action_text),500),
    left(btrim(p_reason_text),800),
    nullif(left(btrim(coalesce(p_baseline_metric,'')),120),''),
    p_baseline_value,
    p_desired_direction,
    v_targets,
    cardinality(v_targets),
    auth.uid(),
    auth.uid()
  )
  on conflict (organization_id,recommendation_key)
  do update set
    surface=excluded.surface,
    source_version=excluded.source_version,
    signal_id=excluded.signal_id,
    category=excluded.category,
    role_scope=excluded.role_scope,
    score=excluded.score,
    action_text=excluded.action_text,
    reason_text=excluded.reason_text,
    baseline_metric=excluded.baseline_metric,
    baseline_value=excluded.baseline_value,
    desired_direction=excluded.desired_direction,
    target_lead_ids=excluded.target_lead_ids,
    target_lead_count=excluded.target_lead_count,
    last_shown_at=now(),
    shown_count=public.system_intelligence_recommendations.shown_count+1,
    updated_by=auth.uid(),
    updated_at=now()
  returning id into v_id;

  insert into public.system_intelligence_recommendation_events(
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

revoke all on function public.touch_system_intelligence_recommendation_v2(
  text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.touch_system_intelligence_recommendation_v2(
  text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]
) to authenticated;

comment on function public.touch_system_intelligence_recommendation_v2(
  text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]
) is
'R10 privileged recommendation presentation boundary. Tenant is session-derived, owner/admin/manager is required, target Leads must belong to the tenant, and every call records a real shown event.';

create or replace function public.record_system_intelligence_recommendation_feedback_v1(
  p_recommendation_id uuid,
  p_event_type text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
  v_recommendation public.system_intelligence_recommendations%rowtype;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.has_organization_role(
    v_organization_id,
    array['owner','admin','manager']::text[]
  ) then
    raise exception 'INTELLIGENCE_PRIVILEGED_ROLE_REQUIRED';
  end if;

  if p_event_type not in ('accepted','dismissed','action_started','action_completed') then
    raise exception 'INTELLIGENCE_FEEDBACK_EVENT_INVALID';
  end if;

  select r.*
    into v_recommendation
  from public.system_intelligence_recommendations r
  where r.id = p_recommendation_id
    and r.organization_id = v_organization_id
  for update;

  if not found then
    raise exception 'INTELLIGENCE_RECOMMENDATION_NOT_FOUND';
  end if;

  if p_event_type = 'accepted' then
    if v_recommendation.accepted_at is not null then
      return true;
    end if;
    if v_recommendation.state <> 'active'
       or v_recommendation.dismissed_at is not null
       or v_recommendation.acted_at is not null
       or v_recommendation.completed_at is not null then
      raise exception 'INTELLIGENCE_TRANSITION_INVALID';
    end if;

    insert into public.system_intelligence_recommendation_events(
      organization_id,recommendation_id,event_type,actor_user_id,note
    ) values (
      v_organization_id,p_recommendation_id,'accepted',auth.uid(),
      nullif(left(btrim(coalesce(p_note,'')),500),'')
    );

    update public.system_intelligence_recommendations
    set state='accepted', accepted_at=now(), updated_by=auth.uid(), updated_at=now()
    where id=p_recommendation_id and organization_id=v_organization_id;

    return true;
  end if;

  if p_event_type = 'dismissed' then
    if v_recommendation.dismissed_at is not null then
      return true;
    end if;
    if v_recommendation.state not in ('active','accepted')
       or v_recommendation.acted_at is not null
       or v_recommendation.completed_at is not null then
      raise exception 'INTELLIGENCE_TRANSITION_INVALID';
    end if;

    insert into public.system_intelligence_recommendation_events(
      organization_id,recommendation_id,event_type,actor_user_id,note
    ) values (
      v_organization_id,p_recommendation_id,'dismissed',auth.uid(),
      nullif(left(btrim(coalesce(p_note,'')),500),'')
    );

    update public.system_intelligence_recommendations
    set state='dismissed', dismissed_at=now(), updated_by=auth.uid(), updated_at=now()
    where id=p_recommendation_id and organization_id=v_organization_id;

    return true;
  end if;

  if p_event_type = 'action_started' then
    if v_recommendation.completed_at is not null then
      raise exception 'INTELLIGENCE_ACTION_ALREADY_COMPLETED';
    end if;
    if v_recommendation.acted_at is not null then
      return true;
    end if;
    if v_recommendation.state <> 'accepted'
       or v_recommendation.accepted_at is null
       or v_recommendation.dismissed_at is not null then
      raise exception 'INTELLIGENCE_TRANSITION_INVALID';
    end if;

    insert into public.system_intelligence_recommendation_events(
      organization_id,recommendation_id,event_type,actor_user_id,note
    ) values (
      v_organization_id,p_recommendation_id,'action_started',auth.uid(),
      nullif(left(btrim(coalesce(p_note,'')),500),'')
    );

    update public.system_intelligence_recommendations
    set state='acted', acted_at=now(), updated_by=auth.uid(), updated_at=now()
    where id=p_recommendation_id and organization_id=v_organization_id;

    return true;
  end if;

  if p_event_type = 'action_completed' then
    if v_recommendation.completed_at is not null then
      return true;
    end if;
    if v_recommendation.state <> 'acted'
       or v_recommendation.acted_at is null
       or v_recommendation.dismissed_at is not null then
      raise exception 'INTELLIGENCE_TRANSITION_INVALID';
    end if;

    insert into public.system_intelligence_recommendation_events(
      organization_id,recommendation_id,event_type,actor_user_id,note
    ) values (
      v_organization_id,p_recommendation_id,'action_completed',auth.uid(),
      nullif(left(btrim(coalesce(p_note,'')),500),'')
    );

    update public.system_intelligence_recommendations
    set state='acted', completed_at=now(), updated_by=auth.uid(), updated_at=now()
    where id=p_recommendation_id and organization_id=v_organization_id;

    return true;
  end if;

  raise exception 'INTELLIGENCE_FEEDBACK_EVENT_INVALID';
end;
$$;

revoke all on function public.record_system_intelligence_recommendation_feedback_v1(
  uuid,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_system_intelligence_recommendation_feedback_v1(
  uuid,text,text
) to authenticated;

comment on function public.record_system_intelligence_recommendation_feedback_v1(
  uuid,text,text
) is
'R10 privileged human recommendation feedback boundary. Enforces tenant role, valid state transitions and idempotent lifecycle retries; it executes no external customer/provider action.';

revoke all on function public.observe_system_intelligence_recommendation_outcomes_v1(integer)
  from public, anon, authenticated;
grant execute on function public.observe_system_intelligence_recommendation_outcomes_v1(integer)
  to service_role;

comment on function public.observe_system_intelligence_recommendation_outcomes_v1(integer) is
'R10 service-role-only temporal outcome observer. Existing implementation records observed downstream associations and does not claim causal attribution; a scheduled organization runner is a later R10 checkpoint.';

commit;