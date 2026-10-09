begin;

-- =============================================================================
-- MIGRATION 039
-- ANALYTICS + SEO TENANT HARDENING
--
-- Canonicalizes the production Analytics / SEO reporting objects in migration
-- history and restores active-workspace isolation across GA4, GSC, CRM,
-- reconciliation, health, and sync-run read models.
--
-- Security model:
--   1. Every reporting view preserves organization_id.
--   2. 30-day bounds are calculated independently per organization.
--   3. Cross-source joins include organization_id.
--   4. Views remain SECURITY INVOKER so underlying RLS still applies.
--   5. Reporting views are read-only to authenticated/service_role.
--   6. Workspace RPCs require an explicit organization_id and active membership.
--   7. Old no-argument workspace RPC signatures are removed.
--   8. anon / PUBLIC cannot execute the workspace RPCs.
-- =============================================================================


-- =============================================================================
-- GA4 30-DAY REPORTING
-- =============================================================================

create or replace view public.v_ga4_source_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(g.source, '(not set)'::text) as source,
  coalesce(g.medium, '(not set)'::text) as medium,
  sum(g.sessions) as sessions,
  sum(g.new_users) as new_users,
  sum(g.total_users) as user_days,
  sum(g.engaged_sessions) as engaged_sessions,
  sum(g.key_events) as key_events,
  g.organization_id
from public.ga4_source_medium_daily g
join bounds b
  on b.organization_id = g.organization_id
where g.analytics_date >= b.start_date
  and g.analytics_date <= b.end_date
group by
  g.source,
  g.medium,
  g.organization_id;


create or replace view public.v_ga4_landing_page_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(g.landing_page, '(not set)'::text) as landing_page,
  sum(g.sessions) as sessions,
  sum(g.total_users) as user_days,
  sum(g.engaged_sessions) as engaged_sessions,
  sum(g.key_events) as key_events,
  g.organization_id
from public.ga4_landing_page_daily g
join bounds b
  on b.organization_id = g.organization_id
where g.analytics_date >= b.start_date
  and g.analytics_date <= b.end_date
group by
  g.landing_page,
  g.organization_id;


create or replace view public.v_ga4_campaign_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(g.campaign, '(not set)'::text) as campaign,
  coalesce(g.source, '(not set)'::text) as source,
  coalesce(g.medium, '(not set)'::text) as medium,
  sum(g.sessions) as sessions,
  sum(g.engaged_sessions) as engaged_sessions,
  sum(g.key_events) as key_events,
  g.organization_id
from public.ga4_campaign_daily g
join bounds b
  on b.organization_id = g.organization_id
where g.analytics_date >= b.start_date
  and g.analytics_date <= b.end_date
group by
  g.campaign,
  g.source,
  g.medium,
  g.organization_id;


create or replace view public.v_ga4_country_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(g.country, '(not set)'::text) as country,
  sum(g.sessions) as sessions,
  sum(g.total_users) as user_days,
  sum(g.engaged_sessions) as engaged_sessions,
  sum(g.key_events) as key_events,
  g.organization_id
from public.ga4_country_daily g
join bounds b
  on b.organization_id = g.organization_id
where g.analytics_date >= b.start_date
  and g.analytics_date <= b.end_date
group by
  g.country,
  g.organization_id;


create or replace view public.v_ga4_sync_health
with (security_invoker = true)
as
with organizations as (
  select organization_id from public.ga4_daily
  union
  select organization_id from public.ga4_source_medium_daily
  union
  select organization_id from public.ga4_landing_page_daily
  union
  select organization_id from public.ga4_campaign_daily
  union
  select organization_id from public.ga4_country_daily
  union
  select organization_id from public.ga4_sync_runs
)
select
  (
    select max(d.analytics_date)
    from public.ga4_daily d
    where d.organization_id = o.organization_id
  ) as latest_analytics_date,
  (
    select max(d.updated_at)
    from public.ga4_daily d
    where d.organization_id = o.organization_id
  ) as latest_data_update,
  (
    select max(r.completed_at)
    from public.ga4_sync_runs r
    where r.organization_id = o.organization_id
      and r.status = 'completed'::text
  ) as last_successful_sync,
  (
    select count(*)
    from public.ga4_daily d
    where d.organization_id = o.organization_id
  ) as daily_rows,
  (
    select count(*)
    from public.ga4_source_medium_daily d
    where d.organization_id = o.organization_id
  ) as source_rows,
  (
    select count(*)
    from public.ga4_landing_page_daily d
    where d.organization_id = o.organization_id
  ) as landing_page_rows,
  (
    select count(*)
    from public.ga4_campaign_daily d
    where d.organization_id = o.organization_id
  ) as campaign_rows,
  (
    select count(*)
    from public.ga4_country_daily d
    where d.organization_id = o.organization_id
  ) as country_rows,
  o.organization_id
from organizations o;


-- =============================================================================
-- CRM 30-DAY REPORTING USED BY ANALYTICS
-- =============================================================================

