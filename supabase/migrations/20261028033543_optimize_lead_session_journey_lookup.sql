create or replace view public.v_lead_session_journey as
with base as (
  select
    ws.organization_id,
    ws.id as web_session_id,
    ws.lead_id,
    ws.anonymous_visitor_id,
    ws.session_key,
    ws.started_at,
    ws.ended_at,
    l.created_at as lead_created_at,
    l.current_stage,
    l.status as lead_status,
    coalesce(
      nullif(st.touch_source,''),
      nullif(ws.utm_source,''),
      case
        when coalesce(ws.referrer,'') ilike '%google.%' then 'google'
        when coalesce(ws.referrer,'') <> '' then 'referral'
        else 'direct'
      end
    ) as source,
    coalesce(
      nullif(st.touch_medium,''),
      nullif(ws.utm_medium,''),
      case
        when coalesce(ws.referrer,'') ilike '%google.%' then 'organic'
        when coalesce(ws.referrer,'') <> '' then 'referral'
        else 'none'
      end
    ) as medium,
    coalesce(nullif(st.touch_campaign,''),nullif(ws.utm_campaign,'')) as campaign,
    coalesce(nullif(ws.landing_page,''),nullif(st.first_touch_page,'')) as landing_page,
    st.last_touch_page,
    ws.referrer,
    ws.gclid,
    ws.gbraid,
    ws.wbraid,
    ws.fbclid,
    coalesce(st.event_count,0::bigint) as event_count,
    coalesce(st.page_views,0::bigint) as page_views,
    coalesce(st.intent_events,0::bigint) as intent_events,
    coalesce(st.high_intent_events,0::bigint) as high_intent_events,
    st.first_event_at,
    st.last_event_at
  from public.web_sessions ws
  join public.leads l
    on l.id=ws.lead_id
   and l.organization_id=ws.organization_id
  left join lateral (
    select
      min(t.occurred_at) as first_event_at,
      max(t.occurred_at) as last_event_at,
      count(*) as event_count,
      count(*) filter (where t.event_type='page_view') as page_views,
      count(*) filter (
        where t.event_type=any(array[
          'form_start','lead_form_submit','course_enquire_click','whatsapp_click',
          'reservation_start','payment_start','brochure_download'
        ])
      ) as intent_events,
      count(*) filter (
        where t.event_type=any(array[
          'lead_form_submit','course_enquire_click','whatsapp_click','reservation_start','payment_start'
        ])
      ) as high_intent_events,
      (array_agg(coalesce(nullif(t.source,''),nullif(t.utm_source,'')) order by t.occurred_at))[1] as touch_source,
      (array_agg(coalesce(nullif(t.medium,''),nullif(t.utm_medium,'')) order by t.occurred_at))[1] as touch_medium,
      (array_agg(coalesce(nullif(t.campaign_name,''),nullif(t.utm_campaign,'')) order by t.occurred_at))[1] as touch_campaign,
      (array_agg(nullif(t.landing_page,'') order by t.occurred_at))[1] as first_touch_page,
      (array_agg(nullif(t.landing_page,'') order by t.occurred_at desc))[1] as last_touch_page
    from public.touchpoints t
    where t.organization_id=ws.organization_id
      and t.web_session_id=ws.id
  ) st on true
  where ws.lead_id is not null
),
numbered as (
  select
    b.*,
    row_number() over (
      partition by b.organization_id,b.lead_id
      order by b.started_at,b.web_session_id
    )::integer as session_number,
    lag(b.started_at) over (
      partition by b.organization_id,b.lead_id
      order by b.started_at,b.web_session_id
    ) as previous_session_at
  from base b
)
select
  web_session_id,
  lead_id,
  anonymous_visitor_id,
  session_key,
  started_at,
  ended_at,
  lead_created_at,
  current_stage,
  lead_status,
  source,
  medium,
  campaign,
  landing_page,
  last_touch_page,
  referrer,
  gclid,
  gbraid,
  wbraid,
  fbclid,
  event_count,
  page_views,
  intent_events,
  high_intent_events,
  first_event_at,
  last_event_at,
  session_number,
  previous_session_at,
  case
    when started_at < lead_created_at then 'before_lead'::text
    when started_at >= lead_created_at then 'after_lead'::text
    else 'unknown'::text
  end as journey_phase,
  case
    when previous_session_at is null then null::numeric
    else round(extract(epoch from(started_at-previous_session_at))/86400.0,2)
  end as days_since_previous_session,
  organization_id
from numbered;
