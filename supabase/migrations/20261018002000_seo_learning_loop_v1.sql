begin;

create table if not exists public.seo_learning_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  auto_finalize boolean not null default true,
  positive_threshold_pct numeric(8,2) not null default 10,
  negative_threshold_pct numeric(8,2) not null default -10,
  minimum_samples_for_ranking integer not null default 3 check (minimum_samples_for_ranking between 1 and 100),
  max_ranking_adjustment integer not null default 8 check (max_ranking_adjustment between 0 and 20),
  medium_confidence_impressions bigint not null default 200,
  high_confidence_impressions bigint not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seo_learning_settings enable row level security;
revoke all on public.seo_learning_settings from anon, authenticated;
grant select,insert,update,delete on public.seo_learning_settings to service_role;

insert into public.seo_learning_settings(organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create table if not exists public.seo_experiment_learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid not null references public.seo_experiments(id) on delete cascade,
  learning_version text not null default 'seo_learning_v1',
  action_kind text not null default 'other',
  page_type text,
  primary_metric text not null,
  baseline_value numeric not null default 0,
  outcome_value numeric not null default 0,
  normalized_effect_pct numeric(12,4) not null default 0,
  result_classification text not null check (result_classification in ('positive','negative','mixed','inconclusive')),
  result_confidence text not null check (result_confidence in ('low','medium','high')),
  learning_summary text not null,
  supporting_evidence jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique(experiment_id,learning_version)
);

create index if not exists idx_seo_learning_events_org_action
  on public.seo_experiment_learning_events(organization_id,action_kind,evaluated_at desc);

alter table public.seo_experiment_learning_events enable row level security;
revoke all on public.seo_experiment_learning_events from anon, authenticated;
grant select,insert,update,delete on public.seo_experiment_learning_events to service_role;

