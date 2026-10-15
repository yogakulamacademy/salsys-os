-- W6-OG8 Experimentation + Learning v1
-- Human-approved SEO experiments with deterministic baselines, explicit changes,
-- measured outcome windows and retained learning. Before/after deltas remain
-- observed evidence and are not treated as proof of causality.

create table if not exists public.seo_experiments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  hypothesis text not null,
  target_kind text not null default 'page'
    check (target_kind in ('page','query','topic','entity','internal_link','other')),
  target_page_id uuid references public.seo_pages(id) on delete set null,
  target_url text,
  source_layer text not null default 'manual',
  source_action text,
  source_reference jsonb not null default '{}'::jsonb,
  primary_metric text not null default 'gsc_clicks'
    check (primary_metric in (
      'gsc_clicks','gsc_impressions','gsc_ctr','gsc_avg_position',
      'ga4_sessions','ga4_engaged_sessions','ga4_key_events',
      'organic_leads','organic_qualified_leads','organic_enrolled_leads',
      'organic_revenue_inr','organic_revenue_usd','ai_referral_sessions'
    )),
  secondary_metrics text[] not null default '{}'::text[],
  status text not null default 'draft'
    check (status in ('draft','approved','running','completed','cancelled')),
  minimum_observation_days integer not null default 14
    check (minimum_observation_days between 1 and 365),
  approved_at timestamptz,
  approved_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  result_classification text
    check (
      result_classification is null
      or result_classification in ('positive','negative','mixed','inconclusive')
    ),
  result_confidence text
    check (
      result_confidence is null
      or result_confidence in ('low','medium','high')
    ),
  learning_summary text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_experiments_org_status_idx
  on public.seo_experiments (organization_id, status, created_at desc);

create index if not exists seo_experiments_org_page_idx
  on public.seo_experiments (organization_id, target_page_id, created_at desc);


create table if not exists public.seo_experiment_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid not null references public.seo_experiments(id) on delete cascade,
  change_type text not null
    check (change_type in ('title_meta','content','internal_link','schema','technical','other')),
  description text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  implementation_method text not null default 'manual'
    check (implementation_method in ('manual','cms','mcp','api','other')),
  status text not null default 'planned'
    check (status in ('planned','applied','rolled_back','failed')),
  applied_at timestamptz,
  applied_by uuid,
  rolled_back_at timestamptz,
  rollback_reason text,
  created_at timestamptz not null default now()
);

create index if not exists seo_experiment_changes_org_experiment_idx
  on public.seo_experiment_changes (organization_id, experiment_id, created_at);


create table if not exists public.seo_experiment_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  experiment_id uuid not null references public.seo_experiments(id) on delete cascade,
  phase text not null check (phase in ('baseline','observation','final')),
  window_start date not null,
  window_end date not null,
  captured_at timestamptz not null default now(),
  gsc_clicks bigint not null default 0,
  gsc_impressions bigint not null default 0,
  gsc_ctr numeric not null default 0,
  gsc_avg_position numeric not null default 0,
  ga4_sessions bigint not null default 0,
  ga4_engaged_sessions bigint not null default 0,
  ga4_key_events numeric not null default 0,
  organic_leads bigint not null default 0,
  organic_qualified_leads bigint not null default 0,
  organic_enrolled_leads bigint not null default 0,
  organic_revenue_inr numeric not null default 0,
  organic_revenue_usd numeric not null default 0,
  ai_referral_sessions bigint not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  check (window_end >= window_start),
  unique (experiment_id, phase, window_start, window_end)
);

create index if not exists seo_experiment_measurements_org_experiment_idx
  on public.seo_experiment_measurements
    (organization_id, experiment_id, phase, captured_at desc);


alter table public.seo_experiments enable row level security;
alter table public.seo_experiment_changes enable row level security;
alter table public.seo_experiment_measurements enable row level security;

drop policy if exists seo_experiments_member_read on public.seo_experiments;
create policy seo_experiments_member_read
on public.seo_experiments
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists seo_experiment_changes_member_read on public.seo_experiment_changes;
create policy seo_experiment_changes_member_read
on public.seo_experiment_changes
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists seo_experiment_measurements_member_read on public.seo_experiment_measurements;
create policy seo_experiment_measurements_member_read
on public.seo_experiment_measurements
for select
to authenticated
using (public.is_organization_member(organization_id));

