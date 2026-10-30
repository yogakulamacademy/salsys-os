-- PH-5.2B.1j — cold-recovery compatibility only.
--
-- Purpose:
--   Migration 030_lead_sales_intelligence.sql consumes a set of reporting views
--   that existed in production before they were ever captured in source control.
--   This baseline reconstructs only the contracts required at the 029 -> 030
--   boundary.
--
-- Important:
--   - This file is NOT part of the normal production migration ledger.
--   - Never run it against current production.
--   - It copies no production data.
--   - The paid-media surface intentionally preserves the current output shape
--     while leaving later ad-warehouse cost/ROAS fields NULL. Those warehouse
--     objects have their own later historical boundary and must not be pulled
--     backward merely to make migration 030 replayable.

begin;

-- -----------------------------------------------------------------------------
-- 1. LEGACY LEAD REVENUE FIELDS
-- -----------------------------------------------------------------------------

alter table public.leads
  add column if not exists potential_value numeric;

alter table public.leads
  add column if not exists potential_currency text;


-- -----------------------------------------------------------------------------
-- 2. PAYMENT / REVENUE READ MODELS
-- -----------------------------------------------------------------------------

create or replace view public.v_lead_payment_totals
with (security_invoker = true)
as
select
  p.lead_id,
  upper(p.currency) as currency,
  coalesce(sum(
    case
      when p.payment_kind <> 'refund'::public.payment_kind
       and p.status = 'paid'::public.payment_status
      then p.amount
      else 0::numeric
    end
  ), 0::numeric)::numeric(14,2) as gross_paid,
  coalesce(sum(
    case
      when p.payment_kind = 'refund'::public.payment_kind
       and p.status = any(array[
         'refunded'::public.payment_status,
         'paid'::public.payment_status
       ])
      then p.amount
      else 0::numeric
    end
  ), 0::numeric)::numeric(14,2) as refunds,
  coalesce(sum(
    case
      when p.payment_kind <> 'refund'::public.payment_kind
       and p.status = 'paid'::public.payment_status
      then p.amount
      when p.payment_kind = 'refund'::public.payment_kind
       and p.status = any(array[
         'refunded'::public.payment_status,
         'paid'::public.payment_status
       ])
      then -p.amount
      else 0::numeric
    end
  ), 0::numeric)::numeric(14,2) as net_paid,
  count(*) filter (
    where p.payment_kind <> 'refund'::public.payment_kind
      and p.status = 'paid'::public.payment_status
  ) as successful_payment_count,
  p.organization_id
from public.payments p
group by p.organization_id, p.lead_id, upper(p.currency);

create or replace view public.v_lead_revenue_status
with (security_invoker = true)
as
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    l.display_name,
    trim(concat_ws(' ', l.first_name, l.last_name)),
    l.lead_code
  ) as lead_name,
  l.current_stage,
  l.potential_value,
  upper(l.potential_currency) as currency,
  coalesce(pt.gross_paid, 0::numeric)::numeric(14,2) as gross_paid,
  coalesce(pt.refunds, 0::numeric)::numeric(14,2) as refunds,
  coalesce(pt.net_paid, 0::numeric)::numeric(14,2) as net_paid,
  case
    when l.potential_value is null or l.potential_value <= 0::numeric
      then null::numeric
    else greatest(l.potential_value - coalesce(pt.net_paid, 0::numeric), 0::numeric)
  end::numeric(14,2) as outstanding_balance,
  case
    when l.potential_value is null or l.potential_value <= 0::numeric then 'unvalued'::text
    when coalesce(pt.net_paid, 0::numeric) <= 0::numeric then 'unpaid'::text
    when coalesce(pt.net_paid, 0::numeric) >= l.potential_value then 'paid'::text
    else 'partially_paid'::text
  end as payment_status,
  l.organization_id
from public.leads l
left join public.v_lead_payment_totals pt
  on pt.lead_id = l.id
 and pt.currency = upper(l.potential_currency)
 and pt.organization_id = l.organization_id
where l.status <> 'archived'::public.lead_status;