create or replace view public.v_crm_source_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(nullif(l.first_touch_source, ''::text), 'Unknown'::text) as source,
  coalesce(nullif(l.first_touch_medium, ''::text), 'Unknown'::text) as medium,
  count(*) as lead_count,
  count(*) filter (
    where l.current_stage = any (
      array[
        'qualified'::public.lead_stage,
        'high_intent'::public.lead_stage,
        'payment_pending'::public.lead_stage,
        'enrolled'::public.lead_stage
      ]
    )
  ) as qualified_count,
  count(*) filter (
    where l.current_stage = 'enrolled'::public.lead_stage
  ) as enrolled_count,
  l.organization_id
from public.leads l
join bounds b
  on b.organization_id = l.organization_id
where (l.created_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
  and (l.created_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
  and (
    l.lead_origin = 'website'::text
    or l.lead_creation_channel = 'website'::public.contact_channel
  )
group by
  coalesce(nullif(l.first_touch_source, ''::text), 'Unknown'::text),
  coalesce(nullif(l.first_touch_medium, ''::text), 'Unknown'::text),
  l.organization_id;


create or replace view public.v_crm_source_revenue_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(nullif(l.first_touch_source, ''::text), 'Unknown'::text) as source,
  coalesce(nullif(l.first_touch_medium, ''::text), 'Unknown'::text) as medium,
  upper(p.currency) as currency,
  sum(
    case
      when p.payment_kind <> 'refund'::public.payment_kind
           and p.status = 'paid'::public.payment_status
        then p.amount
      when p.payment_kind = 'refund'::public.payment_kind
           and p.status = any (
             array[
               'refunded'::public.payment_status,
               'paid'::public.payment_status
             ]
           )
        then -p.amount
      else 0::numeric
    end
  )::numeric(14,2) as net_revenue,
  l.organization_id
from public.payments p
join public.leads l
  on l.id = p.lead_id
 and l.organization_id = p.organization_id
join bounds b
  on b.organization_id = l.organization_id
where (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Kolkata'::text)::date >= b.start_date
  and (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Kolkata'::text)::date <= b.end_date
  and (
    l.lead_origin = 'website'::text
    or l.lead_creation_channel = 'website'::public.contact_channel
  )
group by
  coalesce(nullif(l.first_touch_source, ''::text), 'Unknown'::text),
  coalesce(nullif(l.first_touch_medium, ''::text), 'Unknown'::text),
  upper(p.currency),
  l.organization_id;


create or replace view public.v_crm_landing_page_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(nullif(l.landing_page, ''::text), 'Unknown'::text) as landing_page,
  count(*) as lead_count,
  count(*) filter (
    where l.current_stage = any (
      array[
        'qualified'::public.lead_stage,
        'high_intent'::public.lead_stage,
        'payment_pending'::public.lead_stage,
        'enrolled'::public.lead_stage
      ]
    )
  ) as qualified_count,
  count(*) filter (
    where l.current_stage = 'enrolled'::public.lead_stage
  ) as enrolled_count,
  l.organization_id
from public.leads l
join bounds b
  on b.organization_id = l.organization_id
where (l.created_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
  and (l.created_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
  and (
    l.lead_origin = 'website'::text
    or l.lead_creation_channel = 'website'::public.contact_channel
  )
group by
  coalesce(nullif(l.landing_page, ''::text), 'Unknown'::text),
  l.organization_id;


create or replace view public.v_crm_campaign_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(nullif(l.first_touch_campaign, ''::text), 'Unattributed'::text) as campaign,
  count(*) as lead_count,
  count(*) filter (
    where l.current_stage = any (
      array[
        'qualified'::public.lead_stage,
        'high_intent'::public.lead_stage,
        'payment_pending'::public.lead_stage,
        'enrolled'::public.lead_stage
      ]
    )
  ) as qualified_count,
  count(*) filter (
    where l.current_stage = 'enrolled'::public.lead_stage
  ) as enrolled_count,
  l.organization_id
from public.leads l
join bounds b
  on b.organization_id = l.organization_id
where (l.created_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
  and (l.created_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
  and (
    l.lead_origin = 'website'::text
    or l.lead_creation_channel = 'website'::public.contact_channel
  )
group by
  coalesce(nullif(l.first_touch_campaign, ''::text), 'Unattributed'::text),
  l.organization_id;


create or replace view public.v_crm_country_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
)
select
  coalesce(nullif(l.geo_country, ''::text), 'Unknown'::text) as country,
  count(*) as lead_count,
  count(*) filter (
    where l.current_stage = any (
      array[
        'qualified'::public.lead_stage,
        'high_intent'::public.lead_stage,
        'payment_pending'::public.lead_stage,
        'enrolled'::public.lead_stage
      ]
    )
  ) as qualified_count,
  count(*) filter (
    where l.current_stage = 'enrolled'::public.lead_stage
  ) as enrolled_count,
  l.organization_id
from public.leads l
join bounds b
  on b.organization_id = l.organization_id
where (l.created_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
  and (l.created_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
  and (
    l.lead_origin = 'website'::text
    or l.lead_creation_channel = 'website'::public.contact_channel
  )
group by
  coalesce(nullif(l.geo_country, ''::text), 'Unknown'::text),
  l.organization_id;


-- =============================================================================
-- ANALYTICS OVERVIEW + RECONCILIATION
-- =============================================================================

create or replace view public.v_analytics_30d_overview
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
),
ga4 as (
  select
    b.organization_id,
    coalesce(sum(g.sessions), 0::numeric) as sessions,
    coalesce(sum(g.page_views), 0::numeric) as page_views,
    coalesce(sum(g.new_users), 0::numeric) as new_users,
    coalesce(avg(g.total_users), 0::numeric) as avg_daily_users,
    coalesce(sum(g.engaged_sessions), 0::numeric) as engaged_sessions,
    case
      when sum(g.sessions) > 0::numeric
        then sum(g.engaged_sessions) / sum(g.sessions)
      else 0::numeric
    end as engagement_rate,
    case
      when sum(g.sessions) > 0::numeric
        then sum(g.average_session_duration * g.sessions::numeric) / sum(g.sessions)
      else 0::numeric
    end as avg_session_duration,
    coalesce(sum(g.key_events), 0::numeric) as key_events
  from bounds b
  left join public.ga4_daily g
    on g.organization_id = b.organization_id
   and g.analytics_date >= b.start_date
   and g.analytics_date <= b.end_date
  group by b.organization_id
),
crm_sessions as (
  select
    b.organization_id,
    count(ws.id) as sessions,
    count(distinct ws.anonymous_visitor_id) as visitors
  from bounds b
  left join public.web_sessions ws
    on ws.organization_id = b.organization_id
   and (ws.started_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
   and (ws.started_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
  group by b.organization_id
),
crm_events as (
  select
    b.organization_id,
    count(t.id) filter (
      where t.event_type = 'page_view'::text
    ) as page_views,
    count(t.id) filter (
      where t.event_type = 'lead_form_submit'::text
    ) as form_submits
  from bounds b
  left join public.touchpoints t
    on t.organization_id = b.organization_id
   and (t.occurred_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
   and (t.occurred_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
  group by b.organization_id
),
crm_leads as (
  select
    b.organization_id,
    count(l.id) as web_leads,
    count(l.id) filter (
      where l.current_stage = any (
        array[
          'qualified'::public.lead_stage,
          'high_intent'::public.lead_stage,
          'payment_pending'::public.lead_stage,
          'enrolled'::public.lead_stage
        ]
      )
    ) as qualified_leads,
    count(l.id) filter (
      where l.current_stage = 'enrolled'::public.lead_stage
    ) as enrolled_leads
  from bounds b
  left join public.leads l
    on l.organization_id = b.organization_id
   and (l.created_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
   and (l.created_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
   and (
     l.lead_origin = 'website'::text
     or l.lead_creation_channel = 'website'::public.contact_channel
   )
  group by b.organization_id
)
select
  b.start_date as range_start,
  b.end_date as range_end,
  g.sessions as ga4_sessions,
  g.page_views as ga4_page_views,
  g.new_users as ga4_new_users,
  round(g.avg_daily_users, 2) as ga4_avg_daily_users,
  g.engaged_sessions as ga4_engaged_sessions,
  round(g.engagement_rate, 6) as ga4_engagement_rate,
  round(g.avg_session_duration, 2) as ga4_avg_session_duration,
  g.key_events as ga4_key_events,
  cs.sessions as crm_sessions,
  cs.visitors as crm_visitors,
  ce.page_views as crm_page_views,
  ce.form_submits as crm_form_submits,
  cl.web_leads as crm_web_leads,
  cl.qualified_leads as crm_qualified_leads,
  cl.enrolled_leads as crm_enrolled_leads,
  case
    when cs.sessions > 0
      then round(cl.web_leads::numeric / cs.sessions::numeric * 100::numeric, 2)
    else 0::numeric
  end as website_lead_conversion_rate,
  b.organization_id
from bounds b
join ga4 g
  on g.organization_id = b.organization_id
join crm_sessions cs
  on cs.organization_id = b.organization_id
join crm_events ce
  on ce.organization_id = b.organization_id
join crm_leads cl
  on cl.organization_id = b.organization_id;


create or replace view public.v_analytics_reconciliation_daily_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(analytics_date) as end_date,
    max(analytics_date) - 29 as start_date
  from public.ga4_daily
  group by organization_id
),
crm_sessions as (
  select
    ws.organization_id,
    (ws.started_at at time zone 'Asia/Kolkata'::text)::date as analytics_date,
    count(*) as sessions,
    count(distinct ws.anonymous_visitor_id) as visitors
  from public.web_sessions ws
  group by
    ws.organization_id,
    (ws.started_at at time zone 'Asia/Kolkata'::text)::date
),
crm_events as (
  select
    t.organization_id,
    (t.occurred_at at time zone 'Asia/Kolkata'::text)::date as analytics_date,
    count(*) filter (
      where t.event_type = 'page_view'::text
    ) as page_views,
    count(*) filter (
      where t.event_type = 'lead_form_submit'::text
    ) as form_submits
  from public.touchpoints t
  group by
    t.organization_id,
    (t.occurred_at at time zone 'Asia/Kolkata'::text)::date
),
crm_leads as (
  select
    l.organization_id,
    (l.created_at at time zone 'Asia/Kolkata'::text)::date as analytics_date,
    count(*) as web_leads
  from public.leads l
  where l.lead_origin = 'website'::text
     or l.lead_creation_channel = 'website'::public.contact_channel
  group by
    l.organization_id,
    (l.created_at at time zone 'Asia/Kolkata'::text)::date
)
select
  g.analytics_date,
  g.sessions as ga4_sessions,
  coalesce(cs.sessions, 0::bigint) as crm_sessions,
  g.page_views as ga4_page_views,
  coalesce(ce.page_views, 0::bigint) as crm_page_views,
  coalesce(cs.visitors, 0::bigint) as crm_visitors,
  coalesce(ce.form_submits, 0::bigint) as crm_form_submits,
  coalesce(cl.web_leads, 0::bigint) as crm_web_leads,
  g.organization_id
from public.ga4_daily g
join bounds b
  on b.organization_id = g.organization_id
left join crm_sessions cs
  on cs.organization_id = g.organization_id
 and cs.analytics_date = g.analytics_date
left join crm_events ce
  on ce.organization_id = g.organization_id
 and ce.analytics_date = g.analytics_date
left join crm_leads cl
  on cl.organization_id = g.organization_id
 and cl.analytics_date = g.analytics_date
where g.analytics_date >= b.start_date
  and g.analytics_date <= b.end_date;


-- =============================================================================
-- GSC OVERVIEW
-- =============================================================================

create or replace view public.v_gsc_overview
with (security_invoker = true)
as
select
  d.site_url,
  min(d.date) as first_date,
  max(d.date) as last_date,
  sum(d.clicks) as total_clicks,
  sum(d.impressions) as total_impressions,
  case
    when sum(d.impressions) > 0
      then round(sum(d.clicks)::numeric / sum(d.impressions)::numeric, 8)
    else 0::numeric
  end as avg_ctr,
  case
    when count(*) > 0
      then round(avg(d.avg_position), 4)
    else 0::numeric
  end as avg_position,
  d.organization_id
from public.gsc_daily d
group by
  d.site_url,
  d.organization_id;


-- =============================================================================
-- GSC / SEO 30-DAY REPORTING
-- =============================================================================

create or replace view public.v_seo_daily_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(date) as end_date,
    max(date) - 29 as start_date
  from public.gsc_daily
  group by organization_id
)
select
  d.date,
  d.clicks,
  d.impressions,
  d.ctr,
  d.avg_position,
  d.organization_id
from public.gsc_daily d
join bounds b
  on b.organization_id = d.organization_id
where d.date >= b.start_date
  and d.date <= b.end_date
order by
  d.organization_id,
  d.date;


create or replace view public.v_seo_query_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(date) as end_date,
    max(date) - 29 as start_date
  from public.gsc_daily
  group by organization_id
)
select
  q.query,
  sum(q.clicks) as clicks,
  sum(q.impressions) as impressions,
  case
    when sum(q.impressions) > 0
      then round(sum(q.clicks)::numeric / sum(q.impressions)::numeric, 8)
    else 0::numeric
  end as ctr,
  case
    when sum(q.impressions) > 0
      then round(
        sum(q.avg_position * q.impressions::numeric)
        / sum(q.impressions)::numeric,
        2
      )
    else 0::numeric
  end as avg_position,
  q.organization_id
from public.gsc_query_daily q
join bounds b
  on b.organization_id = q.organization_id
where q.date >= b.start_date
  and q.date <= b.end_date
group by
  q.query,
  q.organization_id;


create or replace view public.v_seo_page_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(date) as end_date,
    max(date) - 29 as start_date
  from public.gsc_daily
  group by organization_id
)
select
  p.page,
  sum(p.clicks) as clicks,
  sum(p.impressions) as impressions,
  case
    when sum(p.impressions) > 0
      then round(sum(p.clicks)::numeric / sum(p.impressions)::numeric, 8)
    else 0::numeric
  end as ctr,
  case
    when sum(p.impressions) > 0
      then round(
        sum(p.avg_position * p.impressions::numeric)
        / sum(p.impressions)::numeric,
        2
      )
    else 0::numeric
  end as avg_position,
  p.organization_id
from public.gsc_page_daily p
join bounds b
  on b.organization_id = p.organization_id
where p.date >= b.start_date
  and p.date <= b.end_date
group by
  p.page,
  p.organization_id;


create or replace view public.v_seo_country_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(date) as end_date,
    max(date) - 29 as start_date
  from public.gsc_daily
  group by organization_id
)
select
  c.country,
  sum(c.clicks) as clicks,
  sum(c.impressions) as impressions,
  case
    when sum(c.impressions) > 0
      then round(sum(c.clicks)::numeric / sum(c.impressions)::numeric, 8)
    else 0::numeric
  end as ctr,
  case
    when sum(c.impressions) > 0
      then round(
        sum(c.avg_position * c.impressions::numeric)
        / sum(c.impressions)::numeric,
        2
      )
    else 0::numeric
  end as avg_position,
  c.organization_id
from public.gsc_country_daily c
join bounds b
  on b.organization_id = c.organization_id
where c.date >= b.start_date
  and c.date <= b.end_date
group by
  c.country,
  c.organization_id;


create or replace view public.v_seo_device_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(date) as end_date,
    max(date) - 29 as start_date
  from public.gsc_daily
  group by organization_id
)
select
  d.device,
  sum(d.clicks) as clicks,
  sum(d.impressions) as impressions,
  case
    when sum(d.impressions) > 0
      then round(sum(d.clicks)::numeric / sum(d.impressions)::numeric, 8)
    else 0::numeric
  end as ctr,
  case
    when sum(d.impressions) > 0
      then round(
        sum(d.avg_position * d.impressions::numeric)
        / sum(d.impressions)::numeric,
        2
      )
    else 0::numeric
  end as avg_position,
  d.organization_id
from public.gsc_device_daily d
join bounds b
  on b.organization_id = d.organization_id
where d.date >= b.start_date
  and d.date <= b.end_date
group by
  d.device,
  d.organization_id;


create or replace view public.v_seo_search_appearance_30d
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(date) as end_date,
    max(date) - 29 as start_date
  from public.gsc_daily
  group by organization_id
)
select
  a.search_appearance,
  sum(a.clicks) as clicks,
  sum(a.impressions) as impressions,
  case
    when sum(a.impressions) > 0
      then round(sum(a.clicks)::numeric / sum(a.impressions)::numeric, 8)
    else 0::numeric
  end as ctr,
  case
    when sum(a.impressions) > 0
      then round(
        sum(a.avg_position * a.impressions::numeric)
        / sum(a.impressions)::numeric,
        2
      )
    else 0::numeric
  end as avg_position,
  a.organization_id
from public.gsc_search_appearance_daily a
join bounds b
  on b.organization_id = a.organization_id
where a.date >= b.start_date
  and a.date <= b.end_date
group by
  a.search_appearance,
  a.organization_id;


create or replace view public.v_seo_opportunities_30d
with (security_invoker = true)
as
with query_data as (
  select
    q.query,
    q.clicks,
    q.impressions,
    q.ctr,
    q.avg_position,
    q.organization_id
  from public.v_seo_query_30d q
),
classified as (
  select
    q.query,
    q.clicks,
    q.impressions,
    q.ctr,
    q.avg_position,
    case
      when q.impressions >= 100
           and q.avg_position >= 1::numeric
           and q.avg_position <= 10::numeric
           and q.ctr < 0.03
        then 'low_ctr_page_1'::text
      when q.impressions >= 50
           and q.avg_position > 10::numeric
           and q.avg_position <= 20::numeric
        then 'striking_distance'::text
      when q.impressions >= 250
           and q.avg_position > 20::numeric
        then 'high_impressions_low_rank'::text
      else null::text
    end as opportunity_type,
    case
      when q.impressions >= 100
           and q.avg_position >= 1::numeric
           and q.avg_position <= 10::numeric
           and q.ctr < 0.03
        then 'Ranking on page 1 but CTR is low. Review title and meta description.'::text
      when q.impressions >= 50
           and q.avg_position > 10::numeric
           and q.avg_position <= 20::numeric
        then 'Close to page 1. Improve content depth, internal links and relevance.'::text
      when q.impressions >= 250
           and q.avg_position > 20::numeric
        then 'Strong search demand but weak ranking. Consider a focused page or major content upgrade.'::text
      else null::text
    end as recommendation,
    q.organization_id
  from query_data q
)
select
  query,
  clicks,
  impressions,
  ctr,
  avg_position,
  opportunity_type,
  recommendation,
  organization_id
from classified
where opportunity_type is not null;


create or replace view public.v_gsc_sync_health
with (security_invoker = true)
as
with organizations as (
  select organization_id from public.gsc_daily
  union
  select organization_id from public.gsc_query_daily
  union
  select organization_id from public.gsc_page_daily
  union
  select organization_id from public.gsc_country_daily
  union
  select organization_id from public.gsc_device_daily
  union
  select organization_id from public.gsc_search_appearance_daily
  union
  select organization_id from public.gsc_sync_runs
)
select
  (
    select max(d.date)
    from public.gsc_daily d
    where d.organization_id = o.organization_id
  ) as latest_gsc_date,
  (
    select max(d.updated_at)
    from public.gsc_daily d
    where d.organization_id = o.organization_id
  ) as latest_data_update,
  (
    select max(r.completed_at)
    from public.gsc_sync_runs r
    where r.organization_id = o.organization_id
      and r.status = 'success'::text
  ) as last_successful_sync,
  (
    select count(*)
    from public.gsc_daily d
    where d.organization_id = o.organization_id
  ) as daily_rows,
  (
    select count(*)
    from public.gsc_query_daily d
    where d.organization_id = o.organization_id
  ) as query_rows,
  (
    select count(*)
    from public.gsc_page_daily d
    where d.organization_id = o.organization_id
  ) as page_rows,
  (
    select count(*)
    from public.gsc_country_daily d
    where d.organization_id = o.organization_id
  ) as country_rows,
  (
    select count(*)
    from public.gsc_device_daily d
    where d.organization_id = o.organization_id
  ) as device_rows,
  (
    select count(*)
    from public.gsc_search_appearance_daily d
    where d.organization_id = o.organization_id
  ) as search_appearance_rows,
  o.organization_id
from organizations o;


create or replace view public.v_seo_30d_overview
with (security_invoker = true)
as
with bounds as (
  select
    organization_id,
    max(date) as end_date,
    max(date) - 29 as start_date
  from public.gsc_daily
  group by organization_id
),
gsc as (
  select
    b.organization_id,
    coalesce(sum(d.clicks), 0::bigint) as clicks,
    coalesce(sum(d.impressions), 0::bigint) as impressions,
    case
      when sum(d.impressions) > 0
        then sum(d.clicks)::numeric / sum(d.impressions)::numeric
      else 0::numeric
    end as ctr,
    case
      when sum(d.impressions) > 0
        then sum(d.avg_position * d.impressions::numeric) / sum(d.impressions)::numeric
      else 0::numeric
    end as avg_position
  from bounds b
  left join public.gsc_daily d
    on d.organization_id = b.organization_id
   and d.date >= b.start_date
   and d.date <= b.end_date
  group by b.organization_id
),
organic_leads as (
  select
    b.organization_id,
    count(l.id) as leads,
    count(l.id) filter (
      where l.current_stage = any (
        array[
          'qualified'::public.lead_stage,
          'high_intent'::public.lead_stage,
          'payment_pending'::public.lead_stage,
          'enrolled'::public.lead_stage
        ]
      )
    ) as qualified_leads,
    count(l.id) filter (
      where l.current_stage = 'enrolled'::public.lead_stage
    ) as enrolled_leads
  from bounds b
  left join public.leads l
    on l.organization_id = b.organization_id
   and (l.created_at at time zone 'Asia/Kolkata'::text)::date >= b.start_date
   and (l.created_at at time zone 'Asia/Kolkata'::text)::date <= b.end_date
   and lower(coalesce(l.first_touch_source, ''::text)) = any (
     array['google'::text, 'google.com'::text]
   )
   and lower(coalesce(l.first_touch_medium, ''::text)) = any (
     array[
       'organic'::text,
       'organic_search'::text,
       'organic search'::text
     ]
   )
  group by b.organization_id
),
organic_revenue as (
  select
    b.organization_id,
    upper(p.currency) as currency,
    sum(
      case
        when p.payment_kind <> 'refund'::public.payment_kind
             and p.status = 'paid'::public.payment_status
          then p.amount
        when p.payment_kind = 'refund'::public.payment_kind
             and p.status = any (
               array[
                 'refunded'::public.payment_status,
                 'paid'::public.payment_status
               ]
             )
          then -p.amount
        else 0::numeric
      end
    )::numeric(14,2) as net_revenue
  from public.payments p
  join public.leads l
    on l.id = p.lead_id
   and l.organization_id = p.organization_id
  join bounds b
    on b.organization_id = l.organization_id
  where (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Kolkata'::text)::date >= b.start_date
    and (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Kolkata'::text)::date <= b.end_date
    and lower(coalesce(l.first_touch_source, ''::text)) = any (
      array['google'::text, 'google.com'::text]
    )
    and lower(coalesce(l.first_touch_medium, ''::text)) = any (
      array[
        'organic'::text,
        'organic_search'::text,
        'organic search'::text
      ]
    )
  group by
    b.organization_id,
    upper(p.currency)
)
select
  b.start_date as range_start,
  b.end_date as range_end,
  g.clicks,
  g.impressions,
  round(g.ctr, 8) as ctr,
  round(g.avg_position, 2) as avg_position,
  ol.leads as organic_leads,
  ol.qualified_leads as organic_qualified_leads,
  ol.enrolled_leads as organic_enrolled_leads,
  coalesce(
    max(orv.net_revenue) filter (
      where orv.currency = 'INR'::text
    ),
    0::numeric
  )::numeric(14,2) as organic_revenue_inr,
  coalesce(
    max(orv.net_revenue) filter (
      where orv.currency = 'USD'::text
    ),
    0::numeric
  )::numeric(14,2) as organic_revenue_usd,
  case
    when g.clicks > 0
      then round(ol.leads::numeric / g.clicks::numeric * 100::numeric, 2)
    else 0::numeric
  end as click_to_lead_rate,
  b.organization_id
from bounds b
join gsc g
  on g.organization_id = b.organization_id
join organic_leads ol
  on ol.organization_id = b.organization_id
left join organic_revenue orv
  on orv.organization_id = b.organization_id
group by
  b.start_date,
  b.end_date,
  g.clicks,
  g.impressions,
  g.ctr,
  g.avg_position,
  ol.leads,
  ol.qualified_leads,
  ol.enrolled_leads,
  b.organization_id;


-- =============================================================================
-- REPORTING VIEW LEAST PRIVILEGE
-- =============================================================================

revoke all privileges on table
  public.v_analytics_30d_overview,
  public.v_analytics_reconciliation_daily_30d,
  public.v_ga4_source_30d,
  public.v_ga4_landing_page_30d,
  public.v_ga4_campaign_30d,
  public.v_ga4_country_30d,
  public.v_ga4_sync_health,
  public.v_crm_source_30d,
  public.v_crm_source_revenue_30d,
  public.v_crm_landing_page_30d,
  public.v_crm_campaign_30d,
  public.v_crm_country_30d,
  public.v_seo_30d_overview,
  public.v_seo_daily_30d,
  public.v_seo_query_30d,
  public.v_seo_page_30d,
  public.v_seo_country_30d,
  public.v_seo_device_30d,
  public.v_seo_search_appearance_30d,
  public.v_seo_opportunities_30d,
  public.v_gsc_sync_health,
  public.v_gsc_overview
from public, anon, authenticated, service_role;


grant select on table
  public.v_analytics_30d_overview,
  public.v_analytics_reconciliation_daily_30d,
  public.v_ga4_source_30d,
  public.v_ga4_landing_page_30d,
  public.v_ga4_campaign_30d,
  public.v_ga4_country_30d,
  public.v_ga4_sync_health,
  public.v_crm_source_30d,
  public.v_crm_source_revenue_30d,
  public.v_crm_landing_page_30d,
  public.v_crm_campaign_30d,
  public.v_crm_country_30d,
  public.v_seo_30d_overview,
  public.v_seo_daily_30d,
  public.v_seo_query_30d,
  public.v_seo_page_30d,
  public.v_seo_country_30d,
  public.v_seo_device_30d,
  public.v_seo_search_appearance_30d,
  public.v_seo_opportunities_30d,
  public.v_gsc_sync_health,
  public.v_gsc_overview
to authenticated, service_role;


-- =============================================================================
-- ANALYTICS WORKSPACE RPC
-- =============================================================================

drop function if exists public.get_analytics_workspace();


create function public.get_analytics_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $function$
begin

  if p_organization_id is null then
    raise exception
      'Organization ID is required';
  end if;

  if not public.is_organization_member(
    p_organization_id
  ) then
    raise exception
      'Not authorized for organization %',
      p_organization_id;
  end if;

  return (
    select jsonb_build_object(

      'overview',
      coalesce(
        (
          select to_jsonb(x)
          from (
            select
              range_start,
              range_end,
              ga4_sessions,
              ga4_page_views,
              ga4_new_users,
              ga4_avg_daily_users,
              ga4_engaged_sessions,
              ga4_engagement_rate,
              ga4_avg_session_duration,
              ga4_key_events,
              crm_sessions,
              crm_visitors,
              crm_page_views,
              crm_form_submits,
              crm_web_leads,
              crm_qualified_leads,
              crm_enrolled_leads,
              website_lead_conversion_rate
            from public.v_analytics_30d_overview
            where organization_id = p_organization_id
            limit 1
          ) x
        ),
        '{}'::jsonb
      ),

      'ga4_sources',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              source,
              medium,
              sessions,
              new_users,
              user_days,
              engaged_sessions,
              key_events
            from public.v_ga4_source_30d
            where organization_id = p_organization_id
            order by sessions desc
            limit 50
          ) x
        ),
        '[]'::jsonb
      ),

      'crm_sources',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              source,
              medium,
              lead_count,
              qualified_count,
              enrolled_count
            from public.v_crm_source_30d
            where organization_id = p_organization_id
            order by lead_count desc
            limit 100
          ) x
        ),
        '[]'::jsonb
      ),

      'crm_source_revenue',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              source,
              medium,
              currency,
              net_revenue
            from public.v_crm_source_revenue_30d
            where organization_id = p_organization_id
          ) x
        ),
        '[]'::jsonb
      ),

      'ga4_landing',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              landing_page,
              sessions,
              user_days,
              engaged_sessions,
              key_events
            from public.v_ga4_landing_page_30d
            where organization_id = p_organization_id
            order by sessions desc
            limit 50
          ) x
        ),
        '[]'::jsonb
      ),

      'crm_landing',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              landing_page,
              lead_count,
              qualified_count,
              enrolled_count
            from public.v_crm_landing_page_30d
            where organization_id = p_organization_id
            order by lead_count desc
            limit 250
          ) x
        ),
        '[]'::jsonb
      ),

      'ga4_campaigns',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              campaign,
              source,
              medium,
              sessions,
              engaged_sessions,
              key_events
            from public.v_ga4_campaign_30d
            where organization_id = p_organization_id
            order by sessions desc
            limit 50
          ) x
        ),
        '[]'::jsonb
      ),

      'crm_campaigns',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              campaign,
              lead_count,
              qualified_count,
              enrolled_count
            from public.v_crm_campaign_30d
            where organization_id = p_organization_id
            order by lead_count desc
            limit 100
          ) x
        ),
        '[]'::jsonb
      ),

      'ga4_countries',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              country,
              sessions,
              user_days,
              engaged_sessions,
              key_events
            from public.v_ga4_country_30d
            where organization_id = p_organization_id
            order by sessions desc
            limit 50
          ) x
        ),
        '[]'::jsonb
      ),

      'crm_countries',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              country,
              lead_count,
              qualified_count,
              enrolled_count
            from public.v_crm_country_30d
            where organization_id = p_organization_id
            order by lead_count desc
            limit 100
          ) x
        ),
        '[]'::jsonb
      ),

      'reconciliation',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(x)
            order by x.analytics_date desc
          )
          from (
            select
              analytics_date,
              ga4_sessions,
              crm_sessions,
              ga4_page_views,
              crm_page_views,
              crm_visitors,
              crm_form_submits,
              crm_web_leads
            from public.v_analytics_reconciliation_daily_30d
            where organization_id = p_organization_id
            order by analytics_date desc
          ) x
        ),
        '[]'::jsonb
      ),

      'health',
      coalesce(
        (
          select to_jsonb(x)
          from (
            select
              latest_analytics_date,
              latest_data_update,
              last_successful_sync,
              daily_rows,
              source_rows,
              landing_page_rows,
              campaign_rows,
              country_rows
            from public.v_ga4_sync_health
            where organization_id = p_organization_id
            limit 1
          ) x
        ),
        '{}'::jsonb
      ),

      'sync_runs',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(x)
            order by x.started_at desc
          )
          from (
            select
              id,
              status,
              from_date,
              to_date,
              total_rows,
              error_message,
              started_at,
              completed_at
            from public.ga4_sync_runs
            where organization_id = p_organization_id
            order by started_at desc
            limit 6
          ) x
        ),
        '[]'::jsonb
      )
    )
  );