grant select on public.seo_experiments to authenticated;
grant select on public.seo_experiment_changes to authenticated;
grant select on public.seo_experiment_measurements to authenticated;
grant all on public.seo_experiments to service_role;
grant all on public.seo_experiment_changes to service_role;
grant all on public.seo_experiment_measurements to service_role;


create or replace view public.v_seo_experiment_candidates_v1
with (security_invoker = true)
as
select
  c.organization_id,
  'og4_content'::text as source_layer,
  'page'::text as target_kind,
  c.page_id,
  c.normalized_url,
  c.title,
  c.recommended_action,
  c.action_reason as recommendation,
  c.action_priority_score as priority_score,
  jsonb_build_object(
    'semantic_coverage_score', c.semantic_coverage_score_v1,
    'technical_issue_count', c.technical_issue_count,
    'internal_link_opportunities', c.internal_link_opportunities,
    'word_count', c.word_count
  ) as evidence
from public.v_seo_content_page_intelligence_v1 c
where c.recommended_action not in ('monitor','crawl_page')

union all

select
  r.organization_id,
  'og5_revenue'::text as source_layer,
  'page'::text as target_kind,
  r.page_id,
  r.normalized_url,
  r.title,
  r.recommended_action,
  r.recommendation,
  r.revenue_priority_score_v1 as priority_score,
  jsonb_build_object(
    'gsc_clicks', r.gsc_clicks,
    'gsc_impressions', r.gsc_impressions,
    'organic_leads', r.organic_leads,
    'organic_qualified_leads', r.organic_qualified_leads,
    'organic_enrolled_leads', r.organic_enrolled_leads,
    'organic_revenue_inr', r.organic_revenue_inr,
    'organic_revenue_usd', r.organic_revenue_usd,
    'business_value_signal', r.business_value_signal
  ) as evidence
from public.v_seo_organic_value_page_30d r
where r.recommended_action <> 'monitor'

union all

select
  a.organization_id,
  'og6_aeo'::text as source_layer,
  'page'::text as target_kind,
  a.page_id,
  a.normalized_url,
  a.title,
  a.recommended_action,
  a.recommendation,
  least(
    100,
    a.answer_readiness_score_v1
    + least(20, a.high_opportunity_query_count * 5)
    + case
        when a.answer_impressions >= 500 then 12
        when a.answer_impressions >= 100 then 8
        when a.answer_impressions >= 20 then 4
        else 0
      end
  ) as priority_score,
  jsonb_build_object(
    'answer_readiness_score', a.answer_readiness_score_v1,
    'answer_query_count', a.answer_query_count,
    'high_opportunity_query_count', a.high_opportunity_query_count,
    'answer_impressions', a.answer_impressions,
    'answer_sections', a.answer_heading_count
  ) as evidence
from public.v_seo_aeo_page_readiness_v1 a
where a.recommended_action not in ('monitor','crawl_page')

union all

select
  g.organization_id,
  'og7_geo'::text as source_layer,
  'page'::text as target_kind,
  g.page_id,
  g.normalized_url,
  g.title,
  g.recommended_action,
  g.recommendation,
  least(
    100,
    g.generative_readiness_score_v1
    + case
        when g.ai_referral_sessions >= 20 then 20
        when g.ai_referral_sessions >= 5 then 12
        when g.ai_referral_sessions > 0 then 6
        else 0
      end
    + least(15, g.high_opportunity_answer_queries * 3)
  ) as priority_score,
  jsonb_build_object(
    'generative_readiness_score', g.generative_readiness_score_v1,
    'ai_referral_sessions', g.ai_referral_sessions,
    'ai_linked_leads', g.ai_linked_leads,
    'semantic_coverage_score', g.semantic_coverage_score_v1,
    'answer_readiness_score', g.answer_readiness_score_v1,
    'observed_ai_providers', g.observed_ai_providers
  ) as evidence
from public.v_seo_geo_page_intelligence_v1 g
where g.recommended_action not in ('monitor','crawl_page');

revoke all on table public.v_seo_experiment_candidates_v1 from public, anon;
grant select on table public.v_seo_experiment_candidates_v1 to authenticated, service_role;