-- -----------------------------------------------------------------------------
-- 3. PAID-MEDIA COMPATIBILITY SURFACE
-- -----------------------------------------------------------------------------
--
-- The live database had a much deeper Google/Meta reporting warehouse before it
-- was captured in migrations. Migration 030 needs only a few paid-media fields.
-- Preserve the modern output contract here using canonical touchpoints and CRM
-- revenue. Later recovery work can replace the NULL warehouse metrics at the
-- historical boundary where those source objects become required.

create or replace view public.v_paid_media_leads
with (security_invoker = true)
as
with paid_touchpoints as (
  select
    t.*,
    case
      when lower(coalesce(t.source, '')) = 'google'
       and (
         lower(coalesce(t.medium, '')) = any(array['cpc','ppc','paid_search','paid'])
         or nullif(btrim(t.gclid), '') is not null
       ) then 'google'::text
      when lower(coalesce(t.source, '')) = any(array['ig','instagram'])
       and lower(coalesce(t.medium, '')) = 'paid_social' then 'instagram'::text
      when lower(coalesce(t.source, '')) = any(array['fb','facebook'])
       and lower(coalesce(t.medium, '')) = 'paid_social' then 'facebook'::text
      when lower(coalesce(t.source, '')) = 'meta'
       and lower(coalesce(t.medium, '')) = 'paid_social' then 'meta'::text
      else null::text
    end as paid_platform,
    row_number() over (
      partition by t.organization_id, t.lead_id
      order by t.occurred_at, t.id
    ) as paid_touch_rank
  from public.touchpoints t
  where t.lead_id is not null
),
first_paid_touch as (
  select *
  from paid_touchpoints
  where paid_platform is not null
    and paid_touch_rank = 1
),
payment_by_lead as (
  select
    p.organization_id,
    p.lead_id,
    coalesce(sum(p.net_paid) filter (where upper(p.currency) = 'INR'), 0::numeric)::numeric(14,2) as revenue_inr,
    coalesce(sum(p.net_paid) filter (where upper(p.currency) = 'USD'), 0::numeric)::numeric(14,2) as revenue_usd
  from public.v_lead_payment_totals p
  group by p.organization_id, p.lead_id
)
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(l.display_name, ''),
    nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  l.current_stage,
  f.paid_platform as platform,
  case
    when f.paid_platform = 'google' then 'Google Ads'::text
    when f.paid_platform = 'instagram' then 'Instagram Ads'::text
    when f.paid_platform = 'facebook' then 'Facebook Ads'::text
    when f.paid_platform = 'meta' then 'Meta Ads'::text
    else 'Paid Media'::text
  end as platform_label,
  f.occurred_at as first_paid_touch_at,
  f.source as tracked_source,
  f.medium as tracked_medium,
  f.external_campaign_id as campaign_id,
  f.campaign_name,
  f.external_adset_id as ad_group_or_adset_id,
  f.external_ad_id as ad_id,
  case when f.paid_platform = 'google' then 'ad_group'::text else 'ad_set'::text end as group_type,
  f.gclid,
  f.fbclid,
  f.landing_page,
  coalesce(f.geo_country, l.geo_country) as country,
  coalesce(f.geo_region, l.geo_region) as region,
  coalesce(f.geo_city, l.geo_city) as city,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  j.behaviour_temperature,
  j.engagement_score,
  j.is_reengaged,
  j.last_visit_at,
  rs.payment_status,
  coalesce(pb.revenue_inr, 0::numeric)::numeric(14,2) as revenue_inr,
  coalesce(pb.revenue_usd, 0::numeric)::numeric(14,2) as revenue_usd,
  (
    coalesce(pb.revenue_inr, 0::numeric) > 0::numeric
    or coalesce(pb.revenue_usd, 0::numeric) > 0::numeric
  ) as has_payment,
  (
    l.current_stage = 'enrolled'::public.lead_stage
    or exists (
      select 1
      from public.enrollments e
      where e.lead_id = l.id
        and e.organization_id = l.organization_id
    )
  ) as is_enrolled,
  null::text as acquisition_currency,
  null::numeric(14,2) as allocated_acquisition_cost,
  'unavailable'::text as acquisition_cost_method,
  null::numeric(14,2) as campaign_spend_30d,
  null::bigint as campaign_crm_leads_30d,
  null::numeric as campaign_roas_30d,
  false as campaign_matched,
  null::numeric as lead_revenue_to_allocated_cost_ratio,
  l.organization_id
