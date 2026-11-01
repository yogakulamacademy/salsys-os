begin;

alter table public.system_intelligence_recommendations
  add column if not exists baseline_metric text,
  add column if not exists baseline_value numeric,
  add column if not exists desired_direction text,
  add column if not exists last_outcome_at timestamptz,
  add column if not exists last_outcome_class text,
  add column if not exists last_outcome_value numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'system_intelligence_desired_direction_check'
      and conrelid = 'public.system_intelligence_recommendations'::regclass
  ) then
    alter table public.system_intelligence_recommendations
      add constraint system_intelligence_desired_direction_check
      check (desired_direction is null or desired_direction in ('decrease','increase'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'system_intelligence_last_outcome_class_check'
      and conrelid = 'public.system_intelligence_recommendations'::regclass
  ) then
    alter table public.system_intelligence_recommendations
      add constraint system_intelligence_last_outcome_class_check
      check (last_outcome_class is null or last_outcome_class in ('positive','neutral','negative','mixed','inconclusive'));
  end if;
end
$$;

alter table public.system_intelligence_recommendations
  drop constraint if exists system_intelligence_baseline_metric_bounded;

alter table public.system_intelligence_recommendations
  add constraint system_intelligence_baseline_metric_bounded
  check (baseline_metric is null or length(baseline_metric) <= 120);

drop function if exists public.touch_system_intelligence_recommendation_v1(text,text,text,text,text,text,integer,text,text);

create or replace function public.touch_system_intelligence_recommendation_v1(
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
  p_desired_direction text default null
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

  if p_desired_direction is not null and p_desired_direction not in ('decrease','increase') then
    raise exception 'INTELLIGENCE_DIRECTION_INVALID';
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
    nullif(left(btrim(coalesce(p_baseline_metric, '')), 120), ''),
    p_baseline_value,
    p_desired_direction,
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
    baseline_metric = coalesce(public.system_intelligence_recommendations.baseline_metric, excluded.baseline_metric),
    baseline_value = coalesce(public.system_intelligence_recommendations.baseline_value, excluded.baseline_value),
    desired_direction = coalesce(public.system_intelligence_recommendations.desired_direction, excluded.desired_direction),
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

revoke all on function public.touch_system_intelligence_recommendation_v1(text,text,text,text,text,text,integer,text,text,text,numeric,text) from public, anon;
grant execute on function public.touch_system_intelligence_recommendation_v1(text,text,text,text,text,text,integer,text,text,text,numeric,text) to authenticated;

commit;