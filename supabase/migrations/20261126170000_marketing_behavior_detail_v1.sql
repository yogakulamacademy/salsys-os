-- Marketing › Website › "Clicks and forms": how people move between pages and
-- what they do on each page (owner-approved 26 Nov 2026; replaces the open
-- behaviour explorer, which stays reachable with ?classic=1).
-- Read-only; service_role only. Only page paths seen from 3+ visitors leave it.

create or replace function public.marketing_behavior_detail_v1(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_since timestamptz := now() - interval '30 days';
  v_out jsonb;
begin
  with
  ev as (
    select r.session_key, r.anonymous_visitor_id as visitor, r.occurred_at, r.source_event_type as e,
           regexp_replace(coalesce(nullif(r.payload ->> 'pagePath', ''), '/'), '[?#].*$', '') as path,
           lower(coalesce(r.payload ->> 'cta_kind', '')) as kind
    from public.raw_events r
    where r.organization_id = p_organization_id and r.source_system = 'website' and r.occurred_at >= v_since
      and r.session_key is not null
  ),
  ok_paths as (
    select path from ev where e = 'web.page_viewed' and path !~* '/test([._/-]|$)'
    group by path having count(distinct visitor) >= 3
  ),
  views as (select session_key, visitor, occurred_at, path from ev where e = 'web.page_viewed'),
  steps as (
    select session_key, visitor, path,
           lag(path) over (partition by session_key order by occurred_at) as prev
    from views
  ),
  moves as (
    select prev as from_path, path as to_path, count(*) as n, count(distinct session_key) as sessions, count(distinct visitor) as visitors
    from steps
    where prev is not null and prev <> path
      and prev in (select path from ok_paths) and path in (select path from ok_paths)
    group by 1, 2
  ),
  per_page as (
    select path,
      count(distinct session_key) filter (where e = 'web.page_viewed') as visits,
      count(distinct session_key) filter (where e = 'web.pricing_viewed' or (e = 'web.cta_clicked' and kind in ('fees', 'pricing', 'price'))) as price,
      count(distinct session_key) filter (where e = 'web.form_started') as form_started,
      count(distinct session_key) filter (where e = 'web.form_submitted') as form_sent,
      count(distinct session_key) filter (where e = 'web.cta_clicked' and kind in ('whatsapp', 'phone', 'call', 'email', 'contact')) as contact,
      count(distinct session_key) filter (where e = 'web.cta_clicked' and kind = 'dates') as dates,
      count(distinct session_key) filter (where e = 'web.cta_clicked' and kind in ('enrol', 'enroll', 'pay', 'book')) as enrol,
      count(distinct session_key) filter (where e = 'web.brochure_clicked' or (e = 'web.cta_clicked' and kind = 'brochure')) as brochure,
      count(distinct session_key) filter (where e = 'web.faq_expanded') as faq,
      count(distinct session_key) filter (where e = 'web.media_interacted') as media
    from ev
    where path in (select path from ok_paths)
    group by 1
  ),
  -- Visits that left from this page (their last page view was here).
  exits as (
    select path, count(*) as n from (
      select distinct on (session_key) session_key, path from views order by session_key, occurred_at desc
    ) last_view where path in (select path from ok_paths) group by 1
  )
  select jsonb_build_object(
    'days', 30,
    'visits', (select count(distinct session_key) from views),
    'multiPage', (select count(*) from (select session_key from views group by 1 having count(distinct path) >= 2) m),
    'moves', coalesce((select jsonb_agg(jsonb_build_object('from', from_path, 'to', to_path, 'n', n, 'sessions', sessions) order by sessions desc, n desc)
      from (select * from moves where visitors >= 3 order by sessions desc, n desc limit 40) t), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'visits', p.visits, 'price', p.price, 'formStarted', p.form_started,
        'formSent', p.form_sent, 'contact', p.contact, 'dates', p.dates, 'enrol', p.enrol, 'brochure', p.brochure, 'faq', p.faq, 'media', p.media, 'exits', coalesce(x.n, 0)) order by p.visits desc)
      from (select * from per_page where visits >= 5 order by visits desc limit 40) p left join exits x on x.path = p.path), '[]'::jsonb),
    'generatedAt', now()
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.marketing_behavior_detail_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_behavior_detail_v1(uuid) to service_role;
