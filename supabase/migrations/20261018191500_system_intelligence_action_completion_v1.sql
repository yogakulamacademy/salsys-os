begin;

alter table public.system_intelligence_recommendations
  add column if not exists completed_at timestamptz;

create index if not exists system_intelligence_recommendations_org_completed_idx
  on public.system_intelligence_recommendations (organization_id, completed_at desc)
  where completed_at is not null;

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

  if not public.session_is_bound_to_organization(v_organization_id)
     or not public.is_organization_member(v_organization_id) then
    raise exception 'TENANT_ACCESS_DENIED';
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
    completed_at = case when p_event_type = 'action_completed' then coalesce(completed_at, now()) else completed_at end,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_recommendation_id
    and organization_id = v_organization_id;

  return true;
end;
$$;

revoke all on function public.record_system_intelligence_recommendation_feedback_v1(uuid,text,text) from public, anon;
grant execute on function public.record_system_intelligence_recommendation_feedback_v1(uuid,text,text) to authenticated;

comment on function public.record_system_intelligence_recommendation_feedback_v1(uuid,text,text)
is 'Tenant-safe recommendation feedback logger that distinguishes action start from explicit operator-confirmed action completion.';

commit;
