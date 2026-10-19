begin;

-- Universal, append-only feature evidence that can support traffic, SEO, paid
-- media, lead and revenue predictions without making any one model authoritative.
create table if not exists public.event_intelligence_feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null,
  subject_key text not null,
  feature_set text not null,
  feature_version text not null default 'v1',
  feature_payload jsonb not null default '{}'::jsonb,
  feature_hash text not null,
  reason_codes text[] not null default '{}'::text[],
  source_watermark jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (subject_type in ('visitor','session','lead','page','campaign','source','site','content','custom')),
  check (nullif(btrim(subject_key),'') is not null),
  check (nullif(btrim(feature_set),'') is not null),
  check (nullif(btrim(feature_version),'') is not null)
);

create index if not exists idx_event_intelligence_features_subject
  on public.event_intelligence_feature_snapshots(
    organization_id,subject_type,subject_key,feature_set,observed_at desc
  );
create index if not exists idx_event_intelligence_features_recent
  on public.event_intelligence_feature_snapshots(organization_id,observed_at desc);
create index if not exists idx_event_intelligence_features_hash
  on public.event_intelligence_feature_snapshots(organization_id,feature_hash);

-- Universal prediction evidence. Lead-scoring-specific tables remain valid; this
-- table is for cross-domain predictions such as traffic, SEO, ad quality,
-- conversion probability, anomaly risk and expected value.
create table if not exists public.event_intelligence_predictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null,
  subject_key text not null,
  prediction_type text not null,
  model_key text not null,
  model_version text not null,
  feature_snapshot_id uuid references public.event_intelligence_feature_snapshots(id) on delete set null,
  probability numeric,
  predicted_value numeric,
  predicted_unit text,
  confidence numeric,
  confidence_band text,
  reason_codes text[] not null default '{}'::text[],
  explanation jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active',
  actual_outcome jsonb,
  outcome_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_type in ('visitor','session','lead','page','campaign','source','site','content','custom')),
  check (nullif(btrim(subject_key),'') is not null),
  check (nullif(btrim(prediction_type),'') is not null),
  check (nullif(btrim(model_key),'') is not null),
  check (nullif(btrim(model_version),'') is not null),
  check (probability is null or (probability >= 0 and probability <= 1)),
  check (confidence is null or (confidence >= 0 and confidence <= 1)),
  check (status in ('active','superseded','resolved','expired'))
);

create index if not exists idx_event_intelligence_predictions_subject
  on public.event_intelligence_predictions(
    organization_id,subject_type,subject_key,prediction_type,generated_at desc
  );
create index if not exists idx_event_intelligence_predictions_active
  on public.event_intelligence_predictions(organization_id,prediction_type,generated_at desc)
  where status='active';

