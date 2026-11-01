-- R10-P3 Observed Outcome & Learning Runner V1
--
-- Safety contract:
-- - machine execution is explicitly tenant-scoped;
-- - no browser/session tenant state is trusted by the runner;
-- - no recommendation/outcome/learning evidence is seeded;
-- - temporal downstream evidence is not causal attribution;
-- - learning profiles remain descriptive and are not applied to live priority;
-- - one recommendation contributes at most one latest learning sample.

begin;

create table if not exists public.system_intelligence_outcome_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trigger_source text not null default 'cron',
  status text not null default 'running',
  recommendations_scanned integer not null default 0,
  outcome_events_recorded integer not null default 0,
  positive_count integer not null default 0,
  negative_count integer not null default 0,
  mixed_count integer not null default 0,
  inconclusive_count integer not null default 0,
  learning_profiles_recomputed integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint system_intelligence_outcome_runs_trigger_check check (trigger_source in ('cron','manual','acceptance')),
  constraint system_intelligence_outcome_runs_status_check check (status in ('running','success','partial','failed')),
  constraint system_intelligence_outcome_runs_counts_check check (recommendations_scanned >= 0 and outcome_events_recorded >= 0 and positive_count >= 0 and negative_count >= 0 and mixed_count >= 0 and inconclusive_count >= 0 and learning_profiles_recomputed >= 0),
  constraint system_intelligence_outcome_runs_error_bounded_check check (error_message is null or length(error_message) <= 2000)
);
create index if not exists system_intelligence_outcome_runs_org_started_idx on public.system_intelligence_outcome_runs(organization_id, started_at desc);
create index if not exists system_intelligence_outcome_runs_org_status_idx on public.system_intelligence_outcome_runs(organization_id, status, started_at desc);
alter table public.system_intelligence_outcome_runs enable row level security;
drop policy if exists system_intelligence_outcome_runs_select on public.system_intelligence_outcome_runs;
create policy system_intelligence_outcome_runs_select on public.system_intelligence_outcome_runs for select to authenticated using (public.session_is_bound_to_organization(organization_id) and public.is_organization_member(organization_id));
revoke all on table public.system_intelligence_outcome_runs from public, anon, authenticated;
grant select on table public.system_intelligence_outcome_runs to authenticated;
grant all on table public.system_intelligence_outcome_runs to service_role;
comment on table public.system_intelligence_outcome_runs is 'R10-P3 tenant-scoped operational telemetry for scheduled recommendation outcome observation. Successful zero-outcome runs are runner evidence, not fabricated business outcomes.';

revoke all on table public.system_intelligence_learning_profiles from public, anon, authenticated;
grant select on table public.system_intelligence_learning_profiles to authenticated;
comment on table public.system_intelligence_learning_profiles is 'R10 descriptive recommendation learning profiles. Authenticated clients have tenant-RLS SELECT only; trusted functions own mutation. score_adjustment is not applied to live R10-P1 priority in P3.';