create or replace view public.v_seo_experiment_outcomes_v1
with (security_invoker = true)
as
with baseline as materialized (
  select distinct on (m.organization_id, m.experiment_id) m.*
  from public.seo_experiment_measurements m
  where m.phase = 'baseline'
  order by m.organization_id, m.experiment_id, m.captured_at desc
),
outcome as materialized (
  select distinct on (m.organization_id, m.experiment_id) m.*
  from public.seo_experiment_measurements m
  where m.phase in ('final','observation')
  order by
    m.organization_id,
    m.experiment_id,
    case when m.phase = 'final' then 0 else 1 end,
    m.captured_at desc
)
select
  e.organization_id,
  e.id as experiment_id,
  e.title,
  e.hypothesis,
  e.target_kind,
  e.target_page_id,
  e.target_url,
  e.source_layer,
  e.source_action,
  e.primary_metric,
  e.secondary_metrics,
  e.status,
  e.minimum_observation_days,
  e.approved_at,
  e.started_at,
  e.completed_at,
  e.result_classification,
  e.result_confidence,
  e.learning_summary,

  b.window_start as baseline_start,
  b.window_end as baseline_end,
  o.window_start as outcome_start,
  o.window_end as outcome_end,

  b.gsc_clicks as baseline_gsc_clicks,
  o.gsc_clicks as outcome_gsc_clicks,
  coalesce(o.gsc_clicks,0) - coalesce(b.gsc_clicks,0) as delta_gsc_clicks,

  b.gsc_impressions as baseline_gsc_impressions,
  o.gsc_impressions as outcome_gsc_impressions,
  coalesce(o.gsc_impressions,0) - coalesce(b.gsc_impressions,0) as delta_gsc_impressions,

  b.gsc_ctr as baseline_gsc_ctr,
  o.gsc_ctr as outcome_gsc_ctr,
  coalesce(o.gsc_ctr,0) - coalesce(b.gsc_ctr,0) as delta_gsc_ctr,

  b.gsc_avg_position as baseline_gsc_avg_position,
  o.gsc_avg_position as outcome_gsc_avg_position,
  case
    when b.gsc_avg_position is null or o.gsc_avg_position is null then null
    else b.gsc_avg_position - o.gsc_avg_position
  end as position_improvement,

  b.ga4_sessions as baseline_ga4_sessions,
  o.ga4_sessions as outcome_ga4_sessions,
  coalesce(o.ga4_sessions,0) - coalesce(b.ga4_sessions,0) as delta_ga4_sessions,

  b.ga4_engaged_sessions as baseline_ga4_engaged_sessions,
  o.ga4_engaged_sessions as outcome_ga4_engaged_sessions,
  coalesce(o.ga4_engaged_sessions,0) - coalesce(b.ga4_engaged_sessions,0) as delta_ga4_engaged_sessions,

  b.organic_leads as baseline_organic_leads,
  o.organic_leads as outcome_organic_leads,
  coalesce(o.organic_leads,0) - coalesce(b.organic_leads,0) as delta_organic_leads,

  b.organic_qualified_leads as baseline_qualified_leads,
  o.organic_qualified_leads as outcome_qualified_leads,
  coalesce(o.organic_qualified_leads,0) - coalesce(b.organic_qualified_leads,0) as delta_qualified_leads,

  b.organic_enrolled_leads as baseline_enrolled_leads,
  o.organic_enrolled_leads as outcome_enrolled_leads,
  coalesce(o.organic_enrolled_leads,0) - coalesce(b.organic_enrolled_leads,0) as delta_enrolled_leads,

  b.organic_revenue_inr as baseline_revenue_inr,
  o.organic_revenue_inr as outcome_revenue_inr,
  coalesce(o.organic_revenue_inr,0) - coalesce(b.organic_revenue_inr,0) as delta_revenue_inr,

  b.organic_revenue_usd as baseline_revenue_usd,
  o.organic_revenue_usd as outcome_revenue_usd,
  coalesce(o.organic_revenue_usd,0) - coalesce(b.organic_revenue_usd,0) as delta_revenue_usd,

  b.ai_referral_sessions as baseline_ai_referral_sessions,
  o.ai_referral_sessions as outcome_ai_referral_sessions,
  coalesce(o.ai_referral_sessions,0) - coalesce(b.ai_referral_sessions,0) as delta_ai_referral_sessions,

  b.id is not null as has_baseline,
  o.id is not null as has_outcome
