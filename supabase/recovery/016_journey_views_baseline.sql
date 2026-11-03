-- SalsysOS cold-recovery compatibility bootstrap for the historical 016 boundary.
--
-- Purpose:
--   Migration 016_journey_workspace_hardening.sql expects
--   public.v_lead_session_journey and public.v_lead_journey_intelligence to
--   already exist. Neither view is created by the recorded migration chain
--   through 015. Their base dependencies are limited to public.leads,
--   public.web_sessions and public.touchpoints, whose required columns exist
--   by migrations 001/003/007.
--
-- This file is NOT part of the normal production migration ledger. It is only
-- for isolated cold rebuilds after migrations 001-015 and before migration 016.
-- It deliberately adds no grants, application data, triggers, or base-table DDL.

begin;

create or replace view public.v_lead_session_journey
with (security_invoker = true)
as
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
      nullif(st.touch_source, ''),
      nullif(ws.utm_source, ''),
      case
        when coalesce(ws.referrer, '') ilike '%google.%' then 'google'
        when coalesce(ws.referrer, '') <> '' then 'referral'
        else 'direct'
      end
    ) as source,
    coalesce(
      nullif(st.touch_medium, ''),
      nullif(ws.utm_medium, ''),
      case
        when coalesce(ws.referrer, '') ilike '%google.%' then 'organic'
        when coalesce(ws.referrer, '') <> '' then 'referral'
        else 'none'
      end
    ) as medium,
    coalesce(nullif(st.touch_campaign, ''), nullif(ws.utm_campaign, '')) as campaign,
    coalesce(nullif(ws.landing_page, ''), nullif(st.first_touch_page, '')) as landing_page,
    st.last_touch_page,
    ws.referrer,
    ws.gclid,
    ws.gbraid,
    ws.wbraid,
    ws.fbclid,
    coalesce(st.event_count, 0::bigint) as event_count,
    coalesce(st.page_views, 0::bigint) as page_views,
    coalesce(st.intent_events, 0::bigint) as intent_events,
    coalesce(st.high_intent_events, 0::bigint) as high_intent_events,
    st.first_event_at,
    st.last_event_at
  from public.web_sessions ws
  join public.leads l
    on l.id = ws.lead_id
   and l.organization_id = ws.organization_id
  left join lateral (
    select
      min(t.occurred_at) as first_event_at,
      max(t.occurred_at) as last_event_at,
      count(*) as event_count,
      count(*) filter (where t.event_type = 'page_view') as page_views,
      count(*) filter (
        where t.event_type = any(array[
          'form_start','lead_form_submit','course_enquire_click','whatsapp_click',
          'reservation_start','payment_start','brochure_download'
        ])
      ) as intent_events,
      count(*) filter (
        where t.event_type = any(array[
          'lead_form_submit','course_enquire_click','whatsapp_click','reservation_start','payment_start'
        ])
      ) as high_intent_events,
      (array_agg(coalesce(nullif(t.source, ''), nullif(t.utm_source, '')) order by t.occurred_at))[1] as touch_source,
      (array_agg(coalesce(nullif(t.medium, ''), nullif(t.utm_medium, '')) order by t.occurred_at))[1] as touch_medium,
      (array_agg(coalesce(nullif(t.campaign_name, ''), nullif(t.utm_campaign, '')) order by t.occurred_at))[1] as touch_campaign,
      (array_agg(nullif(t.landing_page, '') order by t.occurred_at))[1] as first_touch_page,
      (array_agg(nullif(t.landing_page, '') order by t.occurred_at desc))[1] as last_touch_page
    from public.touchpoints t
    where t.organization_id = ws.organization_id
      and t.web_session_id = ws.id
  ) st on true
  where ws.lead_id is not null
),
numbered as (
  select
    b.*,
    row_number() over (
      partition by b.organization_id, b.lead_id
      order by b.started_at, b.web_session_id
    )::integer as session_number,
    lag(b.started_at) over (
      partition by b.organization_id, b.lead_id
      order by b.started_at, b.web_session_id
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
    else round(extract(epoch from (started_at - previous_session_at)) / 86400.0, 2)
  end as days_since_previous_session,
  organization_id
from numbered;

create or replace view public.v_lead_journey_intelligence
with (security_invoker = true)
as
with session_rollup as (
  select
    l.organization_id,
    l.id as lead_id,
    count(s.web_session_id) as total_sessions,
    count(s.web_session_id) filter (where s.started_at < l.created_at) as sessions_before_lead,
    count(s.web_session_id) filter (where s.started_at >= l.created_at) as sessions_after_lead,
    count(s.web_session_id) filter (where s.started_at >= now() - interval '24 hours') as sessions_24h,
    count(s.web_session_id) filter (where s.started_at >= now() - interval '7 days') as sessions_7d,
    count(s.web_session_id) filter (where s.started_at >= now() - interval '30 days') as sessions_30d,
    min(s.started_at) as first_visit_at,
    max(s.started_at) as last_visit_at,
    max(s.started_at) filter (where s.started_at < l.created_at) as last_visit_before_lead_at,
    min(s.started_at) filter (where s.started_at >= l.created_at) as first_visit_after_lead_at,
    max(s.started_at) filter (where s.started_at >= l.created_at) as last_visit_after_lead_at,
    sum(s.page_views)::bigint as total_page_views,
    sum(s.page_views) filter (where s.started_at < l.created_at)::bigint as page_views_before_lead,
    sum(s.page_views) filter (where s.started_at >= l.created_at)::bigint as page_views_after_lead,
    sum(s.page_views) filter (where s.started_at >= now() - interval '7 days')::bigint as page_views_7d,
    sum(s.high_intent_events)::bigint as total_high_intent_events,
    sum(s.high_intent_events) filter (where s.started_at >= now() - interval '7 days')::bigint as high_intent_events_7d,
    max(s.session_number) filter (where s.started_at <= l.created_at) as conversion_visit_number
  from public.leads l
  left join public.v_lead_session_journey s
    on s.lead_id = l.id
   and s.organization_id = l.organization_id
  group by l.organization_id, l.id
),
last_session as (
  select distinct on (s.organization_id, s.lead_id)
    s.organization_id,
    s.lead_id,
    s.web_session_id,
    s.started_at as last_session_at,
    s.session_number as last_session_number,
    s.source as last_session_source,
    s.medium as last_session_medium,
    s.campaign as last_session_campaign,
    s.landing_page as last_session_landing_page,
    s.last_touch_page as last_session_last_page,
    s.page_views as last_session_page_views,
    s.high_intent_events as last_session_high_intent_events,
    s.previous_session_at,
    s.days_since_previous_session
  from public.v_lead_session_journey s
  order by s.organization_id, s.lead_id, s.started_at desc, s.web_session_id desc
),
first_session as (
  select distinct on (s.organization_id, s.lead_id)
    s.organization_id,
    s.lead_id,
    s.started_at as first_session_at,
    s.source as first_session_source,
    s.medium as first_session_medium,
    s.campaign as first_session_campaign,
    s.landing_page as first_session_landing_page
  from public.v_lead_session_journey s
  order by s.organization_id, s.lead_id, s.started_at, s.web_session_id
),
event_rollup as (
  select
    l.organization_id,
    l.id as lead_id,
    count(t.id) filter (
      where t.lead_id = l.id
        and t.occurred_at >= now() - interval '7 days'
        and t.event_type = 'whatsapp_click'
    ) as whatsapp_clicks_7d,
    count(t.id) filter (
      where t.lead_id = l.id
        and t.occurred_at >= now() - interval '7 days'
        and t.event_type = 'reservation_start'
    ) as reservation_starts_7d,
    count(t.id) filter (
      where t.lead_id = l.id
        and t.occurred_at >= now() - interval '7 days'
        and t.event_type = 'payment_start'
    ) as payment_starts_7d,
    count(t.id) filter (
      where t.lead_id = l.id
        and t.occurred_at >= now() - interval '7 days'
        and t.event_type = 'course_enquire_click'
    ) as enquiry_clicks_7d,
    count(t.id) filter (
      where t.lead_id = l.id
        and t.occurred_at >= now() - interval '7 days'
        and t.event_type = 'brochure_download'
    ) as brochure_downloads_7d
  from public.leads l
  left join public.touchpoints t
    on t.lead_id = l.id
   and t.organization_id = l.organization_id
  group by l.organization_id, l.id
),
raw as (
  select
    l.organization_id,
    l.id as lead_id,
    l.lead_code,
    coalesce(
      l.display_name,
      trim(concat_ws(' ', l.first_name, l.last_name)),
      l.lead_code
    ) as lead_name,
    l.current_stage,
    l.status as lead_status,
    l.intent,
    l.created_at as lead_created_at,
    l.last_contacted_at,
    l.last_inbound_at,
    l.last_outbound_at,
    l.next_followup_at,
    coalesce(sr.total_sessions, 0::bigint) as total_sessions,
    coalesce(sr.sessions_before_lead, 0::bigint) as sessions_before_lead,
    coalesce(sr.sessions_after_lead, 0::bigint) as sessions_after_lead,
    coalesce(sr.sessions_24h, 0::bigint) as sessions_24h,
    coalesce(sr.sessions_7d, 0::bigint) as sessions_7d,
    coalesce(sr.sessions_30d, 0::bigint) as sessions_30d,
    sr.first_visit_at,
    sr.last_visit_at,
    sr.last_visit_before_lead_at,
    sr.first_visit_after_lead_at,
    sr.last_visit_after_lead_at,
    coalesce(sr.total_page_views, 0::bigint) as total_page_views,
    coalesce(sr.page_views_before_lead, 0::bigint) as page_views_before_lead,
    coalesce(sr.page_views_after_lead, 0::bigint) as page_views_after_lead,
    coalesce(sr.page_views_7d, 0::bigint) as page_views_7d,
    coalesce(sr.total_high_intent_events, 0::bigint) as total_high_intent_events,
    coalesce(sr.high_intent_events_7d, 0::bigint) as high_intent_events_7d,
    sr.conversion_visit_number,
    fs.first_session_source,
    fs.first_session_medium,
    fs.first_session_campaign,
    fs.first_session_landing_page,
    ls.last_session_at,
    ls.last_session_number,
    ls.last_session_source,
    ls.last_session_medium,
    ls.last_session_campaign,
    ls.last_session_landing_page,
    ls.last_session_last_page,
    ls.last_session_page_views,
    ls.last_session_high_intent_events,
    ls.previous_session_at,
    ls.days_since_previous_session,
    coalesce(er.whatsapp_clicks_7d, 0::bigint) as whatsapp_clicks_7d,
    coalesce(er.reservation_starts_7d, 0::bigint) as reservation_starts_7d,
    coalesce(er.payment_starts_7d, 0::bigint) as payment_starts_7d,
    coalesce(er.enquiry_clicks_7d, 0::bigint) as enquiry_clicks_7d,
    coalesce(er.brochure_downloads_7d, 0::bigint) as brochure_downloads_7d,
    case
      when sr.first_visit_at is null then null::numeric
      else round(extract(epoch from (l.created_at - sr.first_visit_at)) / 86400.0, 2)
    end as days_first_visit_to_lead,
    case
      when sr.last_visit_at is null then null::numeric
      else round(extract(epoch from (now() - sr.last_visit_at)) / 86400.0, 2)
    end as days_since_last_visit
  from public.leads l
  left join session_rollup sr
    on sr.lead_id = l.id
   and sr.organization_id = l.organization_id
  left join last_session ls
    on ls.lead_id = l.id
   and ls.organization_id = l.organization_id
  left join first_session fs
    on fs.lead_id = l.id
   and fs.organization_id = l.organization_id
  left join event_rollup er
    on er.lead_id = l.id
   and er.organization_id = l.organization_id
),
scored as (
  select
    r.*,
    least(
      100::bigint,
      least(r.sessions_7d * 10, 30::bigint)
      + least(r.page_views_7d * 2, 20::bigint)
      + least(r.high_intent_events_7d * 15, 30::bigint)
      + case
          when r.last_visit_at >= now() - interval '24 hours' then 15
          when r.last_visit_at >= now() - interval '3 days' then 8
          else 0
        end
      + case when r.sessions_after_lead > 0 then 5 else 0 end
    )::integer as engagement_score
  from raw r
)
select
  lead_id,
  lead_code,
  lead_name,
  current_stage,
  lead_status,
  intent,
  lead_created_at,
  last_contacted_at,
  last_inbound_at,
  last_outbound_at,
  next_followup_at,
  total_sessions,
  sessions_before_lead,
  sessions_after_lead,
  sessions_24h,
  sessions_7d,
  sessions_30d,
  first_visit_at,
  last_visit_at,
  last_visit_before_lead_at,
  first_visit_after_lead_at,
  last_visit_after_lead_at,
  total_page_views,
  page_views_before_lead,
  page_views_after_lead,
  page_views_7d,
  total_high_intent_events,
  high_intent_events_7d,
  conversion_visit_number,
  first_session_source,
  first_session_medium,
  first_session_campaign,
  first_session_landing_page,
  last_session_at,
  last_session_number,
  last_session_source,
  last_session_medium,
  last_session_campaign,
  last_session_landing_page,
  last_session_last_page,
  last_session_page_views,
  last_session_high_intent_events,
  previous_session_at,
  days_since_previous_session,
  whatsapp_clicks_7d,
  reservation_starts_7d,
  payment_starts_7d,
  enquiry_clicks_7d,
  brochure_downloads_7d,
  days_first_visit_to_lead,
  days_since_last_visit,
  engagement_score,
  case
    when total_sessions = 0 then false
    when sessions_before_lead >= 2 then true
    else false
  end as was_returning_visitor_before_lead,
  case
    when sessions_after_lead > 0 then true
    else false
  end as has_returned_after_becoming_lead,
  case
    when last_visit_after_lead_at >= now() - interval '7 days'
      and (
        current_stage = any(array[
          'nurture'::public.lead_stage,
          'not_now'::public.lead_stage,
          'lost'::public.lead_stage
        ])
        or coalesce(days_since_previous_session, 0::numeric) >= 14::numeric
      ) then true
    else false
  end as is_reengaged,
  case
    when current_stage = any(array[
      'enrolled'::public.lead_stage,
      'unqualified'::public.lead_stage,
      'duplicate'::public.lead_stage
    ]) and engagement_score < 30 then 'closed'::text
    when current_stage = 'lost'::public.lead_stage and engagement_score < 30 then 'closed'::text
    when engagement_score >= 60 then 'hot'::text
    when engagement_score >= 30 then 'warm'::text
    else 'cold'::text
  end as behaviour_temperature,
  case
    when last_visit_at is null then 'No linked website activity'::text
    when payment_starts_7d > 0 then 'Payment activity'::text
    when reservation_starts_7d > 0 then 'Reservation activity'::text
    when whatsapp_clicks_7d > 0 then 'WhatsApp activity'::text
    when enquiry_clicks_7d > 0 then 'Enquiry activity'::text
    when sessions_7d >= 3 then 'Frequent repeat visits'::text
    when sessions_7d >= 1 then 'Recently active'::text
    else 'Inactive recently'::text
  end as behaviour_reason,
  organization_id
from scored;

commit;