end;
$function$;


revoke all
on function public.get_analytics_workspace(uuid)
from public, anon, authenticated, service_role;


grant execute
on function public.get_analytics_workspace(uuid)
to authenticated, service_role;


comment on function public.get_analytics_workspace(uuid) is
  'Returns Analytics workspace data for one authorized organization. SECURITY INVOKER; underlying RLS remains enforced.';


-- =============================================================================
-- SEO WORKSPACE RPC
-- =============================================================================

drop function if exists public.get_seo_workspace();


create function public.get_seo_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $function$
begin

  if p_organization_id is null then
    raise exception
      'Organization ID is required';
  end if;

  if not public.is_organization_member(
    p_organization_id
  ) then
    raise exception
      'Not authorized for organization %',
      p_organization_id;
  end if;

  return (
    select jsonb_build_object(

      'overview',
      coalesce(
        (
          select to_jsonb(x)
          from (
            select
              range_start,
              range_end,
              clicks,
              impressions,
              ctr,
              avg_position,
              organic_leads,
              organic_qualified_leads,
              organic_enrolled_leads,
              organic_revenue_inr,
              organic_revenue_usd,
              click_to_lead_rate
            from public.v_seo_30d_overview
            where organization_id = p_organization_id
            limit 1
          ) x
        ),
        '{}'::jsonb
      ),

      'daily',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              date,
              clicks,
              impressions,
              ctr,
              avg_position
            from public.v_seo_daily_30d
            where organization_id = p_organization_id
            order by date asc
          ) x
        ),
        '[]'::jsonb
      ),

      'queries',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              query,
              clicks,
              impressions,
              ctr,
              avg_position
            from public.v_seo_query_30d
            where organization_id = p_organization_id
            order by clicks desc
            limit 30
          ) x
        ),
        '[]'::jsonb
      ),

      'pages',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              page,
              clicks,
              impressions,
              ctr,
              avg_position
            from public.v_seo_page_30d
            where organization_id = p_organization_id
            order by clicks desc
            limit 25
          ) x
        ),
        '[]'::jsonb
      ),

      'countries',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              country,
              clicks,
              impressions,
              ctr,
              avg_position
            from public.v_seo_country_30d
            where organization_id = p_organization_id
            order by clicks desc
            limit 15
          ) x
        ),
        '[]'::jsonb
      ),

      'devices',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              device,
              clicks,
              impressions,
              ctr,
              avg_position
            from public.v_seo_device_30d
            where organization_id = p_organization_id
            order by clicks desc
          ) x
        ),
        '[]'::jsonb
      ),

      'appearances',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              search_appearance,
              clicks,
              impressions,
              ctr,
              avg_position
            from public.v_seo_search_appearance_30d
            where organization_id = p_organization_id
            order by clicks desc
          ) x
        ),
        '[]'::jsonb
      ),

      'opportunities',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x))
          from (
            select
              query,
              clicks,
              impressions,
              ctr,
              avg_position,
              opportunity_type,
              recommendation
            from public.v_seo_opportunities_30d
            where organization_id = p_organization_id
            order by impressions desc
            limit 40
          ) x
        ),
        '[]'::jsonb
      ),

      'health',
      coalesce(
        (
          select to_jsonb(x)
          from (
            select
              latest_gsc_date,
              latest_data_update,
              last_successful_sync,
              daily_rows,
              query_rows,
              page_rows,
              country_rows,
              device_rows,
              search_appearance_rows
            from public.v_gsc_sync_health
            where organization_id = p_organization_id
            limit 1
          ) x
        ),
        '{}'::jsonb
      ),

      'sync_runs',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(x)
            order by x.started_at desc
          )
          from (
            select
              id,
              site_url,
              start_date,
              end_date,
              status,
              triggered_by,
              total_rows,
              error_message,
              started_at,
              completed_at
            from public.gsc_sync_runs
            where organization_id = p_organization_id
            order by started_at desc
            limit 6
          ) x
        ),
        '[]'::jsonb
      )
    )
  );

end;
$function$;


revoke all
on function public.get_seo_workspace(uuid)
from public, anon, authenticated, service_role;


grant execute
on function public.get_seo_workspace(uuid)
to authenticated, service_role;


comment on function public.get_seo_workspace(uuid) is
  'Returns SEO workspace data for one authorized organization. SECURITY INVOKER; underlying RLS remains enforced.';


commit;
