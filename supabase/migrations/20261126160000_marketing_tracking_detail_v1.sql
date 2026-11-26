-- Marketing › Tracking check › "Connections and data" and "Forms and links"
-- (owner-approved prototype "Tracking check inner pages", 26 Nov 2026).
-- Read-only; service_role only. No names, emails or phone numbers leave it.

create or replace function public.marketing_tracking_detail_v1(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - interval '30 days';
  v_test text := '/test([._/-]|$)';
  v_out jsonb;
begin
  with
  sends as (
    select r.session_key, r.anonymous_visitor_id as visitor,
           coalesce(nullif(r.payload ->> 'pagePath', ''), nullif(r.payload ->> 'page_path', ''), '/') as path,
           coalesce(nullif(r.payload ->> 'form_id', ''), 'unnamed') as form_id
    from public.raw_events r
    where r.organization_id = p_organization_id and r.source_event_type = 'web.form_submitted' and r.occurred_at >= v_since
  ),
  real_sends as (
    select s.*, ws.lead_id is not null as session_lead,
           exists (select 1 from public.web_sessions w2 where w2.organization_id = p_organization_id
                   and w2.anonymous_visitor_id = s.visitor and s.visitor is not null and w2.lead_id is not null) as visitor_lead
    from sends s
    left join public.web_sessions ws on ws.organization_id = p_organization_id and ws.session_key = s.session_key
    where s.path !~* v_test
  ),
  judged as (select *, not (session_lead or visitor_lead) as missed from real_sends)
  select jsonb_build_object(
    'base', public.marketing_tracking_v1(p_organization_id),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'events', n, 'forms', f) order by d) from (
        select (r.occurred_at at time zone 'Asia/Kolkata')::date as d, count(*) as n,
               count(*) filter (where r.source_event_type = 'web.form_submitted') as f
        from public.raw_events r
        where r.organization_id = p_organization_id and r.source_system = 'website'
          and r.occurred_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' - interval '14 days'
        group by 1) x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'type', source_type, 'status', status, 'lastAt', last_seen_at,
        'accepted', accepted_event_count, 'rejected', rejected_event_count) order by name)
      from public.tracking_sources where organization_id = p_organization_id and status <> 'revoked'), '[]'::jsonb),
    'counts', jsonb_build_object(
      'formSends', (select count(*) from sends),
      'bookings', (select count(*) from public.raw_events where organization_id = p_organization_id and source_event_type = 'booking.completed' and occurred_at >= v_since),
      'payments', (select count(*) from public.raw_events where organization_id = p_organization_id and source_event_type = 'payment.started' and occurred_at >= v_since),
      'lastBookingAt', (select max(occurred_at) from public.raw_events where organization_id = p_organization_id and source_system = 'website_backend'),
      'leadsByChannel', coalesce((select jsonb_object_agg(ch, n) from (select lead_creation_channel::text as ch, count(*) as n from public.leads
          where organization_id = p_organization_id and created_at >= v_since and not coalesce((metadata ->> 'test_lead')::boolean, false) group by 1) c), '{}'::jsonb)),
    'forms', jsonb_build_object(
      'sends', (select count(*) from judged),
      'visits', (select count(distinct session_key) from judged),
      'missedVisits', (select count(distinct session_key) from judged where missed),
      'byForm', coalesce((select jsonb_agg(jsonb_build_object('form', form_id, 'sends', n, 'missed', m) order by n desc) from (
          select form_id, count(*) as n, count(*) filter (where missed) as m from judged group by 1) f), '[]'::jsonb),
      'missedPages', coalesce((select jsonb_agg(jsonb_build_object('form', form_id, 'path', path, 'n', n) order by n desc) from (
          select form_id, path, count(*) as n from judged where missed group by 1, 2) p), '[]'::jsonb),
      'missedDays', coalesce((select jsonb_agg(jsonb_build_object('form', form_id, 'day', d, 'n', n) order by n desc) from (
          select j.form_id, (r.occurred_at at time zone 'Asia/Kolkata')::date as d, count(*) as n
          from judged j join public.raw_events r on r.organization_id = p_organization_id and r.session_key = j.session_key and r.source_event_type = 'web.form_submitted'
          where j.missed group by 1, 2 having count(*) >= 2) md), '[]'::jsonb),
      'test', coalesce((select jsonb_build_object('path', path, 'sends', n) from (
          select path, count(*) as n from sends where path ~* v_test group by 1 order by 2 desc limit 1) t), 'null'::jsonb)),
    'webLeadSources', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'n', n) order by n desc) from (
        select coalesce(nullif(btrim(first_touch_source), ''), 'unknown') as s, count(*) as n from public.leads
        where organization_id = p_organization_id and lead_creation_channel::text = 'website' and created_at >= v_since
          and not coalesce((metadata ->> 'test_lead')::boolean, false)
        group by 1) w), '[]'::jsonb),
    'links', (select jsonb_build_object('made', count(*), 'sent', count(*) filter (where sent_at is not null),
        'opened', count(*) filter (where sent_at is not null and first_opened_at is not null), 'opens', coalesce(sum(open_count) filter (where sent_at is not null), 0),
        'since', min(created_at))
      from public.dm_tracked_links where organization_id = p_organization_id),
    'generatedAt', now()
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.marketing_tracking_detail_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_tracking_detail_v1(uuid) to service_role;
