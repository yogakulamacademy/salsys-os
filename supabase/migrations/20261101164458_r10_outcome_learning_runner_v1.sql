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
         or exists (select 1 from public.payments p where p.organization_id=p_organizatio