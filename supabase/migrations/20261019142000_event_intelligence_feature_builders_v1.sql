begin;

create or replace function public.build_session_intelligence_features_v1(
  p_organization_id uuid,
  p_session_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public,pg_temp
as $function$
with target as (
  select ws.*,
    (
      select count(*)::int
      from public.web_sessions prior
      where prior.organization_id=ws.organization_id
        and prior.anonymous_visitor_id=ws.anonymous_visitor_id
        and (prior.started_at,prior.id) <= (ws.started_at,ws.id)
    ) as session_number
  from public.web_sessions ws
  where ws.organization_id=p_organization_id and ws.id=p_session_id
), tp as (
  select
    count(*)::int as touchpoints,
    count(*) filter (where event_type='page_view')::int as page_views,
    count(*) filter (where event_type='form_start')::int as form_starts,
    count(*) filter (where event_type='lead_form_submit')::int as form_submits,
    count(*) filter (where event_type like '%click')::int as cta_clicks,
    count(*) filter (where event_type in ('whatsapp_click','phone_click','email_click','instagram_click'))::int as contact_clicks,
    count(*) filter (where event_type in ('enrollment_cta_click','lead_form_submit','whatsapp_click'))::int as high_intent_events,
    count(distinct public.normalize_event_intelligence_url_v1(landing_page)) filter (where landing_page is not null)::int as unique_pages
  from public.touchpoints
  where organization_id=p_organization_id and web_session_id=p_session_id
), visitor as (
  select count(*) filter (where ws.started_at>=now()-interval '30 days')::int as sessions_30d
  from public.web_sessions ws join target t on t.anonymous_visitor_id=ws.anonymous_visitor_id
  where ws.organization_id=p_organization_id
), paid as (
  select coalesce(jsonb_object_agg(x.currency,x.amount),'{}'::jsonb) as revenue_by_currency,
         coalesce(sum(x.payment_count),0)::int as paid_payment_count
  from (
    select upper(coalesce(p.currency,'UNKNOWN')) as currency,sum(p.amount) as amount,count(*)::int as payment_count
    from public.payments p join target t on t.lead_id=p.lead_id
    where p.organization_id=p_organization_id and p.status='paid'
    group by upper(coalesce(p.currency,'UNKNOWN'))
  ) x
), enr as (
  select count(*) filter (where e.status in ('confirmed','completed'))::int as enrollment_count
  from public.enrollments e join target t on t.lead_id=e.lead_id
  where e.organization_id=p_organization_id
), lead_ctx as (
  select l.current_stage::text as current_stage,l.intent::text as intent
  from public.leads l join target t on t.lead_id=l.id
  where l.organization_id=p_organization_id
)
select jsonb_strip_nulls(jsonb_build_object(
  'subject','session',
  'session_id',t.id,
  'session_key',t.session_key,
  'anonymous_visitor_id',t.anonymous_visitor_id,
  'started_at',t.started_at,
  'last_seen_at',t.last_seen_at,
  'duration_seconds',greatest(0,extract(epoch from (coalesce(t.last_seen_at,t.started_at)-t.started_at)))::bigint,
  'session_number',t.session_number,
  'returning_visitor',(t.session_number>1),
  'visitor_sessions_30d',v.sessions_30d,
  'source',coalesce(t.source,t.utm_source),
  'medium',coalesce(t.medium,t.utm_medium),
  'campaign',coalesce(t.campaign_name,t.utm_campaign),
  'country',t.geo_country,
  'lead_linked',(t.lead_id is not null),
  'lead_id',t.lead_id,
  'lead_stage',l.current_stage,
  'lead_intent',l.intent,
  'touchpoints',tp.touchpoints,
  'page_views',tp.page_views,
  'unique_pages',tp.unique_pages,
  'form_starts',tp.form_starts,
  'form_submits',tp.form_submits,
  'cta_clicks',tp.cta_clicks,
  'contact_clicks',tp.contact_clicks,
  'high_intent_events',tp.high_intent_events,
  'paid_payment_count',p.paid_payment_count,
  'revenue_by_currency',p.revenue_by_currency,
  'enrollment_count',e.enrollment_count,
  'converted',(coalesce(e.enrollment_count,0)>0 or coalesce(p.paid_payment_count,0)>0)
))
from target t
cross join tp
cross join visitor v
cross join paid p
cross join enr e
left join lead_ctx l on true;
$function$;

create or replace function public.build_page_intelligence_features_v1(
  p_organization_id uuid,
  p_page text
)
returns jsonb
language sql
stable
security definer
set search_path = public,pg_temp
as $function$
with key as (
  select public.normalize_event_intelligence_url_v1(p_page) as page_key
), tp as (
  select
    count(*) filter (where t.occurred_at>=now()-interval '7 days' and t.event_type='page_view')::int as page_views_7d,
    count(*) filter (where t.occurred_at>=now()-interval '14 days' and t.occurred_at<now()-interval '7 days' and t.event_type='page_view')::int as page_views_prev_7d,
    count(*) filter (where t.occurred_at>=now()-interval '30 days' and t.event_type='page_view')::int as page_views_30d,
    count(distinct t.anonymous_visitor_id) filter (where t.occurred_at>=now()-interval '30 days')::int as visitors_30d,
    count(*) filter (where t.occurred_at>=now()-interval '30 days' and t.event_type='form_start')::int as form_starts_30d,
    count(*) filter (where t.occurred_at>=now()-interval '30 days' and t.event_type='lead_form_submit')::int as form_submits_30d,
    count(*) filter (where t.occurred_at>=now()-interval '30 days' and t.event_type in ('whatsapp_click','phone_click','email_click','instagram_click','enrollment_cta_click'))::int as contact_cta_30d,
    count(distinct t.lead_id) filter (where t.occurred_at>=now()-interval '30 days' and t.lead_id is not null)::int as linked_leads_30d
  from public.touchpoints t,key k
  where t.organization_id=p_organization_id
    and public.normalize_event_intelligence_url_v1(t.landing_page)=k.page_key
), lead_ids as (
  select distinct t.lead_id
  from public.touchpoints t,key k
  where t.organization_id=p_organization_id
    and t.occurred_at>=now()-interval '30 days'
    and t.lead_id is not null
    and public.normalize_event_intelligence_url_v1(t.landing_page)=k.page_key
), conversion as (
  select count(distinct e.lead_id) filter (where e.status in ('confirmed','completed'))::int as assisted_enrolled_leads_30d
  from public.enrollments e join lead_ids li on li.lead_id=e.lead_id
  where e.organization_id=p_organization_id
), revenue as (
  select coalesce(jsonb_object_agg(x.currency,x.amount),'{}'::jsonb) as assisted_revenue_by_currency_30d
  from (
    select upper(coalesce(p.currency,'UNKNOWN')) as currency,sum(p.amount) as amount
    from public.payments p join lead_ids li on li.lead_id=p.lead_id
    where p.organization_id=p_organization_id
      and p.status='paid'
      and coalesce(p.paid_at,p.created_at)>=now()-interval '30 days'
    group by upper(coalesce(p.currency,'UNKNOWN'))
  ) x
), gsc as (
  select
    coalesce(sum(g.clicks) filter (where g.date>=current_date-6),0)::bigint as organic_clicks_7d,
    coalesce(sum(g.clicks) filter (where g.date between current_date-13 and current_date-7),0)::bigint as organic_clicks_prev_7d,
    coalesce(sum(g.clicks),0)::bigint as organic_clicks_30d,
    coalesce(sum(g.impressions),0)::bigint as organic_impressions_30d,
    case when coalesce(sum(g.impressions),0)>0 then sum(g.clicks)::numeric/sum(g.impressions)::numeric else null end as organic_ctr_30d,
    case when coalesce(sum(g.impressions),0)>0 then sum(g.avg_position*g.impressions)::numeric/nullif(sum(g.impressions),0) else null end as weighted_position_30d
  from public.gsc_page_daily g,key k
  where g.organization_id=p_organization_id
    and g.date>=current_date-29
    and public.normalize_event_intelligence_url_v1(g.page)=k.page_key
), seo as (
  select sp.id,sp.page_type,sp.lifecycle_status
  from public.seo_pages sp,key k
  where sp.organization_id=p_organization_id
    and public.normalize_event_intelligence_url_v1(coalesce(sp.canonical_url,sp.normalized_url))=k.page_key
  order by sp.updated_at desc limit 1
)
select jsonb_strip_nulls(jsonb_build_object(
  'subject','page','page',k.page_key,'seo_page_id',s.id,'page_type',s.page_type,'lifecycle_status',s.lifecycle_status,
  'page_views_7d',tp.page_views_7d,'page_views_prev_7d',tp.page_views_prev_7d,
  'page_views_change_7d',case when tp.page_views_prev_7d>0 then (tp.page_views_7d-tp.page_views_prev_7d)::numeric/tp.page_views_prev_7d else null end,
  'page_views_30d',tp.page_views_30d,'visitors_30d',tp.visitors_30d,
  'form_starts_30d',tp.form_starts_30d,'form_submits_30d',tp.form_submits_30d,'contact_cta_30d',tp.contact_cta_30d,
  'linked_leads_30d',tp.linked_leads_30d,'assisted_enrolled_leads_30d',c.assisted_enrolled_leads_30d,
  'assisted_revenue_by_currency_30d',r.assisted_revenue_by_currency_30d,
  'organic_clicks_7d',g.organic_clicks_7d,'organic_clicks_prev_7d',g.organic_clicks_prev_7d,
  'organic_clicks_change_7d',case when g.organic_clicks_prev_7d>0 then (g.organic_clicks_7d-g.organic_clicks_prev_7d)::numeric/g.organic_clicks_prev_7d else null end,
  'organic_clicks_30d',g.organic_clicks_30d,'organic_impressions_30d',g.organic_impressions_30d,
  'organic_ctr_30d',g.organic_ctr_30d,'weighted_position_30d',g.weighted_position_30d,
  'lead_rate_30d',case when tp.visitors_30d>0 then tp.linked_leads_30d::numeric/tp.visitors_30d else null end,
  'enrollment_rate_from_linked_leads_30d',case when tp.linked_leads_30d>0 then c.assisted_enrolled_leads_30d::numeric/tp.linked_leads_30d else null end
))
from key k cross join tp cross join conversion c cross join revenue r cross join gsc g left join seo s on true;
$function$;

create or replace function public.build_paid_campaign_intelligence_features_v1(
  p_organization_id uuid,p_platform text,p_campaign_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public,pg_temp
as $function$
declare
  v_platform text := lower(btrim(coalesce(p_platform,'')));
  v_campaign text := btrim(coalesce(p_campaign_id,''));
  v_media jsonb := '{}'::jsonb;
  v_crm jsonb := '{}'::jsonb;
  v_revenue jsonb := '{}'::jsonb;
  v_spend numeric := 0;
  v_currency text;
  v_leads integer := 0;
  v_qualified integer := 0;
  v_enrolled integer := 0;
  v_currency_revenue numeric;
begin
  if v_platform not in ('google','meta') then raise exception 'platform must be google or meta'; end if;
  if v_campaign='' then raise exception 'campaign_id is required'; end if;

  if v_platform='google' then
    select jsonb_strip_nulls(jsonb_build_object(
      'campaign_name',max(campaign_name),'currency',max(currency_code),
      'spend_30d',coalesce(sum(cost_micros),0)::numeric/1000000,
      'impressions_30d',coalesce(sum(impressions),0),'clicks_30d',coalesce(sum(clicks),0),
      'platform_conversions_30d',coalesce(sum(conversions),0),'platform_conversion_value_30d',coalesce(sum(conversions_value),0)
    )),coalesce(sum(cost_micros),0)::numeric/1000000,max(currency_code)
    into v_media,v_spend,v_currency
    from public.google_ads_campaign_daily
    where organization_id=p_organization_id and campaign_id=v_campaign and date>=current_date-29;
  else
    select jsonb_strip_nulls(jsonb_build_object(
      'campaign_name',max(campaign_name),'currency',max(currency_code),'spend_30d',coalesce(sum(spend),0),
      'impressions_30d',coalesce(sum(impressions),0),'clicks_30d',coalesce(sum(clicks),0),'reach_30d',coalesce(sum(reach),0),
      'avg_frequency_30d',avg(frequency)
    )),coalesce(sum(spend),0),max(currency_code)
    into v_media,v_spend,v_currency
    from public.meta_ads_campaign_daily
    where organization_id=p_organization_id and campaign_id=v_campaign and date>=current_date-29;
  end if;

  with lead_ids as (
    select distinct t.lead_id
    from public.touchpoints t
    where t.organization_id=p_organization_id and t.occurred_at>=now()-interval '30 days'
      and t.lead_id is not null and t.external_campaign_id=v_campaign
  ), quality as (
    select count(*)::int as leads,
      count(*) filter (where l.current_stage in ('qualified','high_intent','payment_pending','enrolled'))::int as qualified
    from public.leads l join lead_ids li on li.lead_id=l.id
    where l.organization_id=p_organization_id
  ), enrolled as (
    select count(distinct e.lead_id)::int as enrolled
    from public.enrollments e join lead_ids li on li.lead_id=e.lead_id
    where e.organization_id=p_organization_id and e.status in ('confirmed','completed')
  ), rev as (
    select coalesce(jsonb_object_agg(x.currency,x.amount),'{}'::jsonb) as revenue
    from (
      select upper(coalesce(p.currency,'UNKNOWN')) as currency,sum(p.amount) as amount
      from public.payments p join lead_ids li on li.lead_id=p.lead_id
      where p.organization_id=p_organization_id and p.status='paid'
      group by upper(coalesce(p.currency,'UNKNOWN'))
    ) x
  )
  select jsonb_build_object('crm_leads_30d',q.leads,'qualified_leads_30d',q.qualified,'enrolled_leads_30d',e.enrolled),
         q.leads,q.qualified,e.enrolled,r.revenue
  into v_crm,v_leads,v_qualified,v_enrolled,v_revenue
  from quality q cross join enrolled e cross join rev r;

  if v_currency is not null and jsonb_typeof(v_revenue)='object' then
    v_currency_revenue := nullif(v_revenue->>upper(v_currency),'')::numeric;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'subject','paid_campaign','platform',v_platform,'campaign_id',v_campaign,
    'media',v_media,'crm',v_crm,'revenue_by_currency',v_revenue,
    'lead_quality_rate',case when v_leads>0 then v_qualified::numeric/v_leads else null end,
    'cpl',case when v_leads>0 then v_spend/v_leads else null end,
    'cac',case when v_enrolled>0 then v_spend/v_enrolled else null end,
    'roas_same_currency',case when v_spend>0 and v_currency_revenue is not null then v_currency_revenue/v_spend else null end,
    'roas_currency',case when v_currency_revenue is not null then upper(v_currency) else null end
  ));