-- Derived visitor features. This intentionally uses only tenant-scoped canonical
-- sessions/touchpoints plus the exact visitor identity link. It does not perform
-- fuzzy identity resolution.
create or replace view public.v_event_intelligence_visitor_features_v1
with (security_invoker=true)
as
with session_stats as (
  select
    ws.organization_id,
    ws.anonymous_visitor_id,
    min(ws.started_at) as first_seen_at,
    max(coalesce(ws.last_seen_at,ws.ended_at,ws.started_at)) as last_seen_at,
    count(*) filter (where ws.started_at >= now() - interval '1 day') as sessions_1d,
    count(*) filter (where ws.started_at >= now() - interval '7 days') as sessions_7d,
    count(*) filter (where ws.started_at >= now() - interval '30 days') as sessions_30d,
    count(distinct coalesce(nullif(ws.source,''),nullif(ws.utm_source,''),'direct'))
      filter (where ws.started_at >= now() - interval '30 days') as source_diversity_30d,
    count(*) filter (
      where ws.started_at >= now() - interval '30 days'
        and lower(coalesce(ws.medium,ws.utm_medium,'')) in ('cpc','ppc','paid','paid_social','paid-search','paid_search')
    ) as paid_sessions_30d,
    count(*) filter (
      where ws.started_at >= now() - interval '30 days'
        and lower(coalesce(ws.medium,ws.utm_medium,'')) in ('organic','organic_search','seo')
    ) as organic_sessions_30d,
    max(ws.lead_id) filter (where ws.lead_id is not null) as session_lead_id
  from public.web_sessions ws
  where nullif(btrim(ws.anonymous_visitor_id),'') is not null
  group by ws.organization_id,ws.anonymous_visitor_id
),
touch_stats as (
  select
    tp.organization_id,
    tp.anonymous_visitor_id,
    count(*) filter (where tp.occurred_at >= now() - interval '1 day') as events_1d,
    count(*) filter (where tp.occurred_at >= now() - interval '7 days') as events_7d,
    count(*) filter (where tp.occurred_at >= now() - interval '30 days') as events_30d,
    count(*) filter (
      where tp.occurred_at >= now() - interval '7 days'
        and tp.event_type in ('page_view','web.page_viewed')
    ) as page_views_7d,
    count(*) filter (
      where tp.occurred_at >= now() - interval '30 days'
        and tp.event_type in ('page_view','web.page_viewed')
    ) as page_views_30d,
    count(*) filter (
      where tp.occurred_at >= now() - interval '30 days'
        and tp.event_type in ('cta_click','enrollment_cta_click','whatsapp_click','phone_click','instagram_click','web.cta_clicked')
    ) as cta_events_30d,
    count(*) filter (
      where tp.occurred_at >= now() - interval '30 days'
        and tp.event_type in ('form_start','web.form_started')
    ) as form_starts_30d,
    count(*) filter (
      where tp.occurred_at >= now() - interval '30 days'
        and tp.event_type in ('lead_form_submit','form_submit','web.form_submitted')
    ) as form_submits_30d,
    count(*) filter (
      where tp.occurred_at >= now() - interval '30 days'
        and tp.event_type='whatsapp_click'
    ) as whatsapp_clicks_30d,
    count(distinct coalesce(nullif(tp.source,''),nullif(tp.utm_source,'')))
      filter (where tp.occurred_at >= now() - interval '30 days') as touch_source_diversity_30d,
    max(tp.occurred_at) as last_event_at,
    max(tp.lead_id) filter (where tp.lead_id is not null) as touch_lead_id
  from public.touchpoints tp
  where nullif(btrim(tp.anonymous_visitor_id),'') is not null
  group by tp.organization_id,tp.anonymous_visitor_id
),
identity as (
  select distinct on (vil.organization_id,vil.anonymous_visitor_id)
    vil.organization_id,
    vil.anonymous_visitor_id,
    vil.lead_id,
    vil.last_session_key,
    vil.linked_at,
    vil.updated_at
  from public.visitor_identity_links vil
  where nullif(btrim(vil.anonymous_visitor_id),'') is not null
  order by vil.organization_id,vil.anonymous_visitor_id,vil.updated_at desc nulls last,vil.linked_at desc
)
select
  s.organization_id,
  s.anonymous_visitor_id,
  coalesce(i.lead_id,t.touch_lead_id,s.session_lead_id) as lead_id,
  s.first_seen_at,
  greatest(s.last_seen_at,coalesce(t.last_event_at,s.last_seen_at)) as last_seen_at,
  greatest(0,extract(epoch from (now()-greatest(s.last_seen_at,coalesce(t.last_event_at,s.last_seen_at))))/86400.0) as days_since_last_activity,
  s.sessions_1d,
  s.sessions_7d,
  s.sessions_30d,
  coalesce(t.events_1d,0) as events_1d,
  coalesce(t.events_7d,0) as events_7d,
  coalesce(t.events_30d,0) as events_30d,
  coalesce(t.page_views_7d,0) as page_views_7d,
  coalesce(t.page_views_30d,0) as page_views_30d,
  coalesce(t.cta_events_30d,0) as cta_events_30d,
  coalesce(t.form_starts_30d,0) as form_starts_30d,
  coalesce(t.form_submits_30d,0) as form_submits_30d,
  coalesce(t.whatsapp_clicks_30d,0) as whatsapp_clicks_30d,
  greatest(s.source_diversity_30d,coalesce(t.touch_source_diversity_30d,0)) as source_diversity_30d,
  s.paid_sessions_30d,
  s.organic_sessions_30d,
  (s.sessions_30d > 1) as is_returning_30d,
  (coalesce(i.lead_id,t.touch_lead_id,s.session_lead_id) is not null) as is_identified,
  i.last_session_key as identity_last_session_key,
  i.linked_at as identity_linked_at
