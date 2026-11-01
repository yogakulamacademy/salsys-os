begin;

alter table public.system_intelligence_recommendations
  add column if not exists target_lead_ids uuid[] not null default '{}',
  add column if not exists target_lead_count integer not null default 0,
  add column if not exists last_business_outcome_at timestamptz,
  add column if not exists last_business_outcome_class text,
  add column if not exists last_business_outcome_summary text;

alter table public.system_intelligence_recommendations
  drop constraint if exists system_intelligence_recommendations_target_count_check;
alter table public.system_intelligence_recommendations
  add constraint system_intelligence_recommendations_target_count_check
  check (target_lead_count >= 0 and target_lead_count <= 500);

alter table public.system_intelligence_recommendations
  drop constraint if exists system_intelligence_recommendations_business_outcome_class_check;
alter table public.system_intelligence_recommendations
  add constraint system_intelligence_recommendations_business_outcome_class_check
  check (last_business_outcome_class is null or last_business_outcome_class in ('positive','neutral','negative','mixed','inconclusive'));

alter table public.system_intelligence_recommendation_events
  drop constraint if exists system_intelligence_recommendation_events_event_type_check;
alter table public.system_intelligence_recommendation_events
  add constraint system_intelligence_recommendation_events_event_type_check
  check (event_type in ('shown','accepted','dismissed','action_started','action_completed','outcome_observed','business_outcome_observed'));

create table if not exists public.system_intelligence_learning_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signal_id text not null,
  role_scope text not null default 'workspace',
  outcome_samples integer not null default 0,
  positive_count integer not null default 0,
  neutral_count integer not null default 0,
  negative_count integer not null default 0,
  mixed_count integer not null default 0,
  inconclusive_count integer not null default 0,
  score_adjustment smallint not null default 0 check (score_adjustment between -8 and 8),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  last_recomputed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, signal_id, role_scope)
);

alter table public.system_intelligence_learning_profiles enable row level security;
revoke all on public.system_intelligence_learning_profiles from anon;
grant select on public.system_intelligence_learning_profiles to authenticated;

drop policy if exists system_intelligence_learning_profiles_select on public.system_intelligence_learning_profiles;
create policy system_intelligence_learning_profiles_select
on public.system_intelligence_learning_profiles
for select to authenticated
using (
  public.session_is_bound_to_organization(organization_id)
  and public.is_organization_member(organization_id)
);

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
  if p_desired_direction is not null and p_desired_direction not in ('increase','decrease') then
    raise exception 'INTELLIGENCE_DIRECTION_INVALID';
  end if;

  select coalesce(array_agg(distinct l.id), '{}') into v_targets
  from public.leads l
  where l.organization_id = v_organization_id
    and l.id = any(coalesce(p_target_lead_ids, '{}'));

  insert into public.system_intelligence_recommendations (
    organization_id,recommendation_key,surface,source_version,signal_id,category,role_scope,score,
    action_text,reason_text,baseline_metric,baseline_value,desired_direction,
    target_lead_ids,target_lead_count,created_by,updated_by
  ) values (
    v_organization_id,left(btrim(p_recommendation_key),240),left(coalesce(nullif(btrim(p_surface),''),'system'),80),
    left(btrim(p_source_version),80),left(btrim(p_signal_id),160),left(btrim(p_category),80),
    left(coalesce(nullif(btrim(p_role_scope),''),'workspace'),80),greatest(0,least(100,p_score)),
    left(btrim(p_action_text),500),left(btrim(p_reason_text),800),
    nullif(left(btrim(coalesce(p_baseline_metric,'')),120),''),p_baseline_value,p_desired_direction,
    v_targets,least(cardinality(v_targets),500),auth.uid(),auth.uid()
  )
  on conflict (organization_id,recommendation_key)
  do update set
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

  insert into public.system_intelligence_recommendation_events(organization_id,recommendation_id,event_type,actor_user_id)
  values(v_organization_id,v_id,'shown',auth.uid());
  return v_id;
end;
$$;

revoke all on function public.touch_system_intelligence_recommendation_v2(text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]) from public, anon;
grant execute on function public.touch_system_intelligence_recommendation_v2(text,text,text,text,text,text,integer,text,text,text,numeric,text,uuid[]) to authenticated;

create or replace function public.recompute_system_intelligence_learning_profile_v1(
  p_organization_id uuid,
  p_signal_id text,
  p_role_scope text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_samples integer;
  v_positive integer;
  v_neutral integer;
  v_negative integer;
  v_mixed integer;
  v_inconclusive integer;
  v_adjustment integer := 0;
  v_confidence numeric := 0;
begin
  select
    count(*) filter (where e.outcome_class in ('positive','neutral','negative','mixed')),
    count(*) filter (where e.outcome_class='positive'),
    count(*) filter (where e.outcome_class='neutral'),
    count(*) filter (where e.outcome_class='negative'),
    count(*) filter (where e.outcome_class='mixed'),
    count(*) filter (where e.outcome_class='inconclusive')
  into v_samples,v_positive,v_neutral,v_negative,v_mixed,v_inconclusive
  from public.system_intelligence_recommendation_events e
  join public.system_intelligence_recommendations r on r.id=e.recommendation_id
  where r.organization_id=p_organization_id
    and r.signal_id=p_signal_id
    and r.role_scope=p_role_scope
    and e.event_type in ('outcome_observed','business_outcome_observed');

  if v_samples >= 5 then
    v_adjustment := round(8.0 * (v_positive - v_negative) / greatest(v_samples,1));
    v_adjustment := greatest(-8, least(8, v_adjustment));
    v_confidence := least(1.0, v_samples / 20.0);
  end if;

  insert into public.system_intelligence_learning_profiles(
    organization_id,signal_id,role_scope,outcome_samples,positive_count,neutral_count,negative_count,mixed_count,
    inconclusive_count,score_adjustment,confidence,last_recomputed_at,updated_at
  ) values (
    p_organization_id,p_signal_id,p_role_scope,v_samples,v_positive,v_neutral,v_negative,v_mixed,
    v_inconclusive,v_adjustment,v_confidence,now(),now()
  )
  on conflict (organization_id,signal_id,role_scope)
  do update set
    outcome_samples=excluded.outcome_samples,
    positive_count=excluded.positive_count,
    neutral_count=excluded.neutral_count,
    negative_count=excluded.negative_count,
    mixed_count=excluded.mixed_count,
    inconclusive_count=excluded.inconclusive_count,
    score_adjustment=excluded.score_adjustment,
    confidence=excluded.confidence,
    last_recomputed_at=now(),
    updated_at=now();
  return true;
end;
$$;

revoke all on function public.recompute_system_intelligence_learning_profile_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.recompute_system_intelligence_learning_profile_v1(uuid,text,text) to service_role;

commit;