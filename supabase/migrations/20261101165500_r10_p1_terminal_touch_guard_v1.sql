-- R10-P1 terminal recommendation touch guard V1.
--
-- Defense in depth for the presentation boundary: even if recommendation state
-- changes after the application pre-check, the creator must not refresh or add a
-- shown event to a terminal/non-active recommendation episode.

begin;

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
  where public.system_intelligence_recommendations.state = 'active'
    and public.system_intelligence_recommendations.dismissed_at is null
    and public.system_intelligence_recommendations.acted_at is null
    and public.system_intelligence_recommendations.completed_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'INTELLIGENCE_RECOMMENDATION_TERMINAL';
  end if;

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
'R10 privileged recommendation presentation boundary. Tenant is session-derived, owner/admin/manager is required, target Leads must belong to the tenant, and terminal/non-active existing episodes fail closed before a shown event can be recorded.';

commit;