from session_stats s
left join touch_stats t
  on t.organization_id=s.organization_id
 and t.anonymous_visitor_id=s.anonymous_visitor_id
left join identity i
  on i.organization_id=s.organization_id
 and i.anonymous_visitor_id=s.anonymous_visitor_id;

-- Baseline-aware tracking anomaly view. This is explicitly deterministic v1,
-- not an ML claim. It gives the future prediction layer a clean health feature
-- while catching silent collection outages automatically.
create or replace view public.v_event_intelligence_tracking_anomaly_v1
with (security_invoker=true)
as
with hourly as (
  select
    ts.organization_id,
    ts.id as tracking_source_id,
    date_trunc('hour',re.received_at) as bucket,
    count(*)::numeric as event_count
  from public.tracking_sources ts
  left join public.raw_events re
    on re.organization_id=ts.organization_id
   and re.tracking_source_id=ts.id
   and re.received_at >= now()-interval '14 days'
  where ts.status='active'
  group by ts.organization_id,ts.id,date_trunc('hour',re.received_at)
),
baseline as (
  select
    h.organization_id,
    h.tracking_source_id,
    avg(h.event_count) filter (
      where h.bucket < date_trunc('hour',now())
        and h.bucket >= date_trunc('hour',now())-interval '7 days'
    ) as avg_events_per_observed_hour_7d,
    percentile_cont(0.5) within group (order by h.event_count) filter (
      where h.bucket < date_trunc('hour',now())
        and h.bucket >= date_trunc('hour',now())-interval '14 days'
    ) as median_events_per_observed_hour_14d
  from hourly h
  group by h.organization_id,h.tracking_source_id
),
recent as (
  select
    ts.organization_id,
    ts.id as tracking_source_id,
    ts.name,
    ts.hostname,
    ts.source_type,
    ts.source_system,
    ts.status,
    ts.last_seen_at,
    count(re.id) filter (where re.received_at >= now()-interval '15 minutes') as events_15m,
    count(re.id) filter (where re.received_at >= now()-interval '1 hour') as events_1h,
    count(re.id) filter (where re.received_at >= now()-interval '24 hours') as events_24h,
    count(re.id) filter (
      where re.received_at >= now()-interval '24 hours' and rp.status='failed'
    ) as failed_24h,
    count(re.id) filter (
      where re.received_at >= now()-interval '24 hours' and rp.status='dead_letter'
    ) as dead_letter_24h,
    max(re.received_at) as latest_event_at
  from public.tracking_sources ts
  left join public.raw_events re
    on re.organization_id=ts.organization_id
   and re.tracking_source_id=ts.id
   and re.received_at >= now()-interval '24 hours'
  left join public.raw_event_processing rp
    on rp.organization_id=re.organization_id
   and rp.raw_event_id=re.id
  where ts.status='active'
  group by ts.organization_id,ts.id,ts.name,ts.hostname,ts.source_type,ts.source_system,ts.status,ts.last_seen_at
),
scored as (
  select
    r.*,
    coalesce(b.avg_events_per_observed_hour_7d,0)::numeric as baseline_events_per_hour_7d,
    coalesce(b.median_events_per_observed_hour_14d,0)::numeric as baseline_median_per_hour_14d,
    case
      when coalesce(b.avg_events_per_observed_hour_7d,0) <= 0 then null
      else r.events_1h::numeric / nullif(b.avg_events_per_observed_hour_7d,0)
    end as pace_ratio,
    case
      when r.latest_event_at is null then null
      else extract(epoch from (now()-r.latest_event_at))/60.0
    end as minutes_since_latest_event,
    case
      when r.events_24h=0 then 0::numeric
      else (r.failed_24h+r.dead_letter_24h)::numeric/r.events_24h::numeric
    end as processing_failure_rate_24h
  from recent r
  left join baseline b
    on b.organization_id=r.organization_id
   and b.tracking_source_id=r.tracking_source_id
)
select
  s.*,
  case
    when s.baseline_events_per_hour_7d < 1 then 0
    when s.latest_event_at is null then 100
    when s.minutes_since_latest_event >= 180 and s.baseline_events_per_hour_7d >= 2 then 100
    when s.processing_failure_rate_24h >= 0.10 then 95
    when s.events_1h=0 and s.baseline_events_per_hour_7d >= 4 then 90
    when s.pace_ratio is not null and s.pace_ratio < 0.25 and s.baseline_events_per_hour_7d >= 4 then 80
    when s.processing_failure_rate_24h >= 0.03 then 70
    when s.pace_ratio is not null and s.pace_ratio < 0.50 and s.baseline_events_per_hour_7d >= 4 then 60
    else 0
  end as anomaly_score,
  array_remove(array[
    case when s.baseline_events_per_hour_7d < 1 then 'insufficient_baseline' end,
    case when s.latest_event_at is null then 'no_events_seen' end,
    case when s.minutes_since_latest_event >= 180 and s.baseline_events_per_hour_7d >= 2 then 'collection_stale' end,
    case when s.events_1h=0 and s.baseline_events_per_hour_7d >= 4 then 'zero_recent_events' end,
    case when s.pace_ratio is not null and s.pace_ratio < 0.25 and s.baseline_events_per_hour_7d >= 4 then 'event_pace_severely_below_baseline' end,
    case when s.pace_ratio is not null and s.pace_ratio >= 0.25 and s.pace_ratio < 0.50 and s.baseline_events_per_hour_7d >= 4 then 'event_pace_below_baseline' end,
    case when s.processing_failure_rate_24h >= 0.10 then 'processing_failure_rate_critical' end,
    case when s.processing_failure_rate_24h >= 0.03 and s.processing_failure_rate_24h < 0.10 then 'processing_failure_rate_elevated' end
  ],null) as reason_codes,
  case
    when s.baseline_events_per_hour_7d < 1 then 'no_baseline'
    when s.latest_event_at is null then 'critical'
    when s.minutes_since_latest_event >= 180 and s.baseline_events_per_hour_7d >= 2 then 'critical'
    when s.processing_failure_rate_24h >= 0.10 then 'critical'
    when s.events_1h=0 and s.baseline_events_per_hour_7d >= 4 then 'critical'
    when s.pace_ratio is not null and s.pace_ratio < 0.25 and s.baseline_events_per_hour_7d >= 4 then 'high'
    when s.processing_failure_rate_24h >= 0.03 then 'high'
    when s.pace_ratio is not null and s.pace_ratio < 0.50 and s.baseline_events_per_hour_7d >= 4 then 'degraded'
    else 'healthy'
  end as health_status,
  now() as checked_at
