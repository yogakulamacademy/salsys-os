alter function public.get_analytics_workspace(uuid) rename to get_analytics_workspace_internal_v1;
revoke all on function public.get_analytics_workspace_internal_v1(uuid) from public;
revoke all on function public.get_analytics_workspace_internal_v1(uuid) from anon;
revoke all on function public.get_analytics_workspace_internal_v1(uuid) from authenticated;
revoke all on function public.get_analytics_workspace_internal_v1(uuid) from service_role;

create or replace function public.get_analytics_workspace_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_payload jsonb;
  v_overview jsonb;
  v_reconciliation jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  v_payload := public.get_analytics_workspace_internal_v1(p_organization_id);

  with bounds as (
    select max(g.analytics_date) as end_date,
           max(g.analytics_date) - 29 as start_date
    from public.ga4_daily g
    where g.organization_id = p_organization_id
  ),
  accessible_leads as materialized (
    select l.id,l.created_at,l.current_stage,l.lead_origin,l.lead_creation_channel
    from public.leads l
    where l.organization_id = p_organization_id
      and public.can_access_lead(l.id)
  ),
  visible_sessions as materialized (
    select ws.*
    from public.web_sessions ws
    where ws.organization_id = p_organization_id
      and public.is_crm_user()
      and (
        ws.lead_id is null
        or exists (
          select 1
          from public.leads l
          where l.id = ws.lead_id
            and l.organization_id = ws.organization_id
        )
      )
  ),
  visible_touchpoints as materialized (
    select t.*
    from public.touchpoints t
    join accessible_leads al on al.id = t.lead_id
    where t.organization_id = p_organization_id
  ),
  ga4 as (
    select
      coalesce(sum(g.sessions),0::numeric) as sessions,
      coalesce(sum(g.page_views),0::numeric) as page_views,
      coalesce(sum(g.new_users),0::numeric) as new_users,
      coalesce(avg(g.total_users),0::numeric) as avg_daily_users,
      coalesce(sum(g.engaged_sessions),0::numeric) as engaged_sessions,
      case when sum(g.sessions) > 0 then sum(g.engaged_sessions) / sum(g.sessions) else 0::numeric end as engagement_rate,
      case when sum(g.sessions) > 0 then sum(g.average_session_duration * g.sessions::numeric) / sum(g.sessions) else 0::numeric end as avg_session_duration,
      coalesce(sum(g.key_events),0::numeric) as key_events
    from public.ga4_daily g
    cross join bounds b
    where g.organization_id = p_organization_id
      and g.analytics_date between b.start_date and b.end_date
  ),
  crm_sessions as (
    select count(ws.id) as sessions,
           count(distinct ws.anonymous_visitor_id) as visitors
    from visible_sessions ws
    cross join bounds b
    where ((ws.started_at at time zone 'Asia/Kolkata')::date between b.start_date and b.end_date)
  ),
  crm_events as (
    select count(t.id) filter (where t.event_type = 'page_view') as page_views,
           count(t.id) filter (where t.event_type = 'lead_form_submit') as form_submits
    from visible_touchpoints t
    cross join bounds b
    where ((t.occurred_at at time zone 'Asia/Kolkata')::date between b.start_date and b.end_date)
  ),
  crm_leads as (
    select count(al.id) as web_leads,
           count(al.id) filter (
             where al.current_stage = any(array[
               'qualified'::public.lead_stage,
               'high_intent'::public.lead_stage,
               'payment_pending'::public.lead_stage,
               'enrolled'::public.lead_stage
             ])
           ) as qualified_leads,
           count(al.id) filter (where al.current_stage = 'enrolled'::public.lead_stage) as enrolled_leads
    from accessible_leads al
    cross join bounds b
    where ((al.created_at at time zone 'Asia/Kolkata')::date between b.start_date and b.end_date)
      and (
        al.lead_origin = 'website'
        or al.lead_creation_channel = 'website'::public.contact_channel
      )
  )
  select to_jsonb(x)
  into v_overview
  from (
    select
      b.start_date as range_start,
      b.end_date as range_end,
      g.sessions as ga4_sessions,
      g.page_views as ga4_page_views,
      g.new_users as ga4_new_users,
      round(g.avg_daily_users,2) as ga4_avg_daily_users,
      g.engaged_sessions as ga4_engaged_sessions,
      round(g.engagement_rate,6) as ga4_engagement_rate,
      round(g.avg_session_duration,2) as ga4_avg_session_duration,
      g.key_events as ga4_key_events,
      cs.sessions as crm_sessions,
      cs.visitors as crm_visitors,
      ce.page_views as crm_page_views,
      ce.form_submits as crm_form_submits,
      cl.web_leads as crm_web_leads,
      cl.qualified_leads as crm_qualified_leads,
      cl.enrolled_leads as crm_enrolled_leads,
      case
        when cs.sessions > 0 then round((cl.web_leads::numeric / cs.sessions::numeric) * 100,2)
        else 0::numeric
      end as website_lead_conversion_rate
    from bounds b
    cross join ga4 g
    cross join crm_sessions cs
    cross join crm_events ce
    cross join crm_leads cl
  ) x;

  with bounds as (
    select max(g.analytics_date) as end_date,
           max(g.analytics_date) - 29 as start_date
    from public.ga4_daily g
    where g.organization_id = p_organization_id
  ),
  accessible_leads as materialized (
    select l.id,l.created_at,l.lead_origin,l.lead_creation_channel
    from public.leads l
    where l.organization_id = p_organization_id
      and public.can_access_lead(l.id)
  ),
  visible_sessions as materialized (
    select ws.*
    from public.web_sessions ws
    where ws.organization_id = p_organization_id
      and public.is_crm_user()
      and (
        ws.lead_id is null
        or exists (
          select 1
          from public.leads l
          where l.id = ws.lead_id
            and l.organization_id = ws.organization_id
        )
      )
  ),
  visible_touchpoints as materialized (
    select t.*
    from public.touchpoints t
    join accessible_leads al on al.id = t.lead_id
    where t.organization_id = p_organization_id
  ),
  crm_sessions as (
    select ((ws.started_at at time zone 'Asia/Kolkata')::date) as analytics_date,
           count(*) as sessions,
           count(distinct ws.anonymous_visitor_id) as visitors
    from visible_sessions ws
    group by 1
  ),
  crm_events as (
    select ((t.occurred_at at time zone 'Asia/Kolkata')::date) as analytics_date,
           count(*) filter (where t.event_type = 'page_view') as page_views,
           count(*) filter (where t.event_type = 'lead_form_submit') as form_submits
    from visible_touchpoints t
    group by 1
  ),
  crm_leads as (
    select ((al.created_at at time zone 'Asia/Kolkata')::date) as analytics_date,
           count(*) as web_leads
    from accessible_leads al
    where al.lead_origin = 'website'
       or al.lead_creation_channel = 'website'::public.contact_channel
    group by 1
  ),
  rows as (
    select
      g.analytics_date,
      g.sessions as ga4_sessions,
      coalesce(cs.sessions,0::bigint) as crm_sessions,
      g.page_views as ga4_page_views,
      coalesce(ce.page_views,0::bigint) as crm_page_views,
      coalesce(cs.visitors,0::bigint) as crm_visitors,
      coalesce(ce.form_submits,0::bigint) as crm_form_submits,
      coalesce(cl.web_leads,0::bigint) as crm_web_leads
    from public.ga4_daily g
    cross join bounds b
    left join crm_sessions cs on cs.analytics_date = g.analytics_date
    left join crm_events ce on ce.analytics_date = g.analytics_date
    left join crm_leads cl on cl.analytics_date = g.analytics_date
    where g.organization_id = p_organization_id
      and g.analytics_date between b.start_date and b.end_date
    order by g.analytics_date desc
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.analytics_date desc),'[]'::jsonb)
  into v_reconciliation
  from rows r;

  v_payload := jsonb_set(v_payload,'{overview}',coalesce(v_overview,'{}'::jsonb),true);
  v_payload := jsonb_set(v_payload,'{reconciliation}',coalesce(v_reconciliation,'[]'::jsonb),true);

  return v_payload;
end;
$fn$;

revoke all on function public.get_analytics_workspace_v2(uuid) from public;
revoke all on function public.get_analytics_workspace_v2(uuid) from anon;
grant execute on function public.get_analytics_workspace_v2(uuid) to authenticated;
grant execute on function public.get_analytics_workspace_v2(uuid) to service_role;

create or replace function public.get_analytics_workspace(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $fn$
begin
  return public.get_analytics_workspace_v2(p_organization_id);
end;
$fn$;

revoke all on function public.get_analytics_workspace(uuid) from public;
revoke all on function public.get_analytics_workspace(uuid) from anon;
grant execute on function public.get_analytics_workspace(uuid) to authenticated;
grant execute on function public.get_analytics_workspace(uuid) to service_role;