create or replace function public.observe_system_intelligence_recommendation_outcomes_v2(p_organization_id uuid, p_limit integer default 50)
returns table (scanned_count integer, observed_count integer, positive_count integer, negative_count integer, mixed_count integer, inconclusive_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_recommendation public.system_intelligence_recommendations%rowtype;
  v_positive_leads integer; v_negative_leads integer; v_latest_evidence_at timestamptz; v_outcome_class text; v_outcome_delta numeric; v_summary text;
  v_scanned integer := 0; v_observed integer := 0; v_positive integer := 0; v_negative integer := 0; v_mixed integer := 0; v_inconclusive integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if p_organization_id is null then raise exception 'INTELLIGENCE_ORGANIZATION_REQUIRED'; end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then raise exception 'INTELLIGENCE_ORGANIZATION_NOT_ACTIVE'; end if;
  for v_recommendation in
    select r.* from public.system_intelligence_recommendations r
    where r.organization_id = p_organization_id and r.source_version in ('v2','r10-p1') and r.acted_at is not null and r.target_lead_count > 0 and cardinality(r.target_lead_ids) > 0 and r.acted_at <= now() - interval '15 minutes'
    order by coalesce(r.last_business_outcome_at, r.acted_at) asc, r.id limit v_limit for update skip locked
  loop
    v_scanned := v_scanned + 1;
    select count(*) filter (where evidence.has_positive)::integer, count(*) filter (where evidence.has_negative)::integer, max(evidence.latest_evidence_at)
    into v_positive_leads, v_negative_leads, v_latest_evidence_at
    from (
      select target.lead_id,
        (exists (select 1 from public.payments p where p.organization_id=p_organization_id and p.lead_id=target.lead_id and p.status='paid' and coalesce(p.paid_at,p.updated_at,p.created_at)>=v_recommendation.acted_at)
         or exists (select 1 from public.enrollments e where e.organization_id=p_organization_id and e.lead_id=target.lead_id and e.status in ('confirmed','completed') and coalesce(e.enrolled_at,e.updated_at,e.created_at)>=v_recommendation.acted_at)
         or exists (select 1 from public.lead_stage_history h where h.lead_id=target.lead_id and h.changed_at>=v_recommendation.acted_at and h.to_stage in ('contacted','engaged','qualified','high_intent','payment_pending','enrolled') and (case h.to_stage when 'contacted' then 2 when 'engaged' then 3 when 'qualified' then 4 when 'high_intent' then 5 when 'payment_pending' then 6 when 'enrolled' then 7 else 0 end) > (case h.from_stage when 'new' then 1 when 'contacted' then 2 when 'engaged' then 3 when 'qualified' then 4 when 'high_intent' then 5 when 'payment_pending' then 6 when 'enrolled' then 7 else 0 end))) as has_positive,
        (exists (select 1 from public.lead_stage_history h where h.lead_id=target.lead_id and h.changed_at>=v_recommendation.acted_at and h.to_stage in ('lost','unqualified'))
         or exists (select 1 from public.enrollments e where e.organization_id=p_organization_id and e.lead_id=target.lead_id and e.status='cancelled' and coalesce(e.updated_at,e.created_at)>=v_recommendation.acted_at)
         or exists (select 1 from public.payments p where p.organization_id=p_organization_id and p.lead_id=target.lead_id and p.status in ('refunded','partially_refunded') and coalesce(p.updated_at,p.created_at)>=v_recommendation.acted_at)) as has_negative,
        greatest(
          coalesce((select max(coalesce(p.paid_at,p.updated_at,p.created_at)) from public.payments p where p.organization_id=p_organization_id and p.lead_id=target.lead_id and p.status in ('paid','refunded','partially_refunded') and coalesce(p.paid_at,p.updated_at,p.created_at)>=v_recommendation.acted_at),'-infinity'::timestamptz),
          coalesce((select max(coalesce(e.enrolled_at,e.updated_at,e.created_at)) from public.enrollments e where e.organization_id=p_organization_id and e.lead_id=target.lead_id and e.status in ('confirmed','completed','cancelled') and coalesce(e.enrolled_at,e.updated_at,e.created_at)>=v_recommendation.acted_at),'-infinity'::timestamptz),
          coalesce((select max(h.changed_at) from public.lead_stage_history h where h.lead_id=target.lead_id and h.changed_at>=v_recommendation.acted_at and h.to_stage in ('contacted','engaged','qualified','high_intent','payment_pending','enrolled','lost','unqualified')),'-infinity'::timestamptz)
        ) as latest_evidence_at
      from unnest(v_recommendation.target_lead_ids) as target(lead_id)
    ) evidence;
    if v_latest_evidence_at='-infinity'::timestamptz then v_latest_evidence_at:=null; end if;
    if v_latest_evidence_at is not null and v_recommendation.last_business_outcome_at is not null and v_latest_evidence_at <= v_recommendation.last_business_outcome_at then continue; end if;
    if coalesce(v_positive_leads,0)>0 and coalesce(v_negative_leads,0)>0 then v_outcome_class:='mixed';
    elsif coalesce(v_positive_leads,0)>0 then v_outcome_class:='positive';
    elsif coalesce(v_negative_leads,0)>0 then v_outcome_class:='negative';
    elsif now()>=v_recommendation.acted_at+interval '72 hours' and v_recommendation.last_business_outcome_at is null then v_outcome_class:='inconclusive'; else continue; end if;
    v_outcome_delta:=coalesce(v_positive_leads,0)-coalesce(v_negative_leads,0);
    v_summary:=left(format('After action start, %s target lead(s) showed positive downstream movement and %s showed negative downstream movement. This is temporal outcome evidence, not causal attribution.',coalesce(v_positive_leads,0),coalesce(v_negative_leads,0)),800);
    insert into public.system_intelligence_recommendation_events(organization_id,recommendation_id,event_type,actor_user_id,outcome_class,outcome_metric,outcome_delta,note)
    values(p_organization_id,v_recommendation.id,'outcome_observed',null,v_outcome_class,'target_lead_business_outcome',v_outcome_delta,left(v_summary,500));
    update public.system_intelligence_recommendations set last_outcome_at=now(),last_outcome_class=v_outcome_class,last_outcome_value=v_outcome_delta,last_business_outcome_at=now(),last_business_outcome_class=v_outcome_class,last_business_outcome_summary=v_summary,updated_at=now() where id=v_recommendation.id and organization_id=p_organization_id;
    v_observed:=v_observed+1; if v_outcome_class='positive' then v_positive:=v_positive+1; end if; if v_outcome_class='negative' then v_negative:=v_negative+1; end if; if v_outcome_class='mixed' then v_mixed:=v_mixed+1; end if; if v_outcome_class='inconclusive' then v_inconclusive:=v_inconclusive+1; end if;
  end loop;
  return query select v_scanned,v_observed,v_positive,v_negative,v_mixed,v_inconclusive;
end; $$;
revoke all on function public.observe_system_intelligence_recommendation_outcomes_v2(uuid,integer) from public, anon, authenticated;
grant execute on function public.observe_system_intelligence_recommendation_outcomes_v2(uuid,integer) to service_role;
comment on function public.observe_system_intelligence_recommendation_outcomes_v2(uuid,integer) is 'R10-P3 trusted machine observer. Uses explicit tenant scope and row locking, records only newer temporal downstream evidence, and never claims causal attribution.';

create or replace function public.recompute_system_intelligence_learning_profile_v2(p_organization_id uuid,p_signal_id text,p_role_scope text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_samples integer:=0; v_positive integer:=0; v_neutral integer:=0; v_negative integer:=0; v_mixed integer:=0; v_inconclusive integer:=0; v_adjustment integer:=0; v_confidence numeric:=0;
begin
  if p_organization_id is null or nullif(btrim(coalesce(p_signal_id,'')),'') is null or nullif(btrim(coalesce(p_role_scope,'')),'') is null then raise exception 'INTELLIGENCE_LEARNING_SCOPE_REQUIRED'; end if;
  if not exists(select 1 from public.organizations o where o.id=p_organization_id and o.status='active') then raise exception 'INTELLIGENCE_ORGANIZATION_NOT_ACTIVE'; end if;
  select count(*) filter(where r.last_business_outcome_class in ('positive','neutral','negative','mixed'))::integer,count(*) filter(where r.last_business_outcome_class='positive')::integer,count(*) filter(where r.last_business_outcome_class='neutral')::integer,count(*) filter(where r.last_business_outcome_class='negative')::integer,count(*) filter(where r.last_business_outcome_class='mixed')::integer,count(*) filter(where r.last_business_outcome_class='inconclusive')::integer
  into v_samples,v_positive,v_neutral,v_negative,v_mixed,v_inconclusive from public.system_intelligence_recommendations r where r.organization_id=p_organization_id and r.signal_id=p_signal_id and r.role_scope=p_role_scope and r.source_version in ('v2','r10-p1') and r.last_business_outcome_class is not null;
  if v_samples>=5 then v_adjustment:=round(8.0*(v_positive-v_negative)/greatest(v_samples,1)); v_adjustment:=greatest(-8,least(8,v_adjustment)); v_confidence:=least(1.0,v_samples/20.0); end if;
  insert into public.system_intelligence_learning_profiles(organization_id,signal_id,role_scope,outcome_samples,positive_count,neutral_count,negative_count,mixed_count,inconclusive_count,score_adjustment,confidence,last_recomputed_at,updated_at)
  values(p_organization_id,p_signal_id,p_role_scope,v_samples,v_positive,v_neutral,v_negative,v_mixed,v_inconclusive,v_adjustment,v_confidence,now(),now())
  on conflict(organization_id,signal_id,role_scope) do update set outcome_samples=excluded.outcome_samples,positive_count=excluded.positive_count,neutral_count=excluded.neutral_count,negative_count=excluded.negative_count,mixed_count=excluded.mixed_count,inconclusive_count=excluded.inconclusive_count,score_adjustment=excluded.score_adjustment,confidence=excluded.confidence,last_recomputed_at=now(),updated_at=now();
  return true;
end; $$;
revoke all on function public.recompute_system_intelligence_learning_profile_v2(uuid,text,text) from public, anon, authenticated;
grant execute on function public.recompute_system_intelligence_learning_profile_v2(uuid,text,text) to service_role;
comment on function public.recompute_system_intelligence_learning_profile_v2(uuid,text,text) is 'R10-P3 trusted descriptive learning recomputation. Each recommendation contributes at most its latest business-outcome class; score_adjustment is not automatically applied to live priority.';

create or replace function public.get_system_intelligence_recommendation_effectiveness_v1()
returns table(signal_id text,role_scope text,category text,recommendation_count bigint,shown_count bigint,accepted_count bigint,dismissed_count bigint,acted_count bigint,outcome_observed_count bigint,positive_count bigint,negative_count bigint,mixed_count bigint,inconclusive_count bigint,action_rate numeric,positive_resolved_rate numeric,negative_resolved_rate numeric,sample_band text)
language plpgsql set search_path=public as $$
declare v_organization_id uuid:=public.current_tenant_organization_id();
begin
 if auth.uid() is null or v_organization_id is null then raise exception 'AUTHENTICATED_TENANT_REQUIRED'; end if;
 if not public.session_is_bound_to_organization(v_organization_id) or not public.is_organization_member(v_organization_id) then raise exception 'TENANT_ACCESS_DENIED'; end if;
 return query with grouped as(select r.signal_id,r.role_scope,r.category,count(*)::bigint recommendation_count,coalesce(sum(r.shown_count),0)::bigint shown_count,count(*) filter(where r.accepted_at is not null)::bigint accepted_count,count(*) filter(where r.dismissed_at is not null)::bigint dismissed_count,count(*) filter(where r.acted_at is not null)::bigint acted_count,count(*) filter(where r.last_business_outcome_class is not null)::bigint outcome_observed_count,count(*) filter(where r.last_business_outcome_class='positive')::bigint positive_count,count(*) filter(where r.last_business_outcome_class='negative')::bigint negative_count,count(*) filter(where r.last_business_outcome_class='mixed')::bigint mixed_count,count(*) filter(where r.last_business_outcome_class='inconclusive')::bigint inconclusive_count from public.system_intelligence_recommendations r where r.organization_id=v_organization_id and r.source_version in ('v2','r10-p1') group by r.signal_id,r.role_scope,r.category), scored as(select g.*,(g.positive_count+g.negative_count+g.mixed_count) resolved_count from grouped g)
 select s.signal_id,s.role_scope,s.category,s.recommendation_count,s.shown_count,s.accepted_count,s.dismissed_count,s.acted_count,s.outcome_observed_count,s.positive_count,s.negative_count,s.mixed_count,s.inconclusive_count,case when s.recommendation_count=0 then null else round(s.acted_count::numeric/s.recommendation_count::numeric,4) end,case when s.resolved_count=0 then null else round(s.positive_count::numeric/s.resolved_count::numeric,4) end,case when s.resolved_count=0 then null else round(s.negative_count::numeric/s.resolved_count::numeric,4) end,case when s.outcome_observed_count<5 then 'insufficient' when s.outcome_observed_count<20 then 'emerging' when s.outcome_observed_count<50 then 'established' else 'mature' end from scored s order by s.outcome_observed_count desc,s.acted_count desc,s.shown_count desc,s.signal_id asc;
end; $$;

create or replace function public.get_system_intelligence_action_completion_effectiveness_v1()
returns table(signal_id text,role_scope text,category text,acted_count bigint,completed_count bigint,started_not_completed_count bigint,completion_rate numeric)
language plpgsql set search_path=public as $$
declare v_organization_id uuid:=public.current_tenant_organization_id();
begin
 if auth.uid() is null or v_organization_id is null then raise exception 'AUTHENTICATED_TENANT_REQUIRED'; end if;
 if not public.session_is_bound_to_organization(v_organization_id) or not public.is_organization_member(v_organization_id) then raise exception 'TENANT_ACCESS_DENIED'; end if;
 return query with grouped as(select r.signal_id,r.role_scope,r.category,count(*) filter(where r.acted_at is not null)::bigint acted_count,count(*) filter(where r.completed_at is not null)::bigint completed_count from public.system_intelligence_recommendations r where r.organization_id=v_organization_id and r.source_version in ('v2','r10-p1') group by r.signal_id,r.role_scope,r.category)
 select g.signal_id,g.role_scope,g.category,g.acted_count,g.completed_count,greatest(g.acted_count-g.completed_count,0)::bigint,case when g.acted_count=0 then null else round(g.completed_count::numeric/g.acted_count::numeric,4) end from grouped g where g.acted_count>0 order by g.completed_count desc,g.acted_count desc,g.signal_id asc;
end; $$;

create or replace function public.sweep_system_intelligence_recommendation_outcomes_v1(p_organization_id uuid default null,p_per_org_limit integer default 50,p_trigger_source text default 'cron')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org record; v_observation record; v_pair record; v_run_id uuid; v_recomputed integer; v_learning_failures integer; v_learning_error text; v_status text; v_scanned_orgs integer:=0; v_success_orgs integer:=0; v_partial_orgs integer:=0; v_failed_orgs integer:=0; v_scanned_recommendations integer:=0; v_observed_events integer:=0; v_positive integer:=0; v_negative integer:=0; v_mixed integer:=0; v_inconclusive integer:=0; v_profiles integer:=0; v_limit integer:=greatest(1,least(coalesce(p_per_org_limit,50),200));
begin
 if p_trigger_source not in ('cron','manual','acceptance') then raise exception 'INTELLIGENCE_OUTCOME_TRIGGER_INVALID'; end if;
 for v_org in select o.id from public.organizations o where o.status='active' and (p_organization_id is null or o.id=p_organization_id) order by o.id loop
  v_scanned_orgs:=v_scanned_orgs+1; v_recomputed:=0; v_learning_failures:=0; v_learning_error:=null;
  insert into public.system_intelligence_outcome_runs(organization_id,trigger_source,status,started_at) values(v_org.id,p_trigger_source,'running',now()) returning id into v_run_id;
  begin
   select * into v_observation from public.observe_system_intelligence_recommendation_outcomes_v2(v_org.id,v_limit);
   for v_pair in select distinct r.signal_id,r.role_scope from public.system_intelligence_recommendations r where r.organization_id=v_org.id and r.source_version in ('v2','r10-p1') and r.last_business_outcome_class is not null order by r.signal_id,r.role_scope loop
    begin perform public.recompute_system_intelligence_learning_profile_v2(v_org.id,v_pair.signal_id,v_pair.role_scope); v_recomputed:=v_recomputed+1;
    exception when others then v_learning_failures:=v_learning_failures+1; if v_learning_error is null then v_learning_error:=left(sqlstate||': '||sqlerrm,1800); end if; end;
   end loop;
   if v_learning_failures>0 then v_status:='partial'; v_partial_orgs:=v_partial_orgs+1; else v_status:='success'; v_success_orgs:=v_success_orgs+1; end if;
   update public.system_intelligence_outcome_runs set status=v_status,recommendations_scanned=coalesce(v_observation.scanned_count,0),outcome_events_recorded=coalesce(v_observation.observed_count,0),positive_count=coalesce(v_observation.positive_count,0),negative_count=coalesce(v_observation.negative_count,0),mixed_count=coalesce(v_observation.mixed_count,0),inconclusive_count=coalesce(v_observation.inconclusive_count,0),learning_profiles_recomputed=v_recomputed,error_message=v_learning_error,completed_at=now() where id=v_run_id and organization_id=v_org.id;
   v_scanned_recommendations:=v_scanned_recommendations+coalesce(v_observation.scanned_count,0); v_observed_events:=v_observed_events+coalesce(v_observation.observed_count,0); v_positive:=v_positive+coalesce(v_observation.positive_count,0); v_negative:=v_negative+coalesce(v_observation.negative_count,0); v_mixed:=v_mixed+coalesce(v_observation.mixed_count,0); v_inconclusive:=v_inconclusive+coalesce(v_observation.inconclusive_count,0); v_profiles:=v_profiles+v_recomputed;
  exception when others then v_failed_orgs:=v_failed_orgs+1; update public.system_intelligence_outcome_runs set status='failed',error_message=left(sqlstate||': '||sqlerrm,2000),completed_at=now() where id=v_run_id and organization_id=v_org.id; end;
 end loop;
 return jsonb_build_object('ok',v_failed_orgs=0 and v_partial_orgs=0,'organizations_scanned',v_scanned_orgs,'organizations_success',v_success_orgs,'organizations_partial',v_partial_orgs,'organizations_failed',v_failed_orgs,'recommendations_scanned',v_scanned_recommendations,'outcome_events_recorded',v_observed_events,'positive_count',v_positive,'negative_count',v_negative,'mixed_count',v_mixed,'inconclusive_count',v_inconclusive,'learning_profiles_recomputed',v_profiles);
end; $$;
revoke all on function public.sweep_system_intelligence_recommendation_outcomes_v1(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.sweep_system_intelligence_recommendation_outcomes_v1(uuid,integer,text) to service_role;
comment on function public.sweep_system_intelligence_recommendation_outcomes_v1(uuid,integer,text) is 'R10-P3 trusted bounded multi-tenant sweep. Isolates organization failures, records operational run telemetry and uses explicit-tenant V2 observer/learning functions.';

create or replace view public.v_system_health with (security_invoker=true) as
with systems as (
 select 'ga4'::text system_key,'Google Analytics 4'::text system_name,'analytics'::text system_group,1800 stale_after_minutes union all
 select 'gsc','Google Search Console','analytics',1800 union all select 'google_ads','Google Ads','advertising',1800 union all select 'meta_ads','Meta Ads','advertising',1800 union all select 'admissions','Admissions Automation','automation',360 union all select 'whatsapp','WhatsApp','messaging',null::integer union all select 'lead_capture','Website Lead Capture','lead_capture',null::integer union all select 'intelligence_outcomes','Recommendation Outcome Learning','intelligence',60
), events as (
 select 'ga4'::text system_key,coalesce(r.completed_at,r.started_at,r.created_at) event_at,r.status,lower(r.status) in ('success','completed') is_success,lower(r.status) in ('failed','error') is_failure,false is_pending,r.error_message,r.organization_id from public.ga4_sync_runs r
 union all select 'gsc',coalesce(r.completed_at,r.started_at),r.status,lower(r.status) in ('success','completed'),lower(r.status) in ('failed','error'),false,r.error_message,r.organization_id from public.gsc_sync_runs r
 union all select 'google_ads',coalesce(r.completed_at,r.started_at),r.status,lower(r.status) in ('success','completed'),lower(r.status) in ('failed','error'),false,r.error_message,r.organization_id from public.google_ads_sync_runs r
 union all select 'meta_ads',coalesce(r.completed_at,r.started_at),r.status,lower(r.status) in ('success','completed'),lower(r.status) in ('failed','error'),false,r.error_message,r.organization_id from public.meta_ads_sync_runs r
 union all select 'admissions',coalesce(r.completed_at,r.started_at),r.status,lower(r.status) in ('success','completed'),lower(r.status) in ('failed','error'),lower(r.status) in ('pending','running','processing'),r.error_message,r.organization_id from public.admissions_auto_task_runs r
 union all select 'whatsapp',coalesce(e.processed_at,e.received_at),e.processing_status,lower(e.processing_status) in ('processed','ignored'),lower(e.processing_status) in ('failed','error'),lower(e.processing_status) in ('received','pending','processing') and e.processed_at is null,e.processing_error,e.organization_id from public.whatsapp_webhook_events e
 union all select 'lead_capture',e.received_at,e.status,lower(e.status) in ('processed','duplicate','success','completed'),lower(e.status) in ('failed','error'),lower(e.status) in ('received','pending','processing'),coalesce(e.metadata->>'error',e.metadata->>'error_message',e.metadata->>'message'),e.organization_id from public.lead_ingest_events e
 union all select 'intelligence_outcomes',coalesce(r.completed_at,r.started_at,r.created_at),r.status,lower(r.status)='success',lower(r.status)='failed',lower(r.status)='running' and r.completed_at is null,r.error_message,r.organization_id from public.system_intelligence_outcome_runs r
), aggregated as (
 select e.organization_id,e.system_key,max(e.event_at) latest_activity_at,max(e.event_at) filter(where e.is_success) last_success_at,max(e.event_at) filter(where e.is_failure) last_failure_at,count(*) filter(where e.event_at>=now()-interval '24 hours') activity_24h,count(*) filter(where e.is_failure and e.event_at>=now()-interval '24 hours') failures_24h,count(*) filter(where e.is_pending) pending_count,min(e.event_at) filter(where e.is_pending) oldest_pending_at from events e group by e.organization_id,e.system_key
), latest_event as (
 select distinct on(e.organization_id,e.system_key) e.organization_id,e.system_key,e.status latest_status,e.error_message latest_error,e.event_at from events e order by e.organization_id,e.system_key,e.event_at desc nulls last
)
select s.system_key,s.system_name,s.system_group,
 case when s.system_key='whatsapp' and a.oldest_pending_at is not null and a.oldest_pending_at<now()-interval '15 minutes' then 'critical' when s.system_key='lead_capture' and a.oldest_pending_at is not null and a.oldest_pending_at<now()-interval '15 minutes' then 'critical' when s.system_key='intelligence_outcomes' and lower(coalesce(l.latest_status,''))='partial' then 'warning' when a.last_failure_at is not null and (a.last_success_at is null or a.last_failure_at>a.last_success_at) then 'critical' when a.latest_activity_at is null then 'warning' when s.stale_after_minutes is not null and (a.last_success_at is null or a.last_success_at<now()-make_interval(mins=>s.stale_after_minutes)) then 'warning' when coalesce(a.failures_24h,0)>0 then 'warning' else 'healthy' end health_status,
 l.latest_status,a.latest_activity_at,a.last_success_at,a.last_failure_at,coalesce(a.activity_24h,0::bigint) activity_24h,coalesce(a.failures_24h,0::bigint) failures_24h,coalesce(a.pending_count,0::bigint) pending_count,a.oldest_pending_at,case when a.oldest_pending_at is not null then extract(epoch from now()-a.oldest_pending_at)/60.0 else null::numeric end oldest_pending_minutes,l.latest_error,s.stale_after_minutes,o.id organization_id
from public.organizations o cross join systems s left join aggregated a on a.organization_id=o.id and a.system_key=s.system_key left join latest_event l on l.organization_id=o.id and l.system_key=s.system_key;
comment on view public.v_system_health is 'Canonical operational health. R10-P3 adds Recommendation Outcome Learning health from the outcome-run ledger; runner health is operational and does not infer business outcome quality.';

do $$ begin if not exists(select 1 from cron.job where jobname='salsys-intelligence-outcome-learning-v1') then perform cron.schedule('salsys-intelligence-outcome-learning-v1','*/15 * * * *',$cron$select public.sweep_system_intelligence_recommendation_outcomes_v1(null,50,'cron');$cron$); end if; end; $$;

commit;