from first_paid_touch f
join public.leads l
  on l.id = f.lead_id
 and l.organization_id = f.organization_id
left join public.v_lead_journey_intelligence j
  on j.lead_id = l.id
 and j.organization_id = l.organization_id
left join public.v_lead_revenue_status rs
  on rs.lead_id = l.id
 and rs.organization_id = l.organization_id
left join payment_by_lead pb
  on pb.lead_id = l.id
 and pb.organization_id = l.organization_id
where l.status <> 'archived'::public.lead_status;

create or replace view public.v_paid_media_leads_ui
with (security_invoker = true)
as
select
  p.lead_id,
  p.lead_code,
  p.lead_name,
  p.current_stage,
  p.platform,
  p.platform_label,
  p.first_paid_touch_at,
  p.tracked_source,
  p.tracked_medium,
  p.campaign_id,
  p.campaign_name,
  p.ad_group_or_adset_id,
  p.ad_id,
  p.group_type,
  p.gclid,
  p.fbclid,
  p.landing_page,
  p.country,
  p.region,
  p.city,
  p.preferred_location,
  p.preferred_month,
  p.preferred_mode,
  p.behaviour_temperature,
  p.engagement_score,
  p.is_reengaged,
  p.last_visit_at,
  p.payment_status,
  p.revenue_inr,
  p.revenue_usd,
  p.has_payment,
  p.is_enrolled,
  p.acquisition_currency,
  p.allocated_acquisition_cost,
  p.acquisition_cost_method,
  p.campaign_spend_30d,
  p.campaign_crm_leads_30d,
  p.campaign_roas_30d,
  p.campaign_matched,
  p.lead_revenue_to_allocated_cost_ratio,
  l.interested_course_id,
  c.name as course_name,
  c.code as course_code,
  email_contact.value as email,
  phone_contact.value as phone,
  p.organization_id
from public.v_paid_media_leads p
join public.leads l
  on l.id = p.lead_id
 and l.organization_id = p.organization_id
left join public.courses c
  on c.id = l.interested_course_id
 and c.organization_id = l.organization_id
left join lateral (
  select lc.value
  from public.lead_contacts lc
  where lc.lead_id = l.id
    and lc.organization_id = l.organization_id
    and lc.contact_type = 'email'::public.contact_type
  order by lc.is_primary desc, lc.created_at
  limit 1
) email_contact on true
left join lateral (
  select lc.value
  from public.lead_contacts lc
  where lc.lead_id = l.id
    and lc.organization_id = l.organization_id
    and lc.contact_type = any(array[
      'phone'::public.contact_type,
      'whatsapp'::public.contact_type
    ])
  order by
    case when lc.contact_type = 'whatsapp'::public.contact_type then 0 else 1 end,
    lc.is_primary desc,
    lc.created_at
  limit 1
) phone_contact on true;


-- -----------------------------------------------------------------------------
-- 4. ADMISSIONS PRIORITY QUEUE
-- -----------------------------------------------------------------------------