end;
$function$;

create or replace function public.refresh_event_intelligence_features_v1(
  p_organization_id uuid,
  p_session_limit integer default 500,
  p_page_limit integer default 500,
  p_campaign_limit integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  r record;
  v_payload jsonb;
  v_sessions integer := 0;
  v_pages integer := 0;
  v_campaigns integer := 0;
  v_leads integer := 0;
begin
  if not exists (select 1 from public.organizations where id=p_organization_id) then raise exception 'organization not found'; end if;

  for r in
    select id,session_key,started_at,last_seen_at
    from public.web_sessions
    where organization_id=p_organization_id
    order by last_seen_at desc nulls last,started_at desc
    limit greatest(1,least(coalesce(p_session_limit,500),5000))
  loop
    v_payload := public.build_session_intelligence_features_v1(p_organization_id,r.id);
    if v_payload is not null then
      perform public.upsert_event_intelligence_feature_v1(
        p_organization_id,'session',r.session_key,r.id,'journey_behavior','v1',v_payload,
        jsonb_build_object('sources',jsonb_build_array('web_sessions','touchpoints','leads','payments','enrollments')),
        coalesce(r.last_seen_at,r.started_at,now()),r.started_at,coalesce(r.last_seen_at,r.started_at)
      );
      v_sessions := v_sessions+1;
    end if;
  end loop;

  for r in
    with candidates as (
      select public.normalize_event_intelligence_url_v1(t.landing_page) as page_key,max(t.occurred_at) as latest
      from public.touchpoints t
      where t.organization_id=p_organization_id and t.landing_page is not null and t.occurred_at>=now()-interval '90 days'
      group by public.normalize_event_intelligence_url_v1(t.landing_page)
      union all
      select public.normalize_event_intelligence_url_v1(g.page),max(g.date)::timestamptz
      from public.gsc_page_daily g
      where g.organization_id=p_organization_id and g.date>=current_date-89
      group by public.normalize_event_intelligence_url_v1(g.page)
    ), ranked as (
      select page_key,max(latest) as latest from candidates where page_key is not null group by page_key order by max(latest) desc
    )
    select rnk.page_key,rnk.latest,sp.id as seo_page_id
    from ranked rnk
    left join lateral (
      select s.id from public.seo_pages s
      where s.organization_id=p_organization_id
        and public.normalize_event_intelligence_url_v1(coalesce(s.canonical_url,s.normalized_url))=rnk.page_key
      order by s.updated_at desc limit 1
    ) sp on true
    limit greatest(1,least(coalesce(p_page_limit,500),5000))
  loop
    v_payload := public.build_page_intelligence_features_v1(p_organization_id,r.page_key);
    perform public.upsert_event_intelligence_feature_v1(
      p_organization_id,'page',r.page_key,r.seo_page_id,'traffic_seo_conversion','v1',v_payload,
      jsonb_build_object('sources',jsonb_build_array('touchpoints','gsc_page_daily','payments','enrollments','seo_pages')),
      coalesce(r.latest,now()),now()-interval '30 days',now()
    );
    v_pages := v_pages+1;
  end loop;

  for r in
    with c as (
      select 'google'::text as platform,campaign_id,max(date) as latest
      from public.google_ads_campaign_daily
      where organization_id=p_organization_id and date>=current_date-89 and campaign_id is not null
      group by campaign_id
      union all
      select 'meta'::text,campaign_id,max(date)
      from public.meta_ads_campaign_daily
      where organization_id=p_organization_id and date>=current_date-89 and campaign_id is not null
      group by campaign_id
    )
    select platform,campaign_id,latest from c order by latest desc
    limit greatest(1,least(coalesce(p_campaign_limit,300),3000))
  loop
    v_payload := public.build_paid_campaign_intelligence_features_v1(p_organization_id,r.platform,r.campaign_id);
    perform public.upsert_event_intelligence_feature_v1(
      p_organization_id,'campaign',r.platform||':'||r.campaign_id,null,'paid_media_conversion','v1',v_payload,
      jsonb_build_object('sources',jsonb_build_array(case when r.platform='google' then 'google_ads_campaign_daily' else 'meta_ads_campaign_daily' end,'touchpoints','leads','payments','enrollments')),
      r.latest::timestamptz,now()-interval '30 days',now()
    );
    v_campaigns := v_campaigns+1;
  end loop;

  for r in
    select distinct on (lead_id)
      lead_id,feature_payload,snapshot_version,observed_at,observed_stage,observed_status,outcome_label,outcome_at
    from public.lead_scoring_feature_snapshots
    where organization_id=p_organization_id
    order by lead_id,observed_at desc,created_at desc
  loop
    perform public.upsert_event_intelligence_feature_v1(
      p_organization_id,'lead',r.lead_id::text,r.lead_id,'lead_conversion',coalesce(r.snapshot_version,'lead-scoring-v1'),r.feature_payload,
      jsonb_strip_nulls(jsonb_build_object('source','lead_scoring_feature_snapshots','observed_stage',r.observed_stage,'observed_status',r.observed_status,'outcome_label',r.outcome_label,'outcome_at',r.outcome_at)),
      r.observed_at,null,r.observed_at
    );
    v_leads := v_leads+1;
  end loop;

  return jsonb_build_object(
    'ok',true,'organization_id',p_organization_id,
    'sessions_refreshed',v_sessions,'pages_refreshed',v_pages,'campaigns_refreshed',v_campaigns,'leads_refreshed',v_leads,
    'refreshed_at',now()
  );
end;
$function$;

revoke all on function public.build_session_intelligence_features_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.build_page_intelligence_features_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.build_paid_campaign_intelligence_features_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.refresh_event_intelligence_features_v1(uuid,integer,integer,integer) from public,anon,authenticated;

grant execute on function public.build_session_intelligence_features_v1(uuid,uuid) to service_role;
grant execute on function public.build_page_intelligence_features_v1(uuid,text) to service_role;
grant execute on function public.build_paid_campaign_intelligence_features_v1(uuid,text,text) to service_role;
grant execute on function public.refresh_event_intelligence_features_v1(uuid,integer,integer,integer) to service_role;

commit;
