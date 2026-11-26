-- Marketing › Website › "Visits and sources" and "Clicks and forms" (owner-approved
-- prototype "Website inner pages", 26 Nov 2026). Read-only, service role only.
-- Booking and payment events are summarised as counts and totals only: no names,
-- emails or phone numbers leave this function. Bookings for courses named "test"
-- (and the people who made them) are left out.
create or replace function public.marketing_website_detail_v1(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
  v_click_since timestamptz;
begin
  select min(occurred_at) into v_click_since from public.raw_events
  where organization_id = p_organization_id and source_event_type = 'web.pricing_viewed' and occurred_at >= now() - interval '30 days';

  with
  ev as (
    select source_event_type as t, session_key as s, occurred_at,
           regexp_replace(split_part(coalesce(context ->> 'page_path', payload ->> 'pagePath', '/'), '?', 1), '(.)/$', '\1') as path,
           lower(coalesce(payload ->> 'cta_label', payload ->> 'label', payload ->> 'text', payload ->> 'href', '')) as label
    from public.raw_events
    where organization_id = p_organization_id and source_system = 'website' and occurred_at >= now() - interval '30 days'
  ),
  bk as (
    select lower(btrim(payload ->> 'email')) as who, payload ->> 'course' as course,
           nullif(payload ->> 'booking_value', '')::numeric as value, upper(coalesce(payload ->> 'currency', 'INR')) as currency
    from public.raw_events
    where organization_id = p_organization_id and source_event_type = 'booking.completed' and occurred_at >= now() - interval '30 days'
      and coalesce(payload ->> 'email', '') <> ''
  ),
  testers as (select distinct who from bk where course ilike '%test%'),
  bookings as (select * from bk where who not in (select who from testers)),
  pay as (
    select lower(btrim(payload ->> 'email')) as who, lower(coalesce(payload ->> 'provider', 'other')) as provider
    from public.raw_events
    where organization_id = p_organization_id and source_event_type = 'payment.started' and occurred_at >= now() - interval '30 days'
      and coalesce(payload ->> 'email', '') <> ''
      and lower(btrim(payload ->> 'email')) not in (select who from testers)
  ),
  lp as (
    select regexp_replace(split_part(landing_page, '?', 1), '(.)/$', '\1') as path, sum(sessions) as visits
    from public.ga4_landing_page_daily
    where organization_id = p_organization_id and analytics_date >= current_date - 30
    group by 1
  ),
  ld as (
    select regexp_replace(split_part(regexp_replace(ws.landing_page, '^https?://[^/]+', ''), '?', 1), '(.)/$', '\1') as path,
           count(distinct ws.lead_id) as leads
    from public.web_sessions ws
    where ws.organization_id = p_organization_id and ws.lead_id is not null and ws.started_at >= now() - interval '30 days'
    group by 1
  )
  select jsonb_build_object(
    'visits', (select coalesce(sum(sessions), 0) from public.ga4_daily where organization_id = p_organization_id and analytics_date >= current_date - 30),
    'visitsBefore', (select coalesce(sum(sessions), 0) from public.ga4_daily where organization_id = p_organization_id and analytics_date between current_date - 60 and current_date - 31),
    'engaged', (select coalesce(sum(engaged_sessions), 0) from public.ga4_daily where organization_id = p_organization_id and analytics_date >= current_date - 30),
    'dataTo', (select max(analytics_date) from public.ga4_daily where organization_id = p_organization_id),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'visits', s, 'engaged', e) order by w) from (
        select date_trunc('week', analytics_date)::date as w, sum(sessions) as s, sum(engaged_sessions) as e
        from public.ga4_daily where organization_id = p_organization_id and analytics_date >= current_date - 70 group by 1) x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'medium', medium, 'visits', now_v, 'before', before_v)) from (
        select lower(coalesce(source, '(not set)')) as source, lower(coalesce(medium, '(not set)')) as medium,
               coalesce(sum(sessions) filter (where analytics_date >= current_date - 30), 0) as now_v,
               coalesce(sum(sessions) filter (where analytics_date < current_date - 30), 0) as before_v
        from public.ga4_source_medium_daily
        where organization_id = p_organization_id and analytics_date >= current_date - 60
        group by 1, 2 order by 3 desc limit 60) s), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'visits', now_v, 'before', before_v)) from (
        select country, coalesce(sum(sessions) filter (where analytics_date >= current_date - 30), 0) as now_v,
               coalesce(sum(sessions) filter (where analytics_date < current_date - 30), 0) as before_v
        from public.ga4_country_daily
        where organization_id = p_organization_id and analytics_date >= current_date - 60
        group by 1 order by 2 desc limit 12) c), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', lp.path, 'visits', lp.visits, 'leads', coalesce(ld.leads, 0))) from (
        select * from lp order by visits desc limit 40) lp left join ld on ld.path = lp.path), '[]'::jsonb),
    'webLeads', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'n', n)) from (
        select coalesce(nullif(lower(btrim(l.first_touch_source)), ''), 'unknown') as source, count(*) as n
        from public.leads l
        where l.organization_id = p_organization_id and l.lead_creation_channel::text = 'website'
          and l.created_at >= now() - interval '30 days'
          and not coalesce((l.metadata ->> 'test_lead')::boolean, false) and l.current_stage::text <> 'duplicate'
        group by 1) w), '[]'::jsonb),
    'tracked', jsonb_build_object(
        'sessions', (select count(distinct s) from ev where t = 'web.session_started'),
        'formStarted', (select count(distinct s) from ev where t = 'web.form_started'),
        'formSent', (select count(distinct s) from ev where t = 'web.form_submitted')),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'started', st, 'sent', sent) order by st desc) from (
        select path, count(distinct s) filter (where t = 'web.form_started') as st, count(distinct s) filter (where t = 'web.form_submitted') as sent
        from ev where t in ('web.form_started', 'web.form_submitted') group by 1
        having count(distinct s) filter (where t = 'web.form_started') >= 3 order by 2 desc limit 15) f), '[]'::jsonb),
    'bookings', jsonb_build_object(
        'people', (select count(distinct who) from bookings),
        'paymentStarted', (select count(distinct who) from pay),
        'bookedNoPayment', (select count(distinct who) from bookings where who not in (select who from pay)),
        'value', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'value', v)) from (
            select currency, sum(value) as v from (select distinct on (who, course) who, course, value, currency from bookings) d group by 1) x), '[]'::jsonb),
        'courses', coalesce((select jsonb_agg(jsonb_build_object('course', course, 'n', n) order by n desc) from (
            select course, count(distinct who) as n from bookings group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
        'providers', coalesce((select jsonb_agg(jsonb_build_object('provider', provider, 'n', n) order by n desc) from (
            select provider, count(distinct who) as n from pay group by 1) x), '[]'::jsonb)),
    'enrolled', (select count(*) from public.enrollments e where e.organization_id = p_organization_id and e.status::text <> 'cancelled' and e.created_at >= now() - interval '30 days'),
    'clicks', jsonb_build_object(
        'since', v_click_since,
        'sessions', (select count(distinct s) from ev where t = 'web.session_started' and occurred_at >= coalesce(v_click_since, now())),
        'pricing', (select count(distinct s) from ev where t = 'web.pricing_viewed'),
        'faq', (select count(distinct s) from ev where t = 'web.faq_expanded'),
        'brochure', (select count(distinct s) from ev where t = 'web.brochure_clicked'),
        'phone', (select count(*) from ev where t = 'web.cta_clicked' and (label ~ '^\+?[0-9 ()-]{8,}$' or label like 'tel:%' or label = 'call')),
        'whatsapp', (select count(*) from ev where t = 'web.cta_clicked' and label ~ 'whatsapp|wa\.me'),
        'email', (select count(*) from ev where t = 'web.cta_clicked' and (label like '%@%' or label like 'mailto:%'))),
    'generatedAt', now()
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.marketing_website_detail_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_website_detail_v1(uuid) to service_role;
