create or replace view public.v_seo_page_performance_30d as
with page_inventory as (
  select p.page_id,p.organization_id,p.site_id,p.hostname,p.normalized_url,p.url_path,p.page_type,p.lifecycle_status,p.http_status,p.title,p.meta_description,p.word_count,p.is_indexable,p.indexability_reason,p.schema_types,p.technical_flags
  from public.v_seo_page_inventory p
), gsc as (
  select organization_id, regexp_replace(page,'#.*$','','g') as normalized_page,
         sum(clicks) clicks, sum(impressions) impressions,
         case when sum(impressions)>0 then round(sum(clicks)::numeric/sum(impressions)::numeric,8) else 0::numeric end ctr,
         case when sum(impressions)>0 then round(sum(avg_position*impressions::numeric)/sum(impressions)::numeric,2) else 0::numeric end avg_position
  from public.gsc_page_daily where date >= current_date-29
  group by organization_id, regexp_replace(page,'#.*$','','g')
), ga4 as (
  select organization_id,
         case when landing_page like 'http://%' or landing_page like 'https://%' then regexp_replace(landing_page,'#.*$','','g') else landing_page end landing_key,
         sum(sessions)::bigint sessions, sum(engaged_sessions)::bigint engaged_sessions, sum(key_events) key_events
  from public.ga4_landing_page_daily where analytics_date >= current_date-29
  group by organization_id, case when landing_page like 'http://%' or landing_page like 'https://%' then regexp_replace(landing_page,'#.*$','','g') else landing_page end
), crm as (
  select organization_id,landing_page,count(*) leads,
         count(*) filter(where current_stage=any(array['qualified'::public.lead_stage,'high_intent'::public.lead_stage,'payment_pending'::public.lead_stage,'enrolled'::public.lead_stage])) qualified_leads,
         count(*) filter(where current_stage='enrolled'::public.lead_stage) enrolled_leads
  from public.leads where created_at >= now()-interval '30 days' and landing_page is not null and btrim(landing_page)<>''
  group by organization_id,landing_page
), gmatch as (
  select pi.organization_id,pi.page_id,g.clicks,g.impressions,g.ctr,g.avg_position from page_inventory pi join gsc g on g.organization_id=pi.organization_id and g.normalized_page=pi.normalized_url
  union
  select pi.organization_id,pi.page_id,g.clicks,g.impressions,g.ctr,g.avg_position from page_inventory pi join gsc g on g.organization_id=pi.organization_id and g.normalized_page=regexp_replace(pi.normalized_url,'/$','','g')
), amatch as (
  select pi.organization_id,pi.page_id,a.sessions,a.engaged_sessions,a.key_events from page_inventory pi join ga4 a on a.organization_id=pi.organization_id and a.landing_key=pi.normalized_url
  union
  select pi.organization_id,pi.page_id,a.sessions,a.engaged_sessions,a.key_events from page_inventory pi join ga4 a on a.organization_id=pi.organization_id and a.landing_key=pi.url_path
  union
  select pi.organization_id,pi.page_id,a.sessions,a.engaged_sessions,a.key_events from page_inventory pi join ga4 a on a.organization_id=pi.organization_id and regexp_replace(a.landing_key,'\?.*$','','g')=pi.url_path
), cmatch as (
  select pi.organization_id,pi.page_id,c.leads,c.qualified_leads,c.enrolled_leads from page_inventory pi join crm c on c.organization_id=pi.organization_id and c.landing_page=pi.normalized_url
  union
  select pi.organization_id,pi.page_id,c.leads,c.qualified_leads,c.enrolled_leads from page_inventory pi join crm c on c.organization_id=pi.organization_id and c.landing_page=pi.url_path
  union
  select pi.organization_id,pi.page_id,c.leads,c.qualified_leads,c.enrolled_leads from page_inventory pi join crm c on c.organization_id=pi.organization_id and regexp_replace(c.landing_page,'\?.*$','','g')=pi.url_path
)
select pi.page_id,pi.organization_id,pi.site_id,pi.hostname,pi.normalized_url,pi.url_path,pi.page_type,pi.lifecycle_status,pi.http_status,pi.title,pi.meta_description,pi.word_count,pi.is_indexable,pi.indexability_reason,pi.schema_types,pi.technical_flags,
 coalesce(g.clicks,0::bigint) gsc_clicks,coalesce(g.impressions,0::bigint) gsc_impressions,coalesce(g.ctr,0::numeric) gsc_ctr,coalesce(g.avg_position,0::numeric) gsc_avg_position,
 coalesce(a.sessions,0::bigint) ga4_sessions,coalesce(a.engaged_sessions,0::bigint) ga4_engaged_sessions,coalesce(a.key_events,0::numeric) ga4_key_events,
 coalesce(c.leads,0::bigint) crm_leads,coalesce(c.qualified_leads,0::bigint) crm_qualified_leads,coalesce(c.enrolled_leads,0::bigint) crm_enrolled_leads
from page_inventory pi
left join gmatch g on g.organization_id=pi.organization_id and g.page_id=pi.page_id
left join amatch a on a.organization_id=pi.organization_id and a.page_id=pi.page_id
left join cmatch c on c.organization_id=pi.organization_id and c.page_id=pi.page_id;