create or replace function public.ensure_seo_learning_settings_for_organization_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.seo_learning_settings(organization_id)
  values(new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_seo_learning_settings_v1 on public.organizations;
create trigger trg_ensure_seo_learning_settings_v1
after insert on public.organizations
for each row execute function public.ensure_seo_learning_settings_for_organization_v1();

create or replace function public.evaluate_seo_experiment_learning_v1(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_persist boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_exp public.seo_experiments%rowtype;
  v_settings public.seo_learning_settings%rowtype;
  v_base public.seo_experiment_measurements%rowtype;
  v_out public.seo_experiment_measurements%rowtype;
  v_action_kind text := 'other';
  v_page_type text;
  v_base_value numeric := 0;
  v_out_value numeric := 0;
  v_effect numeric := 0;
  v_class text := 'inconclusive';
  v_conf text := 'low';
  v_business_direction integer := 0;
  v_total_impressions bigint := 0;
  v_window_days integer := 0;
  v_summary text;
  v_event_id uuid;
begin
  if p_organization_id is null or p_experiment_id is null then
    raise exception 'organization_id and experiment_id are required';
  end if;

  select * into v_exp
  from public.seo_experiments
  where id=p_experiment_id and organization_id=p_organization_id
  for update;
  if v_exp.id is null then
    return jsonb_build_object('ok',false,'reason','experiment_not_found');
  end if;

  select * into v_settings
  from public.seo_learning_settings
  where organization_id=p_organization_id;
  if v_settings.organization_id is null or v_settings.enabled is not true then
    return jsonb_build_object('ok',true,'skipped',true,'reason','learning_disabled');
  end if;

  select * into v_base
  from public.seo_experiment_measurements
  where organization_id=p_organization_id and experiment_id=p_experiment_id and phase='baseline'
  order by window_end desc,captured_at desc
  limit 1;

  select * into v_out
  from public.seo_experiment_measurements
  where organization_id=p_organization_id and experiment_id=p_experiment_id and phase in ('final','observation')
  order by case when phase='final' then 0 else 1 end, window_end desc,captured_at desc
  limit 1;

  if v_base.id is null or v_out.id is null then
    return jsonb_build_object('ok',true,'skipped',true,'reason','baseline_or_outcome_missing');
  end if;

  select coalesce(a.action_kind,v_exp.source_action,'other') into v_action_kind
  from (select 1) x
  left join lateral (
    select action_kind from public.seo_optimization_actions a
    where a.organization_id=p_organization_id and a.experiment_id=p_experiment_id
    order by a.created_at desc limit 1
  ) a on true;

  if v_exp.target_page_id is not null then
    select page_type into v_page_type
    from public.seo_pages
    where id=v_exp.target_page_id and organization_id=p_organization_id;
  end if;

  v_base_value := case v_exp.primary_metric
    when 'gsc_clicks' then v_base.gsc_clicks
    when 'gsc_impressions' then v_base.gsc_impressions
    when 'gsc_ctr' then v_base.gsc_ctr
    when 'gsc_avg_position' then v_base.gsc_avg_position
    when 'ga4_sessions' then v_base.ga4_sessions
    when 'ga4_engaged_sessions' then v_base.ga4_engaged_sessions
    when 'ga4_key_events' then v_base.ga4_key_events
    when 'organic_leads' then v_base.organic_leads
    when 'organic_qualified_leads' then v_base.organic_qualified_leads
    when 'organic_enrolled_leads' then v_base.organic_enrolled_leads
    when 'organic_revenue_inr' then v_base.organic_revenue_inr
    when 'organic_revenue_usd' then v_base.organic_revenue_usd
    when 'ai_referral_sessions' then v_base.ai_referral_sessions
    else 0 end;

  v_out_value := case v_exp.primary_metric
    when 'gsc_clicks' then v_out.gsc_clicks
    when 'gsc_impressions' then v_out.gsc_impressions
    when 'gsc_ctr' then v_out.gsc_ctr
    when 'gsc_avg_position' then v_out.gsc_avg_position
    when 'ga4_sessions' then v_out.ga4_sessions
    when 'ga4_engaged_sessions' then v_out.ga4_engaged_sessions
    when 'ga4_key_events' then v_out.ga4_key_events
    when 'organic_leads' then v_out.organic_leads
    when 'organic_qualified_leads' then v_out.organic_qualified_leads
    when 'organic_enrolled_leads' then v_out.organic_enrolled_leads
    when 'organic_revenue_inr' then v_out.organic_revenue_inr
    when 'organic_revenue_usd' then v_out.organic_revenue_usd
    when 'ai_referral_sessions' then v_out.ai_referral_sessions
    else 0 end;

  if v_exp.primary_metric='gsc_avg_position' then
    if abs(v_base_value)>0 then
      v_effect := round(((v_base_value-v_out_value)/abs(v_base_value))*100,4);
    elsif v_out_value>0 then
      v_effect := -100;
    end if;
  else
    if abs(v_base_value)>0 then
      v_effect := round(((v_out_value-v_base_value)/abs(v_base_value))*100,4);
    elsif v_out_value>0 then
      v_effect := 100;
    end if;
  end if;

  v_business_direction := sign(
    (v_out.organic_leads-v_base.organic_leads) * 10
    + (v_out.organic_qualified_leads-v_base.organic_qualified_leads) * 15
    + (v_out.organic_enrolled_leads-v_base.organic_enrolled_leads) * 30
    + case when v_out.organic_revenue_inr>v_base.organic_revenue_inr or v_out.organic_revenue_usd>v_base.organic_revenue_usd then 20
           when v_out.organic_revenue_inr<v_base.organic_revenue_inr or v_out.organic_revenue_usd<v_base.organic_revenue_usd then -20 else 0 end
  );

  if v_effect >= v_settings.positive_threshold_pct then
    v_class := case when v_business_direction<0 then 'mixed' else 'positive' end;
  elsif v_effect <= v_settings.negative_threshold_pct then
    v_class := case when v_business_direction>0 then 'mixed' else 'negative' end;
  elsif v_business_direction<>0 then
    v_class := 'mixed';
  else
    v_class := 'inconclusive';
  end if;

  v_total_impressions := coalesce(v_base.gsc_impressions,0)+coalesce(v_out.gsc_impressions,0);
  v_window_days := greatest(1,(v_out.window_end-v_out.window_start)+1);
  v_conf := case
    when v_window_days>=v_exp.minimum_observation_days and v_total_impressions>=v_settings.high_confidence_impressions then 'high'
    when v_window_days>=v_exp.minimum_observation_days and v_total_impressions>=v_settings.medium_confidence_impressions then 'medium'
    when v_window_days>=v_exp.minimum_observation_days then 'medium'
    else 'low' end;

  v_summary := concat(
    'Primary metric ',v_exp.primary_metric,' moved from ',round(v_base_value,4),' to ',round(v_out_value,4),
    ' (direction-adjusted effect ',round(v_effect,2),'%). ',
    'Organic leads ',v_base.organic_leads,'→',v_out.organic_leads,
    '; qualified ',v_base.organic_qualified_leads,'→',v_out.organic_qualified_leads,
    '; enrolled ',v_base.organic_enrolled_leads,'→',v_out.organic_enrolled_leads,'.'
  );

  if p_persist then
    insert into public.seo_experiment_learning_events(
      organization_id,experiment_id,action_kind,page_type,primary_metric,baseline_value,outcome_value,
      normalized_effect_pct,result_classification,result_confidence,learning_summary,supporting_evidence
    ) values(
      p_organization_id,p_experiment_id,coalesce(v_action_kind,'other'),v_page_type,v_exp.primary_metric,v_base_value,v_out_value,
      v_effect,v_class,v_conf,v_summary,
      jsonb_build_object(
        'baseline',jsonb_build_object('window_start',v_base.window_start,'window_end',v_base.window_end,'gsc_impressions',v_base.gsc_impressions),
        'outcome',jsonb_build_object('phase',v_out.phase,'window_start',v_out.window_start,'window_end',v_out.window_end,'gsc_impressions',v_out.gsc_impressions),
        'business_direction',v_business_direction,
        'thresholds',jsonb_build_object('positive_pct',v_settings.positive_threshold_pct,'negative_pct',v_settings.negative_threshold_pct),
        'learning_version','seo_learning_v1'
      )
    )
    on conflict (experiment_id,learning_version) do update set
      action_kind=excluded.action_kind,page_type=excluded.page_type,primary_metric=excluded.primary_metric,
      baseline_value=excluded.baseline_value,outcome_value=excluded.outcome_value,normalized_effect_pct=excluded.normalized_effect_pct,
      result_classification=excluded.result_classification,result_confidence=excluded.result_confidence,
      learning_summary=excluded.learning_summary,supporting_evidence=excluded.supporting_evidence,evaluated_at=now()
    returning id into v_event_id;

    if v_settings.auto_finalize and v_exp.status in ('running','completed') then
      update public.seo_experiments
      set status='completed',completed_at=coalesce(completed_at,now()),result_classification=v_class,
          result_confidence=v_conf,learning_summary=v_summary,updated_at=now()
      where id=p_experiment_id and organization_id=p_organization_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'skipped',false,'experiment_id',p_experiment_id,'learning_event_id',v_event_id,
    'primary_metric',v_exp.primary_metric,'baseline_value',v_base_value,'outcome_value',v_out_value,
    'normalized_effect_pct',v_effect,'classification',v_class,'confidence',v_conf,'summary',v_summary
  );
end;
$$;

revoke all on function public.evaluate_seo_experiment_learning_v1(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.evaluate_seo_experiment_learning_v1(uuid,uuid,boolean) to service_role;

create or replace view public.v_seo_action_learning_profile_v1
with (security_invoker=true)
as
select
  e.organization_id,
  e.action_kind,
  count(*)::integer as evidence_count,
  count(*) filter(where e.result_classification='positive')::integer as positive_count,
  count(*) filter(where e.result_classification='negative')::integer as negative_count,
  count(*) filter(where e.result_classification='mixed')::integer as mixed_count,
  count(*) filter(where e.result_classification='inconclusive')::integer as inconclusive_count,
  round(avg(e.normalized_effect_pct),2) as avg_effect_pct,
  round(
    100.0 * count(*) filter(where e.result_classification='positive') / nullif(count(*),0),
    2
  ) as positive_rate_pct,
  case
    when count(*) < s.minimum_samples_for_ranking then 0
    else greatest(-s.max_ranking_adjustment,least(s.max_ranking_adjustment,
      round(
        s.max_ranking_adjustment *
        ((count(*) filter(where e.result_classification='positive') - count(*) filter(where e.result_classification='negative'))::numeric / nullif(count(*),0))
      )::integer
    ))
  end as ranking_adjustment,
  max(e.evaluated_at) as last_evaluated_at
from public.seo_experiment_learning_events e
join public.seo_learning_settings s on s.organization_id=e.organization_id and s.enabled=true
group by e.organization_id,e.action_kind,s.minimum_samples_for_ranking,s.max_ranking_adjustment;

revoke all on public.v_seo_action_learning_profile_v1 from anon,authenticated;
grant select on public.v_seo_action_learning_profile_v1 to service_role;

create or replace function public.get_seo_next_best_actions_v2(
  p_organization_id uuid,
  p_site_id uuid default null,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'organization_id',p_organization_id,
    'generated_at',now(),
    'decision_version','v2_learning',
    'recommendations',coalesce(jsonb_agg(to_jsonb(x) order by x.decision_priority_score desc,x.gsc_impressions desc),'[]'::jsonb)
  )
  from (
    select
      v.*,
      v.decision_priority_score as base_decision_priority_score,
      coalesce(lp.evidence_count,0) as learning_evidence_count,
      coalesce(lp.ranking_adjustment,0) as learning_adjustment,
      greatest(0,least(100,v.decision_priority_score+coalesce(lp.ranking_adjustment,0))) as learned_priority_score
    from public.v_seo_decision_candidates_v1 v
    left join public.v_seo_action_learning_profile_v1 lp
      on lp.organization_id=v.organization_id and lp.action_kind=v.recommended_action_kind
    where v.organization_id=p_organization_id
      and (p_site_id is null or v.site_id=p_site_id)
    order by greatest(0,least(100,v.decision_priority_score+coalesce(lp.ranking_adjustment,0))) desc,v.gsc_impressions desc,v.page_id
    limit greatest(1,least(coalesce(p_limit,5),25))
  ) x;
$$;

-- Return the learned priority as the canonical decision_priority_score in the JSON response.
create or replace function public.get_seo_next_best_actions_learning_v1(
  p_organization_id uuid,
  p_site_id uuid default null,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'organization_id',p_organization_id,
    'generated_at',now(),
    'decision_version','v2_learning',
    'recommendations',coalesce(jsonb_agg(
      (to_jsonb(x)-'decision_priority_score'-'learned_priority_score') ||
      jsonb_build_object('decision_priority_score',x.learned_priority_score)
      order by x.learned_priority_score desc,x.gsc_impressions desc
    ),'[]'::jsonb)
  )
  from (
    select v.*,
      v.decision_priority_score as base_decision_priority_score,
      coalesce(lp.evidence_count,0) as learning_evidence_count,
      coalesce(lp.ranking_adjustment,0) as learning_adjustment,
      greatest(0,least(100,v.decision_priority_score+coalesce(lp.ranking_adjustment,0))) as learned_priority_score
    from public.v_seo_decision_candidates_v1 v
    left join public.v_seo_action_learning_profile_v1 lp
      on lp.organization_id=v.organization_id and lp.action_kind=v.recommended_action_kind
    where v.organization_id=p_organization_id
      and (p_site_id is null or v.site_id=p_site_id)
    order by learned_priority_score desc,v.gsc_impressions desc,v.page_id
    limit greatest(1,least(coalesce(p_limit,5),25))
  ) x;
$$;

revoke all on function public.get_seo_next_best_actions_v2(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.get_seo_next_best_actions_learning_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_seo_next_best_actions_v2(uuid,uuid,integer) to service_role;
grant execute on function public.get_seo_next_best_actions_learning_v1(uuid,uuid,integer) to service_role;

create or replace function public.sweep_seo_experiment_learning_v1(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  r record;
  v_result jsonb;
  v_scanned integer:=0;
  v_completed integer:=0;
  v_skipped integer:=0;
  v_failed integer:=0;
begin
  for r in
    select e.organization_id,e.id
    from public.seo_experiments e
    join public.seo_learning_settings s on s.organization_id=e.organization_id and s.enabled=true
    where e.status='running'
      and exists(select 1 from public.seo_experiment_measurements m where m.organization_id=e.organization_id and m.experiment_id=e.id and m.phase='baseline')
      and exists(select 1 from public.seo_experiment_measurements m where m.organization_id=e.organization_id and m.experiment_id=e.id and m.phase in ('observation','final'))
    order by e.started_at nulls last,e.created_at
    limit greatest(1,least(coalesce(p_limit,50),200))
  loop
    v_scanned:=v_scanned+1;
    begin
      v_result:=public.evaluate_seo_experiment_learning_v1(r.organization_id,r.id,true);
      if coalesce((v_result->>'skipped')::boolean,false) then v_skipped:=v_skipped+1; else v_completed:=v_completed+1; end if;
    exception when others then
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('ok',v_failed=0,'scanned',v_scanned,'completed',v_completed,'skipped',v_skipped,'failed',v_failed);
end;
$$;

revoke all on function public.sweep_seo_experiment_learning_v1(integer) from public,anon,authenticated;
grant execute on function public.sweep_seo_experiment_learning_v1(integer) to service_role;

create or replace view public.v_seo_learning_health_v1
with (security_invoker=true)
as
select
  o.id as organization_id,
  coalesce(s.enabled,false) as enabled,
  coalesce(s.auto_finalize,false) as auto_finalize,
  count(distinct e.id) filter(where e.status='running')::integer as running_experiments,
  count(distinct e.id) filter(where e.status='completed')::integer as completed_experiments,
  count(distinct le.id)::integer as learning_events,
  count(distinct le.id) filter(where le.result_classification='positive')::integer as positive_learnings,
  count(distinct le.id) filter(where le.result_classification='negative')::integer as negative_learnings,
  count(distinct le.id) filter(where le.result_classification='mixed')::integer as mixed_learnings,
  count(distinct le.id) filter(where le.result_classification='inconclusive')::integer as inconclusive_learnings,
  max(le.evaluated_at) as last_learning_at
from public.organizations o
left join public.seo_learning_settings s on s.organization_id=o.id
left join public.seo_experiments e on e.organization_id=o.id
left join public.seo_experiment_learning_events le on le.organization_id=o.id and le.experiment_id=e.id
group by o.id,s.enabled,s.auto_finalize;

revoke all on public.v_seo_learning_health_v1 from anon,authenticated;
grant select on public.v_seo_learning_health_v1 to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='salsys-seo-learning-v1';
    perform cron.schedule('salsys-seo-learning-v1','27 * * * *','select public.sweep_seo_experiment_learning_v1(100);');
  end if;
end $$;

commit;