-- Marketing "Website", "Google search" and "Tracking check" pages (owner-approved
-- prototype "Marketing step 3", 25 Nov 2026). Read-only, service role only.

-- Website: Google Analytics visits (30 days and the 30 before), sources,
-- countries and landing pages, with website enquiries by first-touch source
-- and enquiries whose tracked visit started on each page.
create or replace function public.marketing_web_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
lp as (
  select regexp_replace(split_part(landing_page, '?', 1), '/$', '') as path, sum(sessions) as visits, sum(engaged_sessions) as engaged
  from public.ga4_landing_page_daily
  where organization_id = p_organization_id and analytics_date >= current_date - 30
  group by 1
),
ld as (
  select regexp_replace(split_part(regexp_replace(ws.landing_page, '^https?://[^/]+', ''), '?', 1), '/$', '') as path,
         count(distinct ws.lead_id) as leads
  from public.web_sessions ws
  where ws.organization_id = p_organization_id and ws.lead_id is not null and ws.started_at >= now() - interval '30 days'
  group by 1
),
web_leads as (
  select coalesce(nullif(lower(btrim(l.first_touch_source)), ''), 'unknown') as source, count(*) as n
  from public.leads l
  where l.organization_id = p_organization_id and l.lead_creation_channel::text = 'website'
    and l.created_at >= now() - interval '30 days'
    and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
    and l.current_stage::text <> 'duplicate'
  group by 1
)
select jsonb_build_object(
  'visits', (select coalesce(sum(sessions), 0) from public.ga4_daily where organization_id = p_organization_id and analytics_date >= current_date - 30),
  'visitsBefore', (select coalesce(sum(sessions), 0) from public.ga4_daily where organization_id = p_organization_id and analytics_date between current_date - 60 and current_date - 31),
  'engaged', (select coalesce(sum(engaged_sessions), 0) from public.ga4_daily where organization_id = p_organization_id and analytics_date >= current_date - 30),
  'dataTo', (select max(analytics_date) from public.ga4_daily where organization_id = p_organization_id),
  'sources', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'medium', medium, 'visits', visits) order by visits desc) from (
      select lower(coalesce(source, '(not set)')) as source, lower(coalesce(medium, '(not set)')) as medium, sum(sessions) as visits
      from public.ga4_source_medium_daily where organization_id = p_organization_id and analytics_date >= current_date - 30
      group by 1, 2 order by 3 desc limit 40) s), '[]'::jsonb),
  'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'visits', visits) order by visits desc) from (
      select country, sum(sessions) as visits from public.ga4_country_daily
      where organization_id = p_organization_id and analytics_date >= current_date - 30
      group by 1 order by 2 desc limit 12) c), '[]'::jsonb),
  'pages', coalesce((select jsonb_agg(jsonb_build_object('path', coalesce(lp.path, ld.path), 'visits', coalesce(lp.visits, 0), 'engaged', coalesce(lp.engaged, 0), 'leads', coalesce(ld.leads, 0)) order by coalesce(lp.visits, 0) desc) from (
      select * from lp order by visits desc limit 30) lp left join ld on ld.path = lp.path), '[]'::jsonb),
  'webLeads', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'n', n)) from web_leads), '[]'::jsonb),
  'generatedAt', now()
);
$$;

revoke all on function public.marketing_web_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_web_v1(uuid) to service_role;

