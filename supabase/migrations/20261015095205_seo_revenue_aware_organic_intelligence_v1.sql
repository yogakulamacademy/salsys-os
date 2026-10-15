-- W6-OG5 Revenue-Aware Organic Intelligence v1
-- Deterministic page-level organic business value using existing GSC, CRM attribution,
-- landing-page capture, payments and OG4 content evidence.
-- Currency amounts remain separate; no inferred FX conversion is performed.

create or replace view public.v_seo_organic_value_page_30d
with (security_invoker = true)
as
with bounds as materialized (
  select d.organization_id, max(d.date) as range_end, max(d.date) - 29 as range_start
  from public.gsc_daily d
  group by d.organization_id
),
page_inventory as materialized (
  select p.page_id, p.organization_id, p.site_id, p.hostname, p.normalized_url,
         p.url_path, p.page_type, p.lifecycle_status, p.title, p.is_indexable
  from public.v_seo_page_inventory p
),
gsc as materialized (
  select d.organization_id,
         lower(regexp_replace(regexp_replace(btrim(d.page), '[?#].*$', ''), '/+$', '')) as page_key,
         sum(d.clicks)::bigint as gsc_clicks,
         sum(d.impressions)::bigint as gsc_impressions,
         case when sum(d.impressions) > 0
              then round(sum(d.clicks)::numeric / sum(d.impressions)::numeric, 8)
              else 0::numeric end as gsc_ctr,
         case when sum(d.impressions) > 0
              then round(sum(d.avg_position * d.impressions::numeric) / sum(d.impressions)::numeric, 2)
              else 0::numeric end as gsc_avg_position
  from public.gsc_page_daily d
  join bounds b on b.organization_id = d.organization_id
               and d.date between b.range_start and b.range_end
  group by d.organization_id, page_key
),
organic_lead_base as materialized (
  select l.organization_id, l.id as lead_id, l.created_at,
         l.current_stage::text as current_stage,
         case when nullif(btrim(l.landing_page), '') is null then null
              else lower(regexp_replace(regexp_replace(btrim(l.landing_page), '[?#].*$', ''), '/+$', '')) end as landing_key
  from public.leads l
  where lower(coalesce(l.first_touch_source, '')) in ('google', 'google.com')
    and lower(coalesce(l.first_touch_medium, '')) in ('organic', 'organic_search', 'organic search')
),
lead_metrics as materialized (
  select l.organization_id, l.landing_key,
         count(*)::bigint as organic_leads,
         count(*) filter (where l.current_stage in ('qualified','high_intent','payment_pending','enrolled'))::bigint as organic_qualified_leads,
         count(*) filter (where l.current_stage = 'enrolled')::bigint as organic_enrolled_leads
  from organic_lead_base l
  join bounds b on b.organization_id = l.organization_id
               and (l.created_at at time zone 'Asia/Kolkata')::date between b.range_start and b.range_end
  group by l.organization_id, l.landing_key
),
revenue_by_lead as materialized (
  select p.organization_id, p.lead_id, l.landing_key,
         coalesce(sum(case
           when upper(p.currency)='INR' and p.payment_kind::text <> 'refund' and p.status::text='paid' then p.amount
           when upper(p.currency)='INR' and p.payment_kind::text='refund' and p.status::text in ('refunded','paid') then -p.amount
           else 0::numeric end),0::numeric)::numeric(14,2) as revenue_inr,
         coalesce(sum(case
           when upper(p.currency)='USD' and p.payment_kind::text <> 'refund' and p.status::text='paid' then p.amount
           when upper(p.currency)='USD' and p.payment_kind::text='refund' and p.status::text in ('refunded','paid') then -p.amount
           else 0::numeric end),0::numeric)::numeric(14,2) as revenue_usd,
         bool_or(p.payment_kind::text <> 'refund' and p.status::text='paid') as had_paid_payment
  from public.payments p
  join organic_lead_base l on l.organization_id=p.organization_id and l.lead_id=p.lead_id
  join bounds b on b.organization_id=p.organization_id
               and (coalesce(p.paid_at,p.created_at) at time zone 'Asia/Kolkata')::date between b.range_start and b.range_end
  group by p.organization_id, p.lead_id, l.landing_key
),
revenue_metrics as materialized (
  select r.organization_id, r.landing_key,
         count(*) filter (where r.had_paid_payment)::bigint as revenue_leads,
         sum(r.revenue_inr)::numeric(14,2) as organic_revenue_inr,
         sum(r.revenue_usd)::numeric(14,2) as organic_revenue_usd
  from revenue_by_lead r
  group by r.organization_id, r.landing_key
),
content as materialized (
  select c.organization_id, c.page_id,
         c.recommended_action as content_recommended_action,
         c.action_priority_score as content_priority_score,
         c.semantic_coverage_score_v1,
         c.technical_issue_count,
         c.internal_link_opportunities
  from public.v_seo_content_page_intelligence_v1 c
)
select p.organization_id, p.site_id, p.page_id, p.hostname, p.normalized_url, p.url_path,
       p.page_type, p.lifecycle_status, p.title, p.is_indexable,
       b.range_start, b.range_end,
       coalesce(g.gsc_clicks,0)::bigint as gsc_clicks,
       coalesce(g.gsc_impressions,0)::bigint as gsc_impressions,
       coalesce(g.gsc_ctr,0)::numeric as gsc_ctr,
       coalesce(g.gsc_avg_position,0)::numeric as gsc_avg_position,
       coalesce(l.organic_leads,0)::bigint as organic_leads,
       coalesce(l.organic_qualified_leads,0)::bigint as organic_qualified_leads,
       coalesce(l.organic_enrolled_leads,0)::bigint as organic_enrolled_leads,
       coalesce(r.revenue_leads,0)::bigint as revenue_leads,
       coalesce(r.organic_revenue_inr,0)::numeric(14,2) as organic_revenue_inr,
       coalesce(r.organic_revenue_usd,0)::numeric(14,2) as organic_revenue_usd,
       case when coalesce(g.gsc_clicks,0)>0
            then round(coalesce(l.organic_leads,0)::numeric/g.gsc_clicks::numeric*100,2)
            else 0::numeric end as click_to_lead_rate_directional,
       case when coalesce(l.organic_leads,0)>0
            then round(coalesce(l.organic_qualified_leads,0)::numeric/l.organic_leads::numeric*100,2)
            else 0::numeric end as lead_to_qualified_rate,
       case when coalesce(l.organic_leads,0)>0
            then round(coalesce(l.organic_enrolled_leads,0)::numeric/l.organic_leads::numeric*100,2)
            else 0::numeric end as lead_to_enrolled_rate,
       coalesce(c.content_recommended_action,'monitor') as content_recommended_action,
       coalesce(c.content_priority_score,0)::integer as content_priority_score,
       coalesce(c.semantic_coverage_score_v1,0)::integer as semantic_coverage_score_v1,
       coalesce(c.technical_issue_count,0)::integer as technical_issue_count,
       coalesce(c.internal_link_opportunities,0)::integer as internal_link_opportunities,
       case
         when coalesce(r.organic_revenue_inr,0)<>0 or coalesce(r.organic_revenue_usd,0)<>0 then 'revenue_proven'
         when coalesce(l.organic_enrolled_leads,0)>0 then 'enrollment_proven'
         when coalesce(l.organic_qualified_leads,0)>0 then 'qualified_demand'
         when coalesce(l.organic_leads,0)>0 then 'lead_demand'
         when coalesce(g.gsc_clicks,0)>=10 then 'traffic_without_leads'
         when coalesce(g.gsc_impressions,0)>0 then 'search_visibility_only'
         else 'no_observed_value'
       end as business_value_signal,
       least(100,
         (case when coalesce(r.organic_revenue_inr,0)<>0 or coalesce(r.organic_revenue_usd,0)<>0 then 35 else 0 end)
         + (case when coalesce(l.organic_enrolled_leads,0)>0 then 25
                 when coalesce(l.organic_qualified_leads,0)>0 then 18
                 when coalesce(l.organic_leads,0)>0 then 10 else 0 end)
         + least(15,coalesce(l.organic_leads,0)::integer*5)
         + (case when coalesce(l.organic_leads,0)>0 and coalesce(g.gsc_avg_position,0)>10 then 15
                 when coalesce(l.organic_leads,0)=0 and coalesce(g.gsc_clicks,0)>=50 then 12
                 when coalesce(l.organic_leads,0)=0 and coalesce(g.gsc_impressions,0)>=1000 then 8 else 0 end)
         + least(15,floor(coalesce(c.content_priority_score,0)::numeric/7)::integer)
       )::integer as revenue_priority_score_v1,
       case
         when coalesce(r.organic_revenue_inr,0)<>0 or coalesce(r.organic_revenue_usd,0)<>0 or coalesce(l.organic_enrolled_leads,0)>0 then 'protect_and_expand'
         when coalesce(l.organic_qualified_leads,0)>0 then 'scale_proven_page'
         when coalesce(l.organic_leads,0)>0 and coalesce(g.gsc_avg_position,0)>10 then 'scale_visibility'
         when coalesce(l.organic_leads,0)>0 then 'improve_lead_quality'
         when coalesce(g.gsc_clicks,0)>=50 then 'review_intent_and_conversion'
         when coalesce(g.gsc_impressions,0)>=1000 then 'review_search_intent'
         when coalesce(c.content_recommended_action,'monitor') not in ('monitor','crawl_page') then 'follow_content_action'
         else 'monitor'
       end as recommended_action,
       case
         when coalesce(r.organic_revenue_inr,0)<>0 or coalesce(r.organic_revenue_usd,0)<>0 or coalesce(l.organic_enrolled_leads,0)>0
           then 'This organic acquisition page has observed enrollment or paid-revenue evidence. Protect rankings, strengthen relevant coverage and expand only around closely related intent.'
         when coalesce(l.organic_qualified_leads,0)>0
           then 'This page has produced qualified organic demand. Prioritize visibility and content improvements around the proven landing-page intent.'
         when coalesce(l.organic_leads,0)>0 and coalesce(g.gsc_avg_position,0)>10
           then 'This page has produced organic leads while ranking outside the top 10 on average. Improving visibility may scale an already observed acquisition path.'
         when coalesce(l.organic_leads,0)>0
           then 'This page has produced organic leads, but no qualified or enrolled lead is observed in the current window. Preserve visibility and review lead quality before expanding aggressively.'
         when coalesce(g.gsc_clicks,0)>=50
           then 'This page receives meaningful organic clicks but has no first-touch organic leads in the current window. Review query intent, landing-page proposition and conversion path.'
         when coalesce(g.gsc_impressions,0)>=1000
           then 'This page has meaningful search visibility without an observed first-touch organic lead in the current window. Review whether the ranking queries match commercial intent.'
         when coalesce(c.content_recommended_action,'monitor') not in ('monitor','crawl_page')
           then 'No commercial signal is observed yet, but deterministic content intelligence already identifies a page-level improvement worth reviewing.'
         else 'No strong revenue-aware organic action is indicated in the current 30-day evidence window.'
       end as recommendation