from scored s;

create or replace function public.snapshot_event_intelligence_visitor_v1(
  p_organization_id uuid,
  p_anonymous_visitor_id text,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_row record;
  v_payload jsonb;
  v_hash text;
  v_latest public.event_intelligence_feature_snapshots%rowtype;
  v_id uuid;
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;
  if nullif(btrim(coalesce(p_anonymous_visitor_id,'')),'') is null then
    raise exception 'anonymous_visitor_id is required';
  end if;

  select * into v_row
  from public.v_event_intelligence_visitor_features_v1 v
  where v.organization_id=p_organization_id
    and v.anonymous_visitor_id=btrim(p_anonymous_visitor_id)
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'created',false,'reason','visitor_features_not_found');
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'lead_id',v_row.lead_id,
    'first_seen_at',v_row.first_seen_at,
    'last_seen_at',v_row.last_seen_at,
    'days_since_last_activity',round(v_row.days_since_last_activity::numeric,4),
    'sessions_1d',v_row.sessions_1d,
    'sessions_7d',v_row.sessions_7d,
    'sessions_30d',v_row.sessions_30d,
    'events_1d',v_row.events_1d,
    'events_7d',v_row.events_7d,
    'events_30d',v_row.events_30d,
    'page_views_7d',v_row.page_views_7d,
    'page_views_30d',v_row.page_views_30d,
    'cta_events_30d',v_row.cta_events_30d,
    'form_starts_30d',v_row.form_starts_30d,
    'form_submits_30d',v_row.form_submits_30d,
    'whatsapp_clicks_30d',v_row.whatsapp_clicks_30d,
    'source_diversity_30d',v_row.source_diversity_30d,
    'paid_sessions_30d',v_row.paid_sessions_30d,
    'organic_sessions_30d',v_row.organic_sessions_30d,
    'is_returning_30d',v_row.is_returning_30d,
    'is_identified',v_row.is_identified
  ));

  v_hash := encode(extensions.digest(v_payload::text,'sha256'),'hex');

  select * into v_latest
  from public.event_intelligence_feature_snapshots f
  where f.organization_id=p_organization_id
    and f.subject_type='visitor'
    and f.subject_key=btrim(p_anonymous_visitor_id)
    and f.feature_set='visitor_behavior'
  order by f.observed_at desc
  limit 1;

  if not coalesce(p_force,false)
     and v_latest.id is not null
     and v_latest.feature_hash=v_hash
     and v_latest.observed_at >= now()-interval '6 hours' then
    return jsonb_build_object(
      'ok',true,'created',false,'snapshot_id',v_latest.id,
      'reason','unchanged_recent_snapshot','feature_hash',v_hash
    );
  end if;

  insert into public.event_intelligence_feature_snapshots(
    organization_id,subject_type,subject_key,feature_set,feature_version,
    feature_payload,feature_hash,reason_codes,source_watermark,observed_at
  ) values (
    p_organization_id,'visitor',btrim(p_anonymous_visitor_id),'visitor_behavior','v1',
    v_payload,v_hash,
    array_remove(array[
      case when v_row.sessions_30d>1 then 'returning_visitor' end,
      case when v_row.cta_events_30d>0 then 'cta_engagement' end,
      case when v_row.form_submits_30d>0 then 'form_submission_observed' end,
      case when v_row.whatsapp_clicks_30d>0 then 'whatsapp_interest' end,
      case when v_row.is_identified then 'known_lead_link' end
    ],null),
    jsonb_build_object(
      'last_seen_at',v_row.last_seen_at,
      'identity_linked_at',v_row.identity_linked_at
    ),
    now()
  ) returning id into v_id;

  return jsonb_build_object('ok',true,'created',true,'snapshot_id',v_id,'feature_hash',v_hash);