create or replace view public.v_admissions_priority_queue
with (security_invoker = true)
as
with base as (
  select
    l.id as lead_id,
    l.lead_code,
    coalesce(
      nullif(l.display_name, ''),
      nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
      l.lead_code,
      'Lead'
    ) as lead_name,
    l.current_stage,
    l.intent,
    l.current_contact_channel,
    l.first_touch_source,
    l.preferred_location,
    l.created_at,
    c.name as course_name,
    j.behaviour_temperature,
    coalesce(j.engagement_score, 0) as engagement_score,
    coalesce(j.is_reengaged, false) as is_reengaged,
    j.last_visit_at,
    j.last_session_source,
    j.behaviour_reason,
    coalesce(j.total_sessions, 0::bigint) as total_sessions,
    coalesce(j.sessions_after_lead, 0::bigint) as sessions_after_lead,
    r.payment_status,
    r.potential_value,
    r.currency,
    r.net_paid,
    r.outstanding_balance,
    fu.task_id as next_followup_task_id,
    fu.title as next_followup_title,
    fu.due_at as next_followup_due_at,
    case
      when fu.due_at is not null
       and fu.due_at < (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
      then true else false
    end as followup_overdue,
    case
      when fu.due_at is not null
       and (fu.due_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date
      then true else false
    end as followup_due_today,
    (pm.lead_id is not null) as is_paid_media_lead,
    pm.platform_label as paid_media_platform,
    pm.campaign_name as paid_media_campaign,
    pm.country as paid_media_country,
    l.organization_id
  from public.leads l
  left join public.courses c
    on c.id = l.interested_course_id
   and c.organization_id = l.organization_id
  left join public.v_lead_journey_intelligence j
    on j.lead_id = l.id
   and j.organization_id = l.organization_id
  left join public.v_lead_revenue_status r
    on r.lead_id = l.id
   and r.organization_id = l.organization_id
  left join lateral (
    select f.task_id, f.title, f.due_at
    from public.v_followups_due f
    where f.lead_id = l.id
      and f.organization_id = l.organization_id
    order by f.due_at
    limit 1
  ) fu on true
  left join public.v_paid_media_leads_ui pm
    on pm.lead_id = l.id
   and pm.organization_id = l.organization_id
  where (l.status is null or l.status <> 'archived'::public.lead_status)
    and l.current_stage <> all(array[
      'enrolled'::public.lead_stage,
      'lost'::public.lead_stage,
      'unqualified'::public.lead_stage,
      'duplicate'::public.lead_stage
    ])
),
scored as (
  select
    base.*,
    least(
      100,
      case
        when current_stage = 'payment_pending'::public.lead_stage then 38
        when current_stage = 'high_intent'::public.lead_stage then 30
        when current_stage = 'qualified'::public.lead_stage then 20
        when current_stage = 'engaged'::public.lead_stage then 12
        when current_stage = 'contacted'::public.lead_stage then 7
        when current_stage = 'new'::public.lead_stage then 10
        when current_stage = 'nurture'::public.lead_stage then 3
        when current_stage = 'not_now'::public.lead_stage then 1
        else 0
      end
      + case
          when behaviour_temperature = 'hot' then 26
          when behaviour_temperature = 'warm' then 13
          when behaviour_temperature = 'cold' then 2
          else 0
        end
      + case
          when followup_overdue then 24
          when followup_due_today then 14
          else 0
        end
      + case
          when payment_status = 'partially_paid' then 22
          when current_stage = 'payment_pending'::public.lead_stage and payment_status = 'unpaid' then 12
          else 0
        end
      + case when is_reengaged then 16 else 0 end
      + case
          when is_paid_media_lead and behaviour_temperature = 'hot' then 8
          when is_paid_media_lead and behaviour_temperature = 'warm' then 3
          else 0
        end
      + case
          when current_stage = 'new'::public.lead_stage and created_at >= now() - interval '2 hours' then 18
          when current_stage = 'new'::public.lead_stage and created_at >= now() - interval '24 hours' then 10
          else 0
        end
      + case
          when last_visit_at >= now() - interval '6 hours' then 8
          when last_visit_at >= now() - interval '24 hours' then 4
          else 0
        end
    )::integer as priority_score
  from base
)
select
  lead_id,
  lead_code,
  lead_name,
  current_stage,
  intent,
  current_contact_channel,
  first_touch_source,
  preferred_location,
  created_at,
  course_name,
  behaviour_temperature,
  engagement_score,
  is_reengaged,
  last_visit_at,
  last_session_source,
  behaviour_reason,
  total_sessions,
  sessions_after_lead,
  payment_status,
  potential_value,
  currency,
  net_paid,
  outstanding_balance,
  next_followup_task_id,
  next_followup_title,
  next_followup_due_at,
  followup_overdue,
  followup_due_today,
  is_paid_media_lead,
  paid_media_platform,
  paid_media_campaign,
  paid_media_country,
  priority_score,
  case
    when priority_score >= 85 then 'critical'::text
    when priority_score >= 65 then 'high'::text
    when priority_score >= 40 then 'medium'::text
    else 'low'::text
  end as priority_band,
  case
    when current_stage = 'payment_pending'::public.lead_stage and payment_status = 'partially_paid' and behaviour_temperature = 'hot' then 'close_hot_partial_payment'
    when current_stage = 'payment_pending'::public.lead_stage and behaviour_temperature = 'hot' then 'contact_payment_hot'
    when followup_overdue then 'complete_overdue_followup'
    when current_stage = 'payment_pending'::public.lead_stage then 'follow_up_payment'
    when current_stage = 'new'::public.lead_stage and created_at >= now() - interval '2 hours' then 'respond_new_lead_now'
    when is_reengaged and behaviour_temperature = 'hot' then 'contact_reengaged_hot'
    when is_paid_media_lead and behaviour_temperature = 'hot' then 'respond_paid_media_hot'
    when behaviour_temperature = 'hot' then 'contact_hot_lead'
    when followup_due_today then 'complete_today_followup'
    when current_stage = 'new'::public.lead_stage then 'make_first_contact'
    when is_reengaged then 'follow_up_reengaged'
    when behaviour_temperature = 'warm' then 'nurture_warm_lead'
    else 'review_lead'
  end::text as next_action_code,
  case
    when current_stage = 'payment_pending'::public.lead_stage and payment_status = 'partially_paid' and behaviour_temperature = 'hot' then 'Close now — hot lead already paid a deposit'
    when current_stage = 'payment_pending'::public.lead_stage and behaviour_temperature = 'hot' then 'Contact now — hot lead with payment pending'
    when followup_overdue then 'Complete overdue follow-up now'
    when current_stage = 'payment_pending'::public.lead_stage then 'Follow up on payment'
    when current_stage = 'new'::public.lead_stage and created_at >= now() - interval '2 hours' then 'Respond now — fresh new enquiry'
    when is_reengaged and behaviour_temperature = 'hot' then 'Contact now — hot re-engaged lead'
    when is_paid_media_lead and behaviour_temperature = 'hot' then 'Respond to hot paid-media lead'
    when behaviour_temperature = 'hot' then 'Contact hot lead'
    when followup_due_today then 'Complete today''s follow-up'
    when current_stage = 'new'::public.lead_stage then 'Make first contact'
    when is_reengaged then 'Follow up after website return'
    when behaviour_temperature = 'warm' then 'Nurture with relevant course details'
    else 'Review lead'
  end::text as next_best_action,
  concat_ws(
    ' · ',
    case
      when current_stage = 'payment_pending'::public.lead_stage and payment_status = 'partially_paid' then 'Deposit received'
      when current_stage = 'payment_pending'::public.lead_stage then 'Payment pending'
      when current_stage = 'high_intent'::public.lead_stage then 'High intent'
      when current_stage = 'qualified'::public.lead_stage then 'Qualified'
    end,
    case when followup_overdue then 'Overdue follow-up' when followup_due_today then 'Follow-up due today' end,
    case
      when current_stage = 'new'::public.lead_stage and created_at >= now() - interval '2 hours' then 'Fresh enquiry <2h'
      when current_stage = 'new'::public.lead_stage and created_at >= now() - interval '24 hours' then 'New enquiry <24h'
    end,
    case when behaviour_temperature = 'hot' then 'Hot behaviour' when behaviour_temperature = 'warm' then 'Warm behaviour' end,
    case when is_reengaged then 'Re-engaged' end,
    case when last_visit_at >= now() - interval '6 hours' then 'Visited in last 6h' when last_visit_at >= now() - interval '24 hours' then 'Visited today' end,
    case when is_paid_media_lead then 'Paid media' end
  ) as priority_reason,
  organization_id
from scored;


-- -----------------------------------------------------------------------------
-- 5. ACCESS POSTURE
-- -----------------------------------------------------------------------------

revoke all on public.v_lead_payment_totals from public, anon;
revoke all on public.v_lead_revenue_status from public, anon;
revoke all on public.v_paid_media_leads from public, anon;
revoke all on public.v_paid_media_leads_ui from public, anon;
revoke all on public.v_admissions_priority_queue from public, anon;

grant select on public.v_lead_payment_totals to authenticated, service_role;
grant select on public.v_lead_revenue_status to authenticated, service_role;
grant select on public.v_paid_media_leads to authenticated, service_role;
grant select on public.v_paid_media_leads_ui to authenticated, service_role;
grant select on public.v_admissions_priority_queue to authenticated, service_role;

commit;