from page_inventory p
join bounds b on b.organization_id=p.organization_id
left join gsc g on g.organization_id=p.organization_id
               and g.page_key=lower(regexp_replace(p.normalized_url,'/+$',''))
left join lead_metrics l on l.organization_id=p.organization_id and l.landing_key is not null
  and (l.landing_key=lower(regexp_replace(p.normalized_url,'/+$',''))
       or l.landing_key=lower(regexp_replace(p.url_path,'/+$','')))
left join revenue_metrics r on r.organization_id=p.organization_id and r.landing_key is not null
  and (r.landing_key=lower(regexp_replace(p.normalized_url,'/+$',''))
       or r.landing_key=lower(regexp_replace(p.url_path,'/+$','')))
left join content c on c.organization_id=p.organization_id and c.page_id=p.page_id;

revoke all on table public.v_seo_organic_value_page_30d from public, anon;
grant select on table public.v_seo_organic_value_page_30d to authenticated, service_role;

create or replace function public.get_seo_revenue_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  overview_payload jsonb;
  summary_payload jsonb;
  value_pages_payload jsonb;
  traffic_gaps_payload jsonb;
  priority_payload jsonb;
begin
  if p_organization_id is null then raise exception 'Organization ID is required'; end if;
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  select coalesce(to_jsonb(x),'{}'::jsonb) into overview_payload
  from (
    select range_start,range_end,clicks as organic_clicks,impressions as organic_impressions,
           organic_leads,organic_qualified_leads,organic_enrolled_leads,
           organic_revenue_inr,organic_revenue_usd
    from public.v_seo_30d_overview
    where organization_id=p_organization_id limit 1
  ) x;

  select jsonb_build_object(
    'pages_with_leads',count(*) filter(where organic_leads>0)::bigint,
    'pages_with_qualified_leads',count(*) filter(where organic_qualified_leads>0)::bigint,
    'pages_with_enrollments',count(*) filter(where organic_enrolled_leads>0)::bigint,
    'pages_with_revenue',count(*) filter(where organic_revenue_inr<>0 or organic_revenue_usd<>0)::bigint,
    'mapped_organic_leads',coalesce(sum(organic_leads),0)::bigint,
    'high_traffic_without_leads',count(*) filter(where gsc_clicks>=10 and organic_leads=0)::bigint,
    'commercial_signal_pages',count(*) filter(where business_value_signal in ('revenue_proven','enrollment_proven','qualified_demand','lead_demand'))::bigint
  ) into summary_payload
  from public.v_seo_organic_value_page_30d where organization_id=p_organization_id;

  summary_payload := coalesce(summary_payload,'{}'::jsonb) || jsonb_build_object(
    'unmapped_organic_leads',greatest(0,coalesce((overview_payload->>'organic_leads')::bigint,0)-coalesce((summary_payload->>'mapped_organic_leads')::bigint,0)),
    'landing_page_attribution_coverage',case when coalesce((overview_payload->>'organic_leads')::numeric,0)>0
      then round(coalesce((summary_payload->>'mapped_organic_leads')::numeric,0)/(overview_payload->>'organic_leads')::numeric*100,2)
      else 0::numeric end
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue_priority_score_v1 desc,x.organic_leads desc,x.gsc_clicks desc,x.normalized_url asc),'[]'::jsonb)
  into value_pages_payload
  from (
    select page_id,site_id,normalized_url,url_path,title,page_type,is_indexable,gsc_clicks,gsc_impressions,gsc_ctr,gsc_avg_position,
           organic_leads,organic_qualified_leads,organic_enrolled_leads,revenue_leads,organic_revenue_inr,organic_revenue_usd,
           click_to_lead_rate_directional,lead_to_qualified_rate,lead_to_enrolled_rate,business_value_signal,revenue_priority_score_v1,
           recommended_action,recommendation,content_recommended_action,content_priority_score
    from public.v_seo_organic_value_page_30d
    where organization_id=p_organization_id and (organic_leads>0 or organic_qualified_leads>0 or organic_enrolled_leads>0 or organic_revenue_inr<>0 or organic_revenue_usd<>0)
    order by revenue_priority_score_v1 desc,organic_leads desc,gsc_clicks desc limit 30
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.gsc_clicks desc,x.gsc_impressions desc,x.normalized_url asc),'[]'::jsonb)
  into traffic_gaps_payload
  from (
    select page_id,site_id,normalized_url,url_path,title,gsc_clicks,gsc_impressions,gsc_ctr,gsc_avg_position,business_value_signal,
           revenue_priority_score_v1,recommended_action,recommendation,content_recommended_action,content_priority_score
    from public.v_seo_organic_value_page_30d
    where organization_id=p_organization_id and gsc_clicks>=10 and organic_leads=0
    order by gsc_clicks desc,gsc_impressions desc limit 15
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.revenue_priority_score_v1 desc,x.gsc_clicks desc,x.normalized_url asc),'[]'::jsonb)
  into priority_payload
  from (
    select page_id,site_id,normalized_url,url_path,title,gsc_clicks,gsc_impressions,gsc_avg_position,organic_leads,
           organic_qualified_leads,organic_enrolled_leads,organic_revenue_inr,organic_revenue_usd,business_value_signal,
           revenue_priority_score_v1,recommended_action,recommendation,content_recommended_action,content_priority_score
    from public.v_seo_organic_value_page_30d
    where organization_id=p_organization_id and recommended_action<>'monitor'
    order by revenue_priority_score_v1 desc,gsc_clicks desc limit 30
  ) x;

  return jsonb_build_object(
    'overview',coalesce(overview_payload,'{}'::jsonb),
    'summary',coalesce(summary_payload,'{}'::jsonb),
    'value_pages',coalesce(value_pages_payload,'[]'::jsonb),
    'traffic_gaps',coalesce(traffic_gaps_payload,'[]'::jsonb),
    'priority_actions',coalesce(priority_payload,'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_seo_revenue_intelligence(uuid) from public, anon;
grant execute on function public.get_seo_revenue_intelligence(uuid) to authenticated, service_role;

comment on function public.get_seo_revenue_intelligence(uuid) is
'Tenant-scoped W6-OG5 deterministic organic business-value intelligence. Uses first-touch Google organic attribution, captured landing pages, Search Console, CRM stages and payment-window revenue. INR and USD remain separate and click-to-lead is explicitly directional.';