from public.seo_experiments e
left join baseline b
  on b.organization_id = e.organization_id
 and b.experiment_id = e.id
left join outcome o
  on o.organization_id = e.organization_id
 and o.experiment_id = e.id;

revoke all on table public.v_seo_experiment_outcomes_v1 from public, anon;
grant select on table public.v_seo_experiment_outcomes_v1 to authenticated, service_role;


create or replace function public.create_seo_experiment(
  p_organization_id uuid,
  p_title text,
  p_hypothesis text,
  p_target_page_id uuid default null,
  p_target_url text default null,
  p_source_layer text default 'manual',
  p_source_action text default null,
  p_source_reference jsonb default '{}'::jsonb,
  p_primary_metric text default 'gsc_clicks',
  p_secondary_metrics text[] default '{}'::text[],
  p_minimum_observation_days integer default 14
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_id uuid;
  v_url text;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;

  if nullif(btrim(p_title),'') is null or nullif(btrim(p_hypothesis),'') is null then
    raise exception 'Title and hypothesis are required';
  end if;

  if p_target_page_id is not null then
    select normalized_url
    into v_url
    from public.seo_pages
    where id = p_target_page_id
      and organization_id = p_organization_id;

    if not found then
      raise exception 'Target page is not available in this organization';
    end if;
  end if;

  insert into public.seo_experiments(
    organization_id,
    title,
    hypothesis,
    target_kind,
    target_page_id,
    target_url,
    source_layer,
    source_action,
    source_reference,
    primary_metric,
    secondary_metrics,
    minimum_observation_days,
    created_by
  )
  values (
    p_organization_id,
    btrim(p_title),
    btrim(p_hypothesis),
    'page',
    p_target_page_id,
    coalesce(nullif(btrim(p_target_url),''), v_url),
    coalesce(nullif(btrim(p_source_layer),''), 'manual'),
    p_source_action,
    coalesce(p_source_reference,'{}'::jsonb),
    p_primary_metric,
    coalesce(p_secondary_metrics,'{}'::text[]),
    p_minimum_observation_days,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$function$;


create or replace function public.transition_seo_experiment(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_new_status text
)
returns public.seo_experiments
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_current public.seo_experiments;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;

  select *
  into v_current
  from public.seo_experiments
  where id = p_experiment_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Experiment not found';
  end if;

  if not (
    (v_current.status='draft' and p_new_status in ('approved','cancelled'))
    or (v_current.status='approved' and p_new_status in ('running','cancelled'))
    or (v_current.status='running' and p_new_status in ('completed','cancelled'))
  ) then
    raise exception 'Invalid experiment status transition: % -> %',
      v_current.status, p_new_status;
  end if;

  update public.seo_experiments
  set
    status = p_new_status,
    approved_at = case when p_new_status='approved' then now() else approved_at end,
    approved_by = case when p_new_status='approved' then auth.uid() else approved_by end,
    started_at = case when p_new_status='running' then now() else started_at end,
    completed_at = case when p_new_status='completed' then now() else completed_at end,
    cancelled_at = case when p_new_status='cancelled' then now() else cancelled_at end,
    updated_at = now()
  where id = p_experiment_id
    and organization_id = p_organization_id
  returning * into v_current;

  return v_current;
end;
$function$;


create or replace function public.record_seo_experiment_change(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_change_type text,
  p_description text,
  p_before_state jsonb default '{}'::jsonb,
  p_after_state jsonb default '{}'::jsonb,
  p_implementation_method text default 'manual',
  p_status text default 'applied'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_id uuid;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;

  if not exists (
    select 1
    from public.seo_experiments
    where id = p_experiment_id
      and organization_id = p_organization_id
  ) then
    raise exception 'Experiment not found';
  end if;

  insert into public.seo_experiment_changes(
    organization_id,
    experiment_id,
    change_type,
    description,
    before_state,
    after_state,
    implementation_method,
    status,
    applied_at,
    applied_by
  )
  values (
    p_organization_id,
    p_experiment_id,
    p_change_type,
    btrim(p_description),
    coalesce(p_before_state,'{}'::jsonb),
    coalesce(p_after_state,'{}'::jsonb),
    p_implementation_method,
    p_status,
    case when p_status='applied' then now() else null end,
    case when p_status='applied' then auth.uid() else null end
  )
  returning id into v_id;

  return v_id;
end;
$function$;


create or replace function public.capture_seo_experiment_measurement(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_phase text,
  p_window_start date,
  p_window_end date
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_experiment public.seo_experiments;
  v_page_url text;
  v_page_path text;
  v_page_key text;
  v_path_key text;
  v_id uuid;

  v_gsc_clicks bigint := 0;
  v_gsc_impressions bigint := 0;
  v_gsc_ctr numeric := 0;
  v_gsc_position numeric := 0;

  v_ga4_sessions bigint := 0;
  v_ga4_engaged bigint := 0;
  v_ga4_events numeric := 0;

  v_leads bigint := 0;
  v_qualified bigint := 0;
  v_enrolled bigint := 0;

  v_revenue_inr numeric(14,2) := 0;
  v_revenue_usd numeric(14,2) := 0;
  v_ai_sessions bigint := 0;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;

  if p_phase not in ('baseline','observation','final') then
    raise exception 'Invalid phase';
  end if;

  if p_window_start is null or p_window_end is null or p_window_end < p_window_start then
    raise exception 'Invalid measurement window';
  end if;

  select *
  into v_experiment
  from public.seo_experiments
  where id = p_experiment_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'Experiment not found';
  end if;

  if v_experiment.target_page_id is null then
    raise exception 'Automatic v1 measurement capture requires a page target';
  end if;

  select normalized_url, url_path
  into v_page_url, v_page_path
  from public.v_seo_page_inventory
  where organization_id = p_organization_id
    and page_id = v_experiment.target_page_id;

  if not found then
    raise exception 'Target page evidence not found';
  end if;

  v_page_key := lower(regexp_replace(regexp_replace(v_page_url,'[?#].*$',''),'/+$',''));
  v_path_key := lower(regexp_replace(regexp_replace(v_page_path,'[?#].*$',''),'/+$',''));

  select
    coalesce(sum(d.clicks),0)::bigint,
    coalesce(sum(d.impressions),0)::bigint,
    case
      when coalesce(sum(d.impressions),0)>0
        then round(sum(d.clicks)::numeric/sum(d.impressions)::numeric,8)
      else 0
    end,
    case
      when coalesce(sum(d.impressions),0)>0
        then round(
          sum(d.avg_position*d.impressions::numeric)
          / sum(d.impressions)::numeric,
          2
        )
      else 0
    end
  into
    v_gsc_clicks,
    v_gsc_impressions,
    v_gsc_ctr,
    v_gsc_position
  from public.gsc_page_daily d
  where d.organization_id = p_organization_id
    and d.date between p_window_start and p_window_end
    and lower(regexp_replace(regexp_replace(btrim(d.page),'[?#].*$',''),'/+$','')) = v_page_key;

  select
    coalesce(sum(g.sessions),0)::bigint,
    coalesce(sum(g.engaged_sessions),0)::bigint,
    coalesce(sum(g.key_events),0)::numeric
  into
    v_ga4_sessions,
    v_ga4_engaged,
    v_ga4_events
  from public.ga4_landing_page_daily g
  where g.organization_id = p_organization_id
    and g.analytics_date between p_window_start and p_window_end
    and lower(regexp_replace(regexp_replace(btrim(g.landing_page),'[?#].*$',''),'/+$',''))
      in (v_page_key,v_path_key);

  with organic as materialized (
    select
      l.id,
      l.current_stage::text as current_stage
    from public.leads l
    where l.organization_id = p_organization_id
      and (l.created_at at time zone 'Asia/Kolkata')::date
        between p_window_start and p_window_end
      and lower(coalesce(l.first_touch_source,'')) in ('google','google.com')
      and lower(coalesce(l.first_touch_medium,'')) in ('organic','organic_search','organic search')
      and lower(
        regexp_replace(
          regexp_replace(coalesce(btrim(l.landing_page),''),'[?#].*$',''),
          '/+$',
          ''
        )
      ) in (v_page_key,v_path_key)
  )
  select
    count(*)::bigint,
    count(*) filter (
      where current_stage in ('qualified','high_intent','payment_pending','enrolled')
    )::bigint,
    count(*) filter (where current_stage='enrolled')::bigint
  into
    v_leads,
    v_qualified,
    v_enrolled
  from organic;

  with page_leads as materialized (
    select l.id
    from public.leads l
    where l.organization_id = p_organization_id
      and lower(coalesce(l.first_touch_source,'')) in ('google','google.com')
      and lower(coalesce(l.first_touch_medium,'')) in ('organic','organic_search','organic search')
      and lower(
        regexp_replace(
          regexp_replace(coalesce(btrim(l.landing_page),''),'[?#].*$',''),
          '/+$',
          ''
        )
      ) in (v_page_key,v_path_key)
  )
  select
    coalesce(sum(
      case
        when upper(p.currency)='INR'
          and p.payment_kind::text<>'refund'
          and p.status::text='paid'
          then p.amount
        when upper(p.currency)='INR'
          and p.payment_kind::text='refund'
          and p.status::text in ('refunded','paid')
          then -p.amount
        else 0
      end
    ),0)::numeric(14,2),
    coalesce(sum(
      case
        when upper(p.currency)='USD'
          and p.payment_kind::text<>'refund'
          and p.status::text='paid'
          then p.amount
        when upper(p.currency)='USD'
          and p.payment_kind::text='refund'
          and p.status::text in ('refunded','paid')
          then -p.amount
        else 0
      end
    ),0)::numeric(14,2)
  into
    v_revenue_inr,
    v_revenue_usd
  from public.payments p
  join page_leads l
    on l.id = p.lead_id
  where p.organization_id = p_organization_id
    and (coalesce(p.paid_at,p.created_at) at time zone 'Asia/Kolkata')::date
      between p_window_start and p_window_end;

  select count(*)::bigint
  into v_ai_sessions
  from public.web_sessions s
  where s.organization_id = p_organization_id
    and (s.started_at at time zone 'Asia/Kolkata')::date
      between p_window_start and p_window_end
    and lower(
      regexp_replace(
        regexp_replace(coalesce(btrim(s.landing_page),''),'[?#].*$',''),
        '/+$',
        ''
      )
    ) in (v_page_key,v_path_key)
    and (
      lower(coalesce(s.source,'')) ~
        '(^|[./_-])(chatgpt|openai|perplexity|gemini|bard|copilot|claude|anthropic|you|phind|poe|mistral)([./_-]|$)'
      or lower(coalesce(s.referrer,'')) ~
        '(chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|copilot\.com|claude\.ai|anthropic\.com|you\.com|phind\.com|poe\.com|mistral\.ai)'
      or lower(coalesce(s.medium,'')) in (
        'ai-assistant','ai_assistant','assistant','generative-ai','generative_ai'
      )
    );

  insert into public.seo_experiment_measurements(
    organization_id,
    experiment_id,
    phase,
    window_start,
    window_end,
    gsc_clicks,
    gsc_impressions,
    gsc_ctr,
    gsc_avg_position,
    ga4_sessions,
    ga4_engaged_sessions,
    ga4_key_events,
    organic_leads,
    organic_qualified_leads,
    organic_enrolled_leads,
    organic_revenue_inr,
    organic_revenue_usd,
    ai_referral_sessions,
    evidence
  )
  values (
    p_organization_id,
    p_experiment_id,
    p_phase,
    p_window_start,
    p_window_end,
    v_gsc_clicks,
    v_gsc_impressions,
    v_gsc_ctr,
    v_gsc_position,
    v_ga4_sessions,
    v_ga4_engaged,
    v_ga4_events,
    v_leads,
    v_qualified,
    v_enrolled,
    v_revenue_inr,
    v_revenue_usd,
    v_ai_sessions,
    jsonb_build_object(
      'capture_version','seo_experiment_measurement_v1',
      'target_url',v_page_url,
      'target_path',v_page_path,
      'captured_at',now(),
      'lead_stage_note',
        'Lead-stage counts use the current stage at capture time for leads created in the measurement window.',
      'measurement_note',
        'GSC, GA4, CRM, payment and first-party AI-referral evidence are separate measurement systems and are not forced to reconcile.'
    )
  )
  on conflict (experiment_id,phase,window_start,window_end)
  do update set
    captured_at = now(),
    gsc_clicks = excluded.gsc_clicks,
    gsc_impressions = excluded.gsc_impressions,
    gsc_ctr = excluded.gsc_ctr,
    gsc_avg_position = excluded.gsc_avg_position,
    ga4_sessions = excluded.ga4_sessions,
    ga4_engaged_sessions = excluded.ga4_engaged_sessions,
    ga4_key_events = excluded.ga4_key_events,
    organic_leads = excluded.organic_leads,
    organic_qualified_leads = excluded.organic_qualified_leads,
    organic_enrolled_leads = excluded.organic_enrolled_leads,
    organic_revenue_inr = excluded.organic_revenue_inr,
    organic_revenue_usd = excluded.organic_revenue_usd,
    ai_referral_sessions = excluded.ai_referral_sessions,
    evidence = excluded.evidence
  returning id into v_id;

  return v_id;
end;
$function$;


create or replace function public.complete_seo_experiment_learning(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_result_classification text,
  p_result_confidence text,
  p_learning_summary text
)
returns public.seo_experiments
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_row public.seo_experiments;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;

  if p_result_classification not in ('positive','negative','mixed','inconclusive') then
    raise exception 'Invalid result classification';
  end if;

  if p_result_confidence not in ('low','medium','high') then
    raise exception 'Invalid result confidence';
  end if;

  if nullif(btrim(p_learning_summary),'') is null then
    raise exception 'Learning summary is required';
  end if;

  select *
  into v_row
  from public.seo_experiments
  where id = p_experiment_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Experiment not found';
  end if;

  if v_row.status not in ('running','completed') then
    raise exception 'Experiment must be running or completed before recording learning';
  end if;

  if not exists (
    select 1
    from public.seo_experiment_measurements
    where experiment_id = p_experiment_id
      and organization_id = p_organization_id
      and phase = 'baseline'
  ) then
    raise exception 'Baseline measurement is required';
  end if;

  if not exists (
    select 1
    from public.seo_experiment_measurements
    where experiment_id = p_experiment_id
      and organization_id = p_organization_id
      and phase in ('observation','final')
  ) then
    raise exception 'Outcome measurement is required';
  end if;

  update public.seo_experiments
  set
    status = 'completed',
    completed_at = coalesce(completed_at,now()),
    result_classification = p_result_classification,
    result_confidence = p_result_confidence,
    learning_summary = btrim(p_learning_summary),
    updated_at = now()
  where id = p_experiment_id
    and organization_id = p_organization_id
  returning * into v_row;

  return v_row;
end;
$function$;


create or replace function public.get_seo_experiment_intelligence(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_payload jsonb;
begin
  if p_organization_id is null
    or not public.is_organization_member(p_organization_id)
  then
    raise exception 'Not authorized for organization';
  end if;

  with experiments as materialized (
    select *
    from public.v_seo_experiment_outcomes_v1
    where organization_id = p_organization_id
  ),
  candidates as materialized (
    select c.*
    from public.v_seo_experiment_candidates_v1 c
    where c.organization_id = p_organization_id
      and not exists (
        select 1
        from public.seo_experiments e
        where e.organization_id = c.organization_id
          and e.target_page_id = c.page_id
          and e.source_layer = c.source_layer
          and coalesce(e.source_action,'') = coalesce(c.recommended_action,'')
          and e.status in ('draft','approved','running')
      )
  ),
  changes as materialized (
    select c.*
    from public.seo_experiment_changes c
    where c.organization_id = p_organization_id
  ),
  summary as (
    select jsonb_build_object(
      'total_experiments', count(*)::bigint,
      'draft_experiments', count(*) filter (where status='draft')::bigint,
      'approved_experiments', count(*) filter (where status='approved')::bigint,
      'running_experiments', count(*) filter (where status='running')::bigint,
      'completed_experiments', count(*) filter (where status='completed')::bigint,
      'cancelled_experiments', count(*) filter (where status='cancelled')::bigint,
      'experiments_with_baseline', count(*) filter (where has_baseline)::bigint,
      'experiments_with_outcome', count(*) filter (where has_outcome)::bigint,
      'positive_learnings', count(*) filter (where result_classification='positive')::bigint,
      'negative_learnings', count(*) filter (where result_classification='negative')::bigint,
      'mixed_learnings', count(*) filter (where result_classification='mixed')::bigint,
      'inconclusive_learnings', count(*) filter (where result_classification='inconclusive')::bigint,
      'applied_changes', (
        select count(*)::bigint
        from changes
        where status='applied'
      ),
      'candidate_actions', (
        select count(*)::bigint
        from candidates
      )
    ) as payload
    from experiments
  ),
  experiment_payload as (
    select coalesce(
      jsonb_agg(to_jsonb(x) order by x.created_at desc),
      '[]'::jsonb
    ) as payload
    from (
      select
        o.*,
        e.created_at,
        e.updated_at,
        (
          select count(*)::bigint
          from changes c
          where c.experiment_id = o.experiment_id
        ) as change_count
      from experiments o
      join public.seo_experiments e
        on e.organization_id = o.organization_id
       and e.id = o.experiment_id
      order by e.created_at desc
      limit 50
    ) x
  ),
  candidate_payload as (
    select coalesce(
      jsonb_agg(
        to_jsonb(x)
        order by x.priority_score desc, x.source_layer, x.normalized_url
      ),
      '[]'::jsonb
    ) as payload
    from (
      select *
      from candidates
      order by priority_score desc, source_layer, normalized_url
      limit 40
    ) x
  )
  select jsonb_build_object(
    'summary', s.payload,
    'experiments', e.payload,
    'candidates', c.payload,
    'guardrails', jsonb_build_object(
      'human_approval_required', true,
      'automatic_publishing', false,
      'raw_evidence_overwritten', false,
      'causality_claimed', false,
      'note',
        'Experiment outcomes compare observed windows. Deltas are evidence, not proof of causality; seasonality, ranking volatility and external changes can affect results.'
    )
  )
  into v_payload
  from summary s
  cross join experiment_payload e
  cross join candidate_payload c;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'summary','{}'::jsonb,
      'experiments','[]'::jsonb,
      'candidates','[]'::jsonb
    )
  );
end;
$function$;


revoke all on function public.create_seo_experiment(
  uuid,text,text,uuid,text,text,text,jsonb,text,text[],integer
) from public, anon;
grant execute on function public.create_seo_experiment(
  uuid,text,text,uuid,text,text,text,jsonb,text,text[],integer
) to authenticated, service_role;

revoke all on function public.transition_seo_experiment(uuid,uuid,text)
  from public, anon;
grant execute on function public.transition_seo_experiment(uuid,uuid,text)
  to authenticated, service_role;

revoke all on function public.record_seo_experiment_change(
  uuid,uuid,text,text,jsonb,jsonb,text,text
) from public, anon;
grant execute on function public.record_seo_experiment_change(
  uuid,uuid,text,text,jsonb,jsonb,text,text
) to authenticated, service_role;

revoke all on function public.capture_seo_experiment_measurement(
  uuid,uuid,text,date,date
) from public, anon;
grant execute on function public.capture_seo_experiment_measurement(
  uuid,uuid,text,date,date
) to authenticated, service_role;

revoke all on function public.complete_seo_experiment_learning(
  uuid,uuid,text,text,text
) from public, anon;
grant execute on function public.complete_seo_experiment_learning(
  uuid,uuid,text,text,text
) to authenticated, service_role;

revoke all on function public.get_seo_experiment_intelligence(uuid)
  from public, anon;
grant execute on function public.get_seo_experiment_intelligence(uuid)
  to authenticated, service_role;

comment on table public.seo_experiments is
'W6-OG8 tenant-scoped SEO experiment lifecycle. Experiments require human approval before execution.';

comment on table public.seo_experiment_measurements is
'Observed experiment-window evidence from Search Console, GA4, CRM, payments and first-party AI referral tracking.';

comment on function public.get_seo_experiment_intelligence(uuid) is
'Tenant-scoped W6-OG8 Experimentation + Learning workspace. Before/after deltas are evidence and do not assert causality.';
