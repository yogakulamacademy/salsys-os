begin;

alter table public.system_intelligence_recommendations
  add column if not exists baseline_metric text,
  add column if not exists baseline_value numeric,
  add column if not exists desired_direction text,
  add column if not exists last_outcome_at timestamptz,
  add column if not exists last_outcome_class text,
  add column if not exists last_outcome_value numeric,
  add column if not exists target_lead_ids uuid[] not null default '{}'::uuid[],
  add column if not exists target_lead_count integer not null default 0,
  add column if not exists last_business_outcome_at timestamptz,
  add column if not exists last_business_outcome_class text,
  add column if not exists last_business_outcome_summary text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.system_intelligence_recommendations'::regclass
      and conname = 'system_intelligence_desired_direction_valid'
  ) then
    alter table public.system_intelligence_recommendations
      add constraint system_intelligence_desired_direction_valid
      check (desired_direction is null or desired_direction in ('increase','decrease'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.system_intelligence_recommendations'::regclass
      and conname = 'system_intelligence_target_lead_count_valid'
  ) then
    alter table public.system_intelligence_recommendations
      add constraint system_intelligence_target_lead_count_valid
      check (target_lead_count between 0 and 500);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.system_intelligence_recommendations'::regclass
      and conname = 'system_intelligence_baseline_metric_bounded'
  ) then
    alter table public.system_intelligence_recommendations
      add constraint system_intelligence_baseline_metric_bounded
      check (baseline_metric is null or length(baseline_metric) <= 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.system_intelligence_recommendations'::regclass
      and conname = 'system_intelligence_business_outcome_class_bounded'
  ) then
    alter table public.system_intelligence_recommendations
      add constraint system_intelligence_business_outcome_class_bounded
      check (last_business_outcome_class is null or length(last_business_outcome_class) <= 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.system_intelligence_recommendations'::regclass
      and conname = 'system_intelligence_business_outcome_summary_bounded'
  ) then
    alter table public.system_intelligence_recommendations
      add constraint system_intelligence_business_outcome_summary_bounded
      check (last_business_outcome_summary is null or length(last_business_outcome_summary) <= 800);
  end if;
end
$$;

create index if not exists system_intelligence_recommendations_org_acted_idx
  on public.system_intelligence_recommendations (organization_id, acted_at desc)
  where acted_at is not null;

create index if not exists system_intelligence_recommendations_target_leads_gin_idx
  on public.system_intelligence_recommendations using gin (target_lead_ids);

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
  p_target_lead_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
  v_id uuid;
  v_targets uuid[];
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.session_is_bound_to_organization(v_organization_id)
     or not public.is_organization_member(v_organization_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  if p_desired_direction is not null
     and p_desired_direction not in ('increase','decrease') then
    raise exception 'INTELLIGENCE_DIRECTION_INVALID';
  end if;

  select coalesce(array_agg(distinct l.id), '{}')
  into v_targets
  from public.leads l
  where l.organization_id = v_organization_id
    and l.id = any(coalesce(p_target_lead_ids, '{}'::uuid[]));

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
    v_targets,
    least(cardinality(v_targets), 500),
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
    baseline_metric = excluded.baseline_metric,
    baseline_value = excluded.baseline_value,
    desired_direction = excluded.desired_direction,
    target_lead_ids = excluded.target_lead_ids,
    target_lead_count = excluded.target_lead_count,
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

revoke all on function public.touch_system_intelligence_recommendation_v2(
  text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]
) from public, anon;

grant execute on function public.touch_system_intelligence_recommendation_v2(
  text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]
) to authenticated;

comment on function public.touch_system_intelligence_recommendation_v2(
  text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]
) is 'Tenant-safe recommendation impression logger with bounded learning metadata and target-lead capture.';

commit;
