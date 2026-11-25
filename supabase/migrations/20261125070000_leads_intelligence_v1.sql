-- Smart Leads briefing (owner-approved mockup "Leads v2", 25 Nov 2026).
-- Read-only JSON for one business: new people per day by channel (and how
-- many came from an ad), weekly reply and qualification rates, whether a
-- reply changes qualification, demand by course, who is waiting on us, and
-- open pipeline value. Service role only; the server passes the business id
-- after checking the signed-in user.

create or replace function public.leads_intelligence_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
L as (
  select l.id, l.created_at, l.current_stage::text as stage, l.interested_course_id, l.potential_value, l.potential_value_source
  from public.leads l
  where l.organization_id = p_organization_id and l.created_at >= now() - interval '120 days'
),
hist as (
  select h.lead_id, bool_or(h.to_stage::text in ('qualified','high_intent','payment_pending','closed_won','enrolled')) as q
  from public.lead_stage_history h join L on L.id = h.lead_id group by h.lead_id
),
chan as (
  select distinct on (c.lead_id) c.lead_id, c.channel::text as channel
  from public.conversations c join L on L.id = c.lead_id
  where c.organization_id = p_organization_id
  order by c.lead_id, c.created_at
),
ad as (select distinct a.lead_id from public.lead_ad_referrals a join L on L.id = a.lead_id where a.organization_id = p_organization_id),
fi as (
  select m.lead_id, min(m.created_at) as t from public.messages m join L on L.id = m.lead_id
  where m.organization_id = p_organization_id and m.direction = 'inbound' group by m.lead_id
),
fo as (
  select fi.lead_id, min(m.created_at) as t from fi join public.messages m on m.lead_id = fi.lead_id and m.direction = 'outbound' and m.created_at > fi.t
  where m.organization_id = p_organization_id group by fi.lead_id
),
lastmsg as (
  select distinct on (m.lead_id) m.lead_id, m.direction::text as direction, m.created_at
  from public.messages m join L on L.id = m.lead_id
  where m.organization_id = p_organization_id and m.created_at >= now() - interval '14 days'
  order by m.lead_id, m.created_at desc
),
firstbody as (
  select distinct on (m.lead_id) m.lead_id, m.body
  from public.messages m join L on L.id = m.lead_id
  where m.organization_id = p_organization_id and m.direction = 'inbound'
  order by m.lead_id, m.created_at
),
B as (
  select L.*, coalesce(chan.channel, 'other') as channel, (ad.lead_id is not null) as from_ad,
         coalesce(hist.q, false) or L.stage in ('qualified','high_intent','payment_pending','closed_won','enrolled') as qual,
         fi.t as first_in, fo.t as first_out
  from L left join chan on chan.lead_id = L.id left join ad on ad.lead_id = L.id left join hist on hist.lead_id = L.id
  left join fi on fi.lead_id = L.id left join fo on fo.lead_id = L.id
),
days as (
  select g::date as d from generate_series((now() at time zone 'Asia/Kolkata')::date - 89, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') g
),
daily as (
  select days.d,
         count(B.id) as total,
         count(B.id) filter (where B.channel = 'instagram') as instagram,
         count(B.id) filter (where B.channel = 'website') as website,
         count(B.id) filter (where B.channel not in ('instagram','website')) as other,
         count(B.id) filter (where B.from_ad) as from_ad,
         count(B.id) filter (where B.qual) as qualified
  from days left join B on (B.created_at at time zone 'Asia/Kolkata')::date = days.d
  group by days.d
),
weeks as (
  select floor(extract(epoch from now() - B.created_at) / 604800)::int as wk_ago,
         count(*) as n,
         count(*) filter (where B.qual) as qualified,
         count(*) filter (where B.first_in is not null) as wrote,
         count(*) filter (where B.first_out is not null) as replied,
         percentile_cont(0.5) within group (order by extract(epoch from B.first_out - B.first_in) / 60) filter (where B.first_out is not null) as median_reply_min
  from B where B.created_at >= now() - interval '56 days'
  group by 1
),
effect as (
  select count(*) filter (where first_out is not null) as replied_n,
         count(*) filter (where first_out is not null and qual) as replied_q,
         count(*) filter (where first_out is null) as none_n,
         count(*) filter (where first_out is null and qual) as none_q
  from B where first_in is not null and created_at between now() - interval '60 days' and now() - interval '3 days'
),
courses as (
  select coalesce(c.name, '') as name, B.interested_course_id as course_id,
         count(*) filter (where B.created_at >= now() - interval '7 days') as w0,
         count(*) filter (where B.created_at >= now() - interval '14 days' and B.created_at < now() - interval '7 days') as w1,
         count(*) filter (where B.created_at >= now() - interval '21 days' and B.created_at < now() - interval '14 days') as w2,
         count(*) filter (where B.created_at >= now() - interval '28 days' and B.created_at < now() - interval '21 days') as w3,
         count(*) filter (where B.created_at >= now() - interval '35 days') as n35,
         count(*) filter (where B.created_at >= now() - interval '35 days' and B.qual) as q35,
         sum(B.potential_value) filter (where B.stage in ('qualified','high_intent','payment_pending') and B.potential_value_source like 'course_price:india%') as open_inr
  from B left join public.courses c on c.id = B.interested_course_id
  where B.created_at >= now() - interval '35 days'
  group by 1, 2
),
waiting as (
  select count(*) as n,
         count(*) filter (where fb.body ~* '(fee|cost|price|charges)') as asked_fee,
         count(*) filter (where lm.created_at >= now() - interval '24 hours') as in_window
  from lastmsg lm left join firstbody fb on fb.lead_id = lm.lead_id
  where lm.direction = 'inbound' and lm.created_at >= now() - interval '7 days'
),
pipeline as (
  select count(*) as n, coalesce(sum(potential_value) filter (where potential_value_source like 'course_price:india%'), 0) as inr
  from public.leads where organization_id = p_organization_id and current_stage::text in ('qualified','high_intent','payment_pending')
)
select jsonb_build_object(
  'generatedAt', now(),
  'daily', (select jsonb_agg(jsonb_build_object('d', d, 'total', total, 'instagram', instagram, 'website', website, 'other', other, 'fromAd', from_ad, 'qualified', qualified) order by d) from daily),
  'weeks', (select coalesce(jsonb_agg(jsonb_build_object('wkAgo', wk_ago, 'n', n, 'qualified', qualified, 'wrote', wrote, 'replied', replied, 'medianReplyMin', median_reply_min) order by wk_ago), '[]') from weeks),
  'replyEffect', (select jsonb_build_object('repliedN', replied_n, 'repliedQ', replied_q, 'noneN', none_n, 'noneQ', none_q) from effect),
  'courses', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'courseId', course_id, 'w', jsonb_build_array(w3, w2, w1, w0), 'n35', n35, 'q35', q35, 'openInr', open_inr) order by n35 desc), '[]') from courses),
  'waiting', (select jsonb_build_object('n', n, 'askedFee', asked_fee, 'inWindow', in_window) from waiting),
  'pipeline', (select jsonb_build_object('n', n, 'inr', inr) from pipeline)
);
$$;

revoke all on function public.leads_intelligence_v1(uuid) from public, anon, authenticated;
grant execute on function public.leads_intelligence_v1(uuid) to service_role;
