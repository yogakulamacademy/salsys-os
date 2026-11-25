-- Enrolment intelligence for the Personas page (25 Nov 2026).
-- Read-only: one JSON summary per business of who reaches payment, how they
-- got there, which signals predict it, which ads bring people who move
-- forward, and how complete each data layer is. Called only by the server
-- (service role) after it has checked the signed-in user's business.

create or replace function public.enrolment_intelligence_v1(p_organization_id uuid, p_days integer default 60)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
win as (select now() - make_interval(days => greatest(14, least(coalesce(p_days, 60), 365))) as since),
hist as (
  select h.lead_id, array_agg(distinct h.to_stage::text) as stages
  from public.lead_stage_history h
  join public.leads l on l.id = h.lead_id and l.organization_id = p_organization_id
  group by h.lead_id
),
people as (
  select l.id, l.created_at, l.current_stage::text as stage,
         coalesce(hist.stages, '{}') || array[l.current_stage::text] as stages,
         coalesce(l.country, l.geo_country) as country
  from public.leads l left join hist on hist.lead_id = l.id
  where l.organization_id = p_organization_id
),
reached as (
  select p.*,
         p.stages && array['payment_pending','closed_won','enrolled'] as pay,
         p.stages && array['closed_won','enrolled'] as won,
         p.stages && array['qualified','high_intent','payment_pending','closed_won','enrolled'] as qual,
         p.stages && array['high_intent','payment_pending','closed_won','enrolled'] as hi
  from people p
),
chan as (
  select distinct on (c.lead_id) c.lead_id, c.channel::text as channel
  from public.conversations c where c.organization_id = p_organization_id
  order by c.lead_id, c.created_at
),
msg as (
  select m.lead_id,
    count(*) filter (where m.direction = 'inbound') as n_in,
    bool_or(m.direction = 'outbound') as replied,
    count(distinct (m.created_at at time zone 'Asia/Kolkata')::date) filter (where m.direction = 'inbound') as active_days,
    bool_or(m.direction = 'inbound' and m.body ~* '(fee|cost|price|charges)') as fee,
    bool_or(m.direction = 'inbound' and m.body ~* '(date|batch|when|start)') as dates,
    bool_or(m.direction = 'inbound' and m.body ~* '(emi|instal|payment plan|part payment)') as plan,
    bool_or(m.direction = 'inbound' and m.body ~* '(certif|yoga alliance|ryt)') as cert,
    bool_or(m.direction = 'inbound' and m.body ~* '(accommodation|stay|room|food)') as stay,
    bool_or(m.direction = 'inbound' and m.body ~* '(online|offline|in person)') as online,
    bool_or(m.direction = 'inbound' and m.body ~* '(discount|offer|scholar)') as disc,
    bool_or(m.direction = 'inbound' and m.body ~ '\+?\d[\d\s-]{9,}') as phone
  from public.messages m where m.organization_id = p_organization_id
  group by m.lead_id
),
web as (select distinct w.lead_id from public.web_sessions w where w.organization_id = p_organization_id and w.lead_id is not null),
base as (
  select r.*, coalesce(ch.channel, 'none') as channel, msg.n_in, msg.replied, msg.active_days, msg.fee, msg.dates, msg.plan, msg.cert,
         msg.stay, msg.online, msg.disc, msg.phone, (web.lead_id is not null) as web
  from reached r left join chan ch on ch.lead_id = r.id left join msg on msg.lead_id = r.id left join web on web.lead_id = r.id
),
-- People old enough to have had a chance to move forward.
judged as (select b.* from base b, win where b.created_at >= win.since and b.created_at < now() - interval '7 days'),
signals as (
  select s.key, s.label, count(*) filter (where s.v) as n,
         count(*) filter (where s.v and j.pay) as pay_n,
         count(*) filter (where s.v and j.hi) as hi_n
  from judged j
  cross join lateral (values
    ('all', 'Everyone', true),
    ('web', 'Visited the website', j.web),
    ('msgs10', 'Wrote 10+ messages', coalesce(j.n_in, 0) >= 10),
    ('online', 'Asked online or in person', coalesce(j.online, false)),
    ('phone', 'Shared a phone number', coalesce(j.phone, false)),
    ('disc', 'Asked for a discount', coalesce(j.disc, false)),
    ('days3', 'Wrote on 3+ different days', coalesce(j.active_days, 0) >= 3),
    ('dates', 'Asked about dates', coalesce(j.dates, false)),
    ('fee', 'Asked the fee', coalesce(j.fee, false)),
    ('cert', 'Asked about the certificate', coalesce(j.cert, false)),
    ('plan', 'Asked about a payment plan', coalesce(j.plan, false)),
    ('stay', 'Asked about accommodation', coalesce(j.stay, false))
  ) as s(key, label, v)
  group by s.key, s.label
),
payers as (select b.* from base b where b.pay),
first_move as (
  select distinct on (h.lead_id) h.lead_id, h.changed_by_type::text as who
  from public.lead_stage_history h join payers p on p.id = h.lead_id
  where h.to_stage::text in ('payment_pending','closed_won','enrolled')
  order by h.lead_id, h.changed_at
),
ads as (
  select a.ad_id, max(a.ad_title) as ad_title, count(distinct a.lead_id) as people,
         count(distinct a.lead_id) filter (where r.qual) as qual,
         count(distinct a.lead_id) filter (where r.hi) as hi,
         count(distinct a.lead_id) filter (where r.pay) as pay,
         min(a.first_seen_at) as first_seen, max(a.last_seen_at) as last_seen
  from public.lead_ad_referrals a join reached r on r.id = a.lead_id
  where a.organization_id = p_organization_id
  group by a.ad_id
),
recent as (select b.* from base b, win where b.created_at >= win.since)
select jsonb_build_object(
  'generatedAt', now(),
  'days', greatest(14, least(coalesce(p_days, 60), 365)),
  'outcomes', jsonb_build_object(
    'reachedPayment', (select count(*) from payers),
    'wonOrEnrolled', (select count(*) from base where won),
    'paymentPendingNow', (select count(*) from base where stage = 'payment_pending'),
    'paymentRecords', (select count(*) from public.payments where organization_id = p_organization_id),
    'paymentsPaid', (select count(*) from public.payments where organization_id = p_organization_id and status::text in ('paid','succeeded','captured','completed')),
    'enrollments', (select count(*) from public.enrollments where organization_id = p_organization_id)
  ),
  'journey', jsonb_build_object(
    'byChannel', (select coalesce(jsonb_object_agg(channel, n), '{}') from (select channel, count(*) n from payers group by channel) x),
    'movedBy', (select coalesce(jsonb_object_agg(coalesce(f.who, 'unknown'), n), '{}') from (select f.who, count(*) n from payers p left join first_move f on f.lead_id = p.id group by f.who) f),
    'medianMessagesDm', (select percentile_cont(0.5) within group (order by n_in) from payers where channel in ('instagram','whatsapp') and n_in is not null),
    'websiteShareOfPeople', (select round(count(*) filter (where channel = 'website')::numeric / nullif(count(*), 0), 3) from recent)
  ),
  'signals', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'n', n, 'payN', pay_n, 'hiN', hi_n) order by key = 'all' desc, n desc), '[]') from signals),
  'ads', (select coalesce(jsonb_agg(jsonb_build_object('adId', ad_id, 'title', ad_title, 'people', people, 'qualified', qual, 'highIntent', hi, 'payment', pay, 'firstSeen', first_seen, 'lastSeen', last_seen) order by people desc), '[]') from ads),
  'layers', jsonb_build_object(
    'people', (select count(*) from recent),
    'conversation', (select count(*) from recent where n_in > 0),
    'ad', (select count(distinct a.lead_id) from public.lead_ad_referrals a join recent r on r.id = a.lead_id),
    'website', (select count(*) from recent where web),
    'linkVisits', (select count(*) from public.dm_tracked_link_visits v where v.organization_id = p_organization_id and coalesce(v.kind, '') <> 'preview_or_bot'),
    'country', (select count(*) from recent where country is not null),
    'callsLogged', (select count(*) from public.lead_contact_logs c join public.leads l on l.id = c.lead_id where l.organization_id = p_organization_id),
    'adSpendLastDay', (select max(date) from public.meta_ads_ad_daily where organization_id = p_organization_id)
  )
);
$$;

revoke all on function public.enrolment_intelligence_v1(uuid, integer) from public, anon, authenticated;
grant execute on function public.enrolment_intelligence_v1(uuid, integer) to service_role;