-- Google search: Search Console clicks and views (30 days and the 30 before),
-- searches for the business's own name, top searches, searches close to the
-- top of Google, and the most-seen pages.
create or replace function public.marketing_search_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
brand as (
  select nullif(regexp_replace(lower(coalesce(o.name, '')), '[^a-z0-9]', '', 'g'), '') as token
  from public.organizations o where o.id = p_organization_id
),
q as (
  select query, sum(clicks) as clicks, sum(impressions) as views,
         round((sum(avg_position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position,
         coalesce((select b.token from brand b) is not null
           and regexp_replace(lower(query), '[^a-z0-9]', '', 'g') like '%' || (select b.token from brand b) || '%', false) as is_brand
  from public.gsc_query_daily
  where organization_id = p_organization_id and date >= current_date - 30
  group by 1
)
select jsonb_build_object(
  'clicks', (select coalesce(sum(clicks), 0) from public.gsc_daily where organization_id = p_organization_id and date >= current_date - 30),
  'clicksBefore', (select coalesce(sum(clicks), 0) from public.gsc_daily where organization_id = p_organization_id and date between current_date - 60 and current_date - 31),
  'views', (select coalesce(sum(impressions), 0) from public.gsc_daily where organization_id = p_organization_id and date >= current_date - 30),
  'viewsBefore', (select coalesce(sum(impressions), 0) from public.gsc_daily where organization_id = p_organization_id and date between current_date - 60 and current_date - 31),
  'position', (select round((sum(avg_position * impressions) / nullif(sum(impressions), 0))::numeric, 1) from public.gsc_daily where organization_id = p_organization_id and date >= current_date - 30),
  'dataTo', (select max(date) from public.gsc_daily where organization_id = p_organization_id),
  'brandClicks', (select coalesce(sum(clicks), 0) from q where is_brand),
  'top', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'clicks', clicks, 'views', views, 'position', position, 'brand', is_brand) order by clicks desc) from (
      select * from q order by clicks desc limit 10) t), '[]'::jsonb),
  'near', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'clicks', clicks, 'views', views, 'position', position) order by views desc) from (
      select * from q where not is_brand and position between 4 and 20 and views >= 60 order by views desc limit 12) t), '[]'::jsonb),
  'pages', coalesce((select jsonb_agg(jsonb_build_object('page', page, 'clicks', clicks, 'views', views, 'position', position) order by clicks desc) from (
      select page, sum(clicks) as clicks, sum(impressions) as views,
             round((sum(avg_position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position
      from public.gsc_page_daily where organization_id = p_organization_id and date >= current_date - 30
      group by 1 order by 2 desc limit 12) p), '[]'::jsonb),
  'generatedAt', now()
);
$$;

revoke all on function public.marketing_search_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_search_v1(uuid) to service_role;

-- Tracking check: when each connection last sent data, and how much of the
-- website traffic carries campaign tags or is linked to an enquiry.
create or replace function public.marketing_tracking_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
select jsonb_build_object(
  'website', jsonb_build_object(
      'lastEventAt', (select max(last_seen_at) from public.tracking_sources where organization_id = p_organization_id and source_type = 'website' and status = 'active'),
      'events', (select coalesce(sum(accepted_event_count), 0) from public.tracking_sources where organization_id = p_organization_id and source_type = 'website'),
      'rejected', (select coalesce(sum(rejected_event_count), 0) from public.tracking_sources where organization_id = p_organization_id and source_type = 'website'),
      'visits24h', (select count(*) from public.web_sessions where organization_id = p_organization_id and started_at > now() - interval '24 hours')),
  'unusedSources', coalesce((select jsonb_agg(name) from public.tracking_sources
      where organization_id = p_organization_id and status = 'active' and source_type = 'website' and last_seen_at is null), '[]'::jsonb),
  'lastWebsiteLeadAt', (select max(created_at) from public.leads where organization_id = p_organization_id and lead_creation_channel::text = 'website'),
  'webLeads30d', (select count(*) from public.leads where organization_id = p_organization_id and lead_creation_channel::text = 'website'
      and created_at >= now() - interval '30 days' and not coalesce((metadata ->> 'test_lead')::boolean, false)),
  'lastInstagramAt', (select max(m.created_at) from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.organization_id = p_organization_id and c.channel::text = 'instagram' and m.direction = 'inbound'),
  'lastWhatsAppAt', (select max(m.created_at) from public.messages m join public.conversations c on c.id = m.conversation_id
      where m.organization_id = p_organization_id and c.channel::text = 'whatsapp' and m.direction = 'inbound'),
  'ga4', (select jsonb_build_object('status', status, 'at', coalesce(completed_at, started_at), 'dataTo', to_date)
      from public.ga4_sync_runs where organization_id = p_organization_id order by started_at desc limit 1),
  'gsc', (select jsonb_build_object('status', status, 'at', coalesce(completed_at, started_at), 'dataTo', end_date)
      from public.gsc_sync_runs where organization_id = p_organization_id order by started_at desc limit 1),
  'meta', (select jsonb_build_object('status', status, 'at', coalesce(completed_at, started_at),
      'lastSuccessAt', (select max(completed_at) from public.meta_ads_sync_runs where organization_id = p_organization_id and status = 'success'))
      from public.meta_ads_sync_runs where organization_id = p_organization_id order by started_at desc limit 1),
  'google', (select jsonb_build_object('status', status, 'at', coalesce(completed_at, started_at), 'error', left(regexp_replace(coalesce(error_message, ''), '\s+', ' ', 'g'), 400),
      'lastSuccessAt', (select max(completed_at) from public.google_ads_sync_runs where organization_id = p_organization_id and status = 'success'))
      from public.google_ads_sync_runs where organization_id = p_organization_id order by started_at desc limit 1),
  'visits30d', (select jsonb_build_object('all', count(*), 'tagged', count(*) filter (where nullif(btrim(utm_campaign), '') is not null),
      'metaClickIds', count(*) filter (where fbclid is not null), 'googleClickIds', count(*) filter (where coalesce(gclid, gbraid, wbraid) is not null),
      'withLead', count(*) filter (where lead_id is not null))
      from public.web_sessions where organization_id = p_organization_id and started_at >= now() - interval '30 days'),
  'generatedAt', now()
);
$$;

revoke all on function public.marketing_tracking_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_tracking_v1(uuid) to service_role;
