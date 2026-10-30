-- =============================================================================
-- PH-5.2B.1m COLD-RECOVERY COMPATIBILITY BASELINE
-- Migration 040 prerequisite: Campaigns helper functions + CRM read models
--
-- This file is NOT part of the normal production migration ledger.
-- Never run it against current production.
-- No production ad, lead, payment, credential, or integration data is copied.
-- =============================================================================

begin;

create or replace function public.campaign_workspace_json_text(
  p_payload jsonb,
  p_keys text[]
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_key text;
  v_value text;
begin
  if p_payload is null or p_keys is null then
    return null;
  end if;
  foreach v_key in array p_keys loop
    v_value := nullif(btrim(p_payload ->> v_key), '');
    if v_value is not null then
      return v_value;
    end if;
  end loop;
  return null;
end;
$function$;

create or replace function public.campaign_workspace_json_numeric(
  p_payload jsonb,
  p_keys text[]
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_key text;
  v_value text;
  v_number numeric;
begin
  if p_payload is null or p_keys is null then
    return null;
  end if;
  foreach v_key in array p_keys loop
    v_value := nullif(btrim(p_payload ->> v_key), '');
    if v_value is null then
      continue;
    end if;
    begin
      v_number := v_value::numeric;
      return v_number;
    exception
      when invalid_text_representation then continue;
      when numeric_value_out_of_range then continue;
    end;
  end loop;
  return null;
end;
$function$;

-- -----------------------------------------------------------------------------
-- Google Ads reporting + CRM attribution
-- -----------------------------------------------------------------------------

create or replace view public.v_google_ads_reporting_window
with (security_invoker = true)
as
select
  max(g.date) - 29 as start_date,
  max(g.date) as end_date,
  g.organization_id
from public.google_ads_campaign_daily g
group by g.organization_id;

create or replace view public.v_google_ads_lead_campaign_attribution
with (security_invoker = true)
as
with paid_google as (
  select
    t.id as touchpoint_id,
    t.lead_id,
    t.occurred_at,
    t.external_campaign_id,
    t.external_adset_id,
    t.external_ad_id,
    t.gclid,
    t.gbraid,
    t.wbraid,
    t.term,
    t.utm_term,
    t.landing_page,
    t.source,
    t.medium,
    l.created_at as lead_created_at,
    l.current_stage,
    t.organization_id,
    row_number() over (partition by t.organization_id,t.lead_id order by t.occurred_at,t.id) as first_paid_rank,
    row_number() over (
      partition by t.organization_id,t.lead_id
      order by case when t.occurred_at <= l.created_at then 0 else 1 end,
               t.occurred_at desc,t.id desc
    ) as creation_rank
  from public.touchpoints t
  join public.leads l
    on l.id=t.lead_id and l.organization_id=t.organization_id
  where t.lead_id is not null
    and nullif(t.external_campaign_id,'') is not null
    and (
      lower(coalesce(t.source,t.utm_source,'')) = any(array['google','google.com','googleads','google_ads'])
      or t.gclid is not null or t.gbraid is not null or t.wbraid is not null
    )
),
first_paid as (select * from paid_google where first_paid_rank=1),
creation_paid as (select * from paid_google where creation_rank=1),
campaign_names as (
  select organization_id,campaign_id,max(campaign_name) as campaign_name
  from public.google_ads_campaign_daily
  group by organization_id,campaign_id
)
select
  fp.lead_id,
  fp.lead_created_at,
  fp.current_stage,
  fp.touchpoint_id as first_paid_touchpoint_id,
  fp.occurred_at as first_paid_touch_at,
  fp.external_campaign_id as first_paid_campaign_id,
  cn1.campaign_name as first_paid_campaign_name,
  fp.external_adset_id as first_paid_adgroup_id,
  fp.external_ad_id as first_paid_ad_id,
  fp.gclid as first_paid_gclid,
  coalesce(nullif(fp.term,''),nullif(fp.utm_term,'')) as first_paid_keyword,
  fp.landing_page as first_paid_landing_page,
  cp.touchpoint_id as lead_creation_touchpoint_id,
  cp.occurred_at as lead_creation_touch_at,
  cp.external_campaign_id as lead_creation_campaign_id,
  cn2.campaign_name as lead_creation_campaign_name,
  cp.external_adset_id as lead_creation_adgroup_id,
  cp.external_ad_id as lead_creation_ad_id,
  cp.gclid as lead_creation_gclid,
  fp.organization_id
from first_paid fp
left join creation_paid cp
  on cp.organization_id=fp.organization_id and cp.lead_id=fp.lead_id
left join campaign_names cn1
  on cn1.organization_id=fp.organization_id and cn1.campaign_id=fp.external_campaign_id
left join campaign_names cn2
  on cn2.organization_id=fp.organization_id and cn2.campaign_id=cp.external_campaign_id;

create or replace view public.v_google_ads_lead_revenue
with (security_invoker = true)
as
select
  l.id as lead_id,
  coalesce(sum(case when upper(p.currency)='INR' and p.payment_kind<>'refund'::public.payment_kind and p.status='paid'::public.payment_status then p.amount when upper(p.currency)='INR' and p.payment_kind='refund'::public.payment_kind and p.status=any(array['refunded'::public.payment_status,'paid'::public.payment_status]) then -p.amount else 0::numeric end),0::numeric)::numeric(14,2) as net_revenue_inr,
  coalesce(sum(case when upper(p.currency)='USD' and p.payment_kind<>'refund'::public.payment_kind and p.status='paid'::public.payment_status then p.amount when upper(p.currency)='USD' and p.payment_kind='refund'::public.payment_kind and p.status=any(array['refunded'::public.payment_status,'paid'::public.payment_status]) then -p.amount else 0::numeric end),0::numeric)::numeric(14,2) as net_revenue_usd,
  case when coalesce(sum(case when p.payment_kind<>'refund'::public.payment_kind and p.status='paid'::public.payment_status then p.amount when p.payment_kind='refund'::public.payment_kind and p.status=any(array['refunded'::public.payment_status,'paid'::public.payment_status]) then -p.amount else 0::numeric end),0::numeric)>0::numeric then true else false end as has_net_paid
from public.leads l
left join public.payments p on p.lead_id=l.id
group by l.id;

create or replace view public.v_google_ads_campaign_crm_30d
with (security_invoker = true)
as
with bounds as (
  select start_date,end_date,organization_id from public.v_google_ads_reporting_window
),
ads as (
  select g.customer_id,g.campaign_id,max(g.campaign_name) as campaign_name,
    max(g.campaign_status) as campaign_status,
    max(g.advertising_channel_type) as advertising_channel_type,
    max(g.currency_code) as currency_code,
    sum(g.impressions)::bigint as impressions,
    sum(g.clicks)::bigint as clicks,
    round(sum(g.cost_micros)/1000000::numeric,2) as spend,
    sum(g.conversions)::numeric(18,2) as google_conversions,
    sum(g.conversions_value)::numeric(18,2) as google_conversion_value,
    g.organization_id
  from public.google_ads_campaign_daily g
  join bounds b on b.organization_id=g.organization_id
  where g.date>=b.start_date and g.date<=b.end_date
  group by g.organization_id,g.customer_id,g.campaign_id
),
lead_cohort as (
  select a.lead_id,a.first_paid_campaign_id as campaign_id,a.lead_created_at,a.current_stage,
    j.behaviour_temperature,
    coalesce(r.net_revenue_inr,0::numeric) as net_revenue_inr,
    coalesce(r.net_revenue_usd,0::numeric) as net_revenue_usd,
    coalesce(r.has_net_paid,false) as has_net_paid,
    a.organization_id
  from public.v_google_ads_lead_campaign_attribution a
  join bounds b on b.organization_id=a.organization_id
  left join public.v_lead_journey_intelligence j on j.lead_id=a.lead_id and j.organization_id=a.organization_id
  left join public.v_google_ads_lead_revenue r on r.lead_id=a.lead_id
  where a.lead_created_at>=b.start_date::timestamptz
    and a.lead_created_at<(b.end_date+1)::timestamptz
),
crm as (
  select lc.campaign_id,
    count(*) as crm_leads,
    count(*) filter(where lc.current_stage=any(array['qualified'::public.lead_stage,'high_intent'::public.lead_stage,'payment_pending'::public.lead_stage,'enrolled'::public.lead_stage])) as qualified_leads,
    count(*) filter(where lc.current_stage='high_intent'::public.lead_stage) as high_intent_leads,
    count(*) filter(where lc.current_stage='payment_pending'::public.lead_stage) as payment_pending_leads,
    count(*) filter(where lc.current_stage='enrolled'::public.lead_stage) as enrolled_leads,
    count(*) filter(where lc.has_net_paid) as paid_leads,
    count(*) filter(where lc.behaviour_temperature='hot') as hot_leads,
    count(*) filter(where lc.behaviour_temperature='warm') as warm_leads,
    count(*) filter(where lc.behaviour_temperature='cold') as cold_leads,
    count(*) filter(where lc.behaviour_temperature='closed') as closed_leads,
    sum(lc.net_revenue_inr)::numeric(14,2) as crm_revenue_inr,
    sum(lc.net_revenue_usd)::numeric(14,2) as crm_revenue_usd,
    lc.organization_id
  from lead_cohort lc
  group by lc.organization_id,lc.campaign_id
)
select
  a.customer_id,a.campaign_id,a.campaign_name,a.campaign_status,a.advertising_channel_type,a.currency_code,
  a.impressions,a.clicks,a.spend,a.google_conversions,a.google_conversion_value,
  coalesce(c.crm_leads,0::bigint) as crm_leads,
  coalesce(c.qualified_leads,0::bigint) as qualified_leads,
  coalesce(c.high_intent_leads,0::bigint) as high_intent_leads,
  coalesce(c.payment_pending_leads,0::bigint) as payment_pending_leads,
  coalesce(c.paid_leads,0::bigint) as paid_leads,
  coalesce(c.enrolled_leads,0::bigint) as enrolled_leads,
  coalesce(c.hot_leads,0::bigint) as hot_leads,
  coalesce(c.warm_leads,0::bigint) as warm_leads,
  coalesce(c.cold_leads,0::bigint) as cold_leads,
  coalesce(c.closed_leads,0::bigint) as closed_leads,
  coalesce(c.crm_revenue_inr,0::numeric)::numeric(14,2) as crm_revenue_inr,
  coalesce(c.crm_revenue_usd,0::numeric)::numeric(14,2) as crm_revenue_usd,
  case when a.clicks>0 then round(a.spend/a.clicks::numeric,2) else 0::numeric end as avg_cpc,
  case when coalesce(c.crm_leads,0)>0 then round(a.spend/c.crm_leads::numeric,2) else null::numeric end as cpl,
  case when coalesce(c.qualified_leads,0)>0 then round(a.spend/c.qualified_leads::numeric,2) else null::numeric end as cost_per_qualified_lead,
  case when coalesce(c.paid_leads,0)>0 then round(a.spend/c.paid_leads::numeric,2) else null::numeric end as cost_per_paid_lead,
  case when coalesce(c.enrolled_leads,0)>0 then round(a.spend/c.enrolled_leads::numeric,2) else null::numeric end as cac,
  case when a.currency_code='INR' and a.spend>0 then round(coalesce(c.crm_revenue_inr,0::numeric)/a.spend,2) else null::numeric end as roas_inr,
  case when a.clicks>0 then round(coalesce(c.crm_leads,0)::numeric/a.clicks::numeric*100,2) else 0::numeric end as click_to_lead_rate,
  case when coalesce(c.crm_leads,0)>0 then round(coalesce(c.enrolled_leads,0)::numeric/c.crm_leads::numeric*100,2) else 0::numeric end as lead_to_enrollment_rate,
  a.organization_id
from ads a
left join crm c on c.organization_id=a.organization_id and c.campaign_id=a.campaign_id;

-- -----------------------------------------------------------------------------
-- Meta Ads reporting + CRM attribution
-- -----------------------------------------------------------------------------

create or replace view public.v_meta_ads_reporting_window
with (security_invoker = true)
as
select max(m.date)-29 as start_date,max(m.date) as end_date,m.organization_id
from public.meta_ads_campaign_daily m
group by m.organization_id
having max(m.date) is not null;

create or replace view public.v_meta_ads_lead_attribution
with (security_invoker = true)
as
with ranked as (
  select t.id as touchpoint_id,t.lead_id,t.anonymous_visitor_id,t.web_session_id,
    t.occurred_at as first_paid_touch_at,t.source,t.medium,
    t.campaign_name as tracked_campaign_name,t.external_campaign_id as campaign_id,
    t.external_adset_id as adset_id,t.external_ad_id as ad_id,t.fbclid,t.landing_page,
    t.geo_country,t.geo_region,t.geo_city,t.organization_id,
    row_number() over(partition by t.organization_id,t.lead_id order by t.occurred_at,t.id) as rn
  from public.touchpoints t
  where t.lead_id is not null
    and lower(coalesce(t.medium,''))='paid_social'
    and nullif(btrim(t.external_campaign_id),'') is not null
)
select
  r.touchpoint_id,r.lead_id,r.anonymous_visitor_id,r.web_session_id,r.first_paid_touch_at,r.source,r.medium,
  case when lower(coalesce(r.source,''))=any(array['ig','instagram']) then 'instagram' when lower(coalesce(r.source,''))=any(array['fb','facebook']) then 'facebook' when lower(coalesce(r.source,''))='meta' then 'meta' else lower(coalesce(r.source,'meta')) end as publisher_platform,
  r.campaign_id,coalesce(mc.campaign_name,r.tracked_campaign_name) as campaign_name,
  r.adset_id,mas.adset_name,r.ad_id,ma.ad_name,r.fbclid,r.landing_page,r.geo_country,r.geo_region,r.geo_city,
  mc.campaign_id is not null as campaign_matched,
  mas.adset_id is not null as adset_matched,
  ma.ad_id is not null as ad_matched,
  r.organization_id
from ranked r
left join lateral (
  select m.campaign_id,m.campaign_name from public.meta_ads_campaign_daily m
  where m.organization_id=r.organization_id and m.campaign_id=r.campaign_id
  order by m.date desc limit 1
) mc on true
left join lateral (
  select m.adset_id,m.adset_name from public.meta_ads_adset_daily m
  where m.organization_id=r.organization_id and m.adset_id=r.adset_id
  order by m.date desc limit 1
) mas on true
left join lateral (
  select m.ad_id,m.ad_name from public.meta_ads_ad_daily m
  where m.organization_id=r.organization_id and m.ad_id=r.ad_id
  order by m.date desc limit 1
) ma on true
where r.rn=1;

create or replace view public.v_meta_ads_lead_revenue
with (security_invoker = true)
as
select
  a.lead_id,l.lead_code,
  coalesce(nullif(l.display_name,''),nullif(trim(concat_ws(' ',l.first_name,l.last_name)),''),l.lead_code) as lead_name,
  l.current_stage,a.first_paid_touch_at,a.publisher_platform,a.campaign_id,a.campaign_name,a.adset_id,a.adset_name,a.ad_id,a.ad_name,
  a.fbclid,a.landing_page,a.geo_country,a.geo_region,a.geo_city,a.campaign_matched,a.adset_matched,a.ad_matched,
  coalesce(pay.gross_paid_inr,0::numeric)::numeric(14,2) as gross_paid_inr,
  coalesce(pay.refunds_inr,0::numeric)::numeric(14,2) as refunds_inr,
  coalesce(pay.net_paid_inr,0::numeric)::numeric(14,2) as revenue_inr,
  coalesce(pay.gross_paid_usd,0::numeric)::numeric(14,2) as gross_paid_usd,
  coalesce(pay.refunds_usd,0::numeric)::numeric(14,2) as refunds_usd,
  coalesce(pay.net_paid_usd,0::numeric)::numeric(14,2) as revenue_usd,
  coalesce(pay.has_paid,false) as is_paid,
  l.current_stage=any(array['qualified'::public.lead_stage,'high_intent'::public.lead_stage,'payment_pending'::public.lead_stage,'enrolled'::public.lead_stage]) as is_qualified,
  l.current_stage=any(array['high_intent'::public.lead_stage,'payment_pending'::public.lead_stage,'enrolled'::public.lead_stage]) as is_high_intent,
  l.current_stage='payment_pending'::public.lead_stage as is_payment_pending,
  (l.current_stage='enrolled'::public.lead_stage or exists(select 1 from public.enrollments e where e.lead_id=l.id and e.organization_id=l.organization_id)) as is_enrolled,
  rs.payment_status,a.organization_id
from public.v_meta_ads_lead_attribution a
join public.leads l on l.id=a.lead_id and l.organization_id=a.organization_id
left join public.v_lead_revenue_status rs on rs.lead_id=a.lead_id and rs.organization_id=a.organization_id
left join lateral (
  select
    coalesce(sum(v.gross_paid) filter(where upper(v.currency)='INR'),0::numeric) as gross_paid_inr,
    coalesce(sum(v.refunds) filter(where upper(v.currency)='INR'),0::numeric) as refunds_inr,
    coalesce(sum(v.net_paid) filter(where upper(v.currency)='INR'),0::numeric) as net_paid_inr,
    coalesce(sum(v.gross_paid) filter(where upper(v.currency)='USD'),0::numeric) as gross_paid_usd,
    coalesce(sum(v.refunds) filter(where upper(v.currency)='USD'),0::numeric) as refunds_usd,
    coalesce(sum(v.net_paid) filter(where upper(v.currency)='USD'),0::numeric) as net_paid_usd,
    coalesce(bool_or(v.net_paid>0::numeric),false) as has_paid
  from public.v_lead_payment_totals v
  where v.lead_id=a.lead_id and v.organization_id=a.organization_id
) pay on true;

create or replace view public.v_meta_ads_campaign_crm_30d
with (security_invoker = true)
as
with w as (
  select start_date,end_date,organization_id from public.v_meta_ads_reporting_window
),
ads as (
  select m.ad_account_id,m.campaign_id,max(m.campaign_name) as campaign_name,max(m.objective) as objective,
    max(m.currency_code) as currency_code,
    sum(coalesce(m.spend,0::numeric))::numeric(14,2) as spend,
    sum(coalesce(m.impressions,0::bigint))::bigint as impressions,
    sum(coalesce(m.clicks,0::bigint))::bigint as clicks,
    sum(coalesce(m.inline_link_clicks,0::bigint))::bigint as inline_link_clicks,
    m.organization_id
  from public.meta_ads_campaign_daily m
  join w on w.organization_id=m.organization_id
  where m.date>=w.start_date and m.date<=w.end_date
  group by m.organization_id,m.ad_account_id,m.campaign_id
),
crm as (
  select r.campaign_id,count(distinct r.lead_id) as crm_leads,
    count(distinct r.lead_id) filter(where r.is_qualified) as qualified_leads,
    count(distinct r.lead_id) filter(where r.is_high_intent) as high_intent_leads,
    count(distinct r.lead_id) filter(where r.is_payment_pending) as payment_pending_leads,
    count(distinct r.lead_id) filter(where r.is_paid) as paid_leads,
    count(distinct r.lead_id) filter(where r.is_enrolled) as enrolled_leads,
    coalesce(sum(r.revenue_inr),0::numeric)::numeric(14,2) as crm_revenue_inr,
    coalesce(sum(r.revenue_usd),0::numeric)::numeric(14,2) as crm_revenue_usd,
    r.organization_id
  from public.v_meta_ads_lead_revenue r
  join w on w.organization_id=r.organization_id
  where r.first_paid_touch_at::date>=w.start_date and r.first_paid_touch_at::date<=w.end_date
  group by r.organization_id,r.campaign_id
)
select
  a.ad_account_id,a.campaign_id,a.campaign_name,a.objective,a.currency_code,w.start_date,w.end_date,
  a.spend,a.impressions,a.clicks,a.inline_link_clicks,
  case when a.impressions>0 then round(a.clicks::numeric/a.impressions::numeric*100,4) else null::numeric end as ctr,
  case when a.clicks>0 then round(a.spend/a.clicks::numeric,2) else null::numeric end as avg_cpc,
  coalesce(c.crm_leads,0::bigint) as crm_leads,
  coalesce(c.qualified_leads,0::bigint) as qualified_leads,
  coalesce(c.high_intent_leads,0::bigint) as high_intent_leads,
  coalesce(c.payment_pending_leads,0::bigint) as payment_pending_leads,
  coalesce(c.paid_leads,0::bigint) as paid_leads,
  coalesce(c.enrolled_leads,0::bigint) as enrolled_leads,
  coalesce(c.crm_revenue_inr,0::numeric)::numeric(14,2) as crm_revenue_inr,
  coalesce(c.crm_revenue_usd,0::numeric)::numeric(14,2) as crm_revenue_usd,
  case when coalesce(c.crm_leads,0)>0 then round(a.spend/c.crm_leads::numeric,2) else null::numeric end as cpl,
  case when coalesce(c.qualified_leads,0)>0 then round(a.spend/c.qualified_leads::numeric,2) else null::numeric end as cost_per_qualified_lead,
  case when coalesce(c.paid_leads,0)>0 then round(a.spend/c.paid_leads::numeric,2) else null::numeric end as cost_per_paid_lead,
  case when coalesce(c.enrolled_leads,0)>0 then round(a.spend/c.enrolled_leads::numeric,2) else null::numeric end as cac,
  case when a.spend>0 and upper(coalesce(a.currency_code,''))='INR' then round(coalesce(c.crm_revenue_inr,0::numeric)/a.spend,4) when a.spend>0 and upper(coalesce(a.currency_code,''))='USD' then round(coalesce(c.crm_revenue_usd,0::numeric)/a.spend,4) else null::numeric end as roas,
  case when a.clicks>0 then round(coalesce(c.crm_leads,0)::numeric/a.clicks::numeric*100,4) else null::numeric end as click_to_lead_rate,
  case when coalesce(c.crm_leads,0)>0 then round(coalesce(c.enrolled_leads,0)::numeric/c.crm_leads::numeric*100,4) else null::numeric end as lead_to_enrollment_rate,
  a.organization_id
from ads a
join w on w.organization_id=a.organization_id
left join crm c on c.organization_id=a.organization_id and c.campaign_id=a.campaign_id;

revoke all on table
  public.v_google_ads_reporting_window,
  public.v_google_ads_lead_campaign_attribution,
  public.v_google_ads_lead_revenue,
  public.v_google_ads_campaign_crm_30d,
  public.v_meta_ads_reporting_window,
  public.v_meta_ads_lead_attribution,
  public.v_meta_ads_lead_revenue,
  public.v_meta_ads_campaign_crm_30d
from public, anon, authenticated, service_role;

grant select on table
  public.v_google_ads_reporting_window,
  public.v_google_ads_lead_campaign_attribution,
  public.v_google_ads_lead_revenue,
  public.v_google_ads_campaign_crm_30d,
  public.v_meta_ads_reporting_window,
  public.v_meta_ads_lead_attribution,
  public.v_meta_ads_lead_revenue,
  public.v_meta_ads_campaign_crm_30d
to authenticated, service_role;

revoke all on function public.campaign_workspace_json_text(jsonb,text[]) from public, anon;
revoke all on function public.campaign_workspace_json_numeric(jsonb,text[]) from public, anon;
grant execute on function public.campaign_workspace_json_text(jsonb,text[]) to authenticated, service_role;
grant execute on function public.campaign_workspace_json_numeric(jsonb,text[]) to authenticated, service_role;

commit;