end;
$$;

create or replace function public.snapshot_recent_event_intelligence_visitors_v1(
  p_organization_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_visitor record;
  v_result jsonb;
  v_created integer := 0;
  v_reused integer := 0;
  v_failed integer := 0;
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;

  for v_visitor in
    select anonymous_visitor_id
    from public.v_event_intelligence_visitor_features_v1
    where organization_id=p_organization_id
      and last_seen_at >= now()-interval '30 days'
    order by last_seen_at desc
    limit greatest(1,least(coalesce(p_limit,500),5000))
  loop
    begin
      v_result := public.snapshot_event_intelligence_visitor_v1(
        p_organization_id,v_visitor.anonymous_visitor_id,false
      );
      if coalesce((v_result->>'created')::boolean,false) then
        v_created := v_created+1;
      else
        v_reused := v_reused+1;
      end if;
    exception when others then
      v_failed := v_failed+1;
    end;
  end loop;

  return jsonb_build_object(
    'ok',v_failed=0,
    'created',v_created,
    'reused',v_reused,
    'failed',v_failed
  );
end;
$$;

alter table public.event_intelligence_feature_snapshots enable row level security;
alter table public.event_intelligence_predictions enable row level security;

revoke all on public.event_intelligence_feature_snapshots from anon,authenticated;
revoke all on public.event_intelligence_predictions from anon,authenticated;
grant select on public.event_intelligence_feature_snapshots to authenticated;
grant select on public.event_intelligence_predictions to authenticated;
grant select,insert,update,delete on public.event_intelligence_feature_snapshots to service_role;
grant select,insert,update,delete on public.event_intelligence_predictions to service_role;

drop policy if exists event_intelligence_features_member_select on public.event_intelligence_feature_snapshots;
create policy event_intelligence_features_member_select
on public.event_intelligence_feature_snapshots
for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists event_intelligence_predictions_member_select on public.event_intelligence_predictions;
create policy event_intelligence_predictions_member_select
on public.event_intelligence_predictions
for select to authenticated
using (public.is_organization_member(organization_id));

revoke all on function public.snapshot_event_intelligence_visitor_v1(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.snapshot_recent_event_intelligence_visitors_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.snapshot_event_intelligence_visitor_v1(uuid,text,boolean) to service_role;
grant execute on function public.snapshot_recent_event_intelligence_visitors_v1(uuid,integer) to service_role;

grant select on public.v_event_intelligence_visitor_features_v1 to authenticated,service_role;
grant select on public.v_event_intelligence_tracking_anomaly_v1 to authenticated,service_role;

commit;
