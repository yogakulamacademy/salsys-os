-- Commerce event readiness supplements the existing operational readiness view.
-- It detects a broken authoritative commerce chain without conflating
-- booking completion with verified payment or enrollment truth.

create or replace view public.v_commerce_event_readiness_v1 as
with event_counts as (
  select
    o.id as organization_id,
    count(r.id) filter (
      where r.source_event_type = 'booking.completed'
        and r.received_at >= now() - interval '30 days'
    )::bigint as booking_completed_30d,
    count(r.id) filter (
      where r.source_event_type = 'payment.started'
        and r.received_at >= now() - interval '30 days'
    )::bigint as payment_started_30d,
    count(r.id) filter (
      where r.source_event_type = 'payment.completed'
        and r.received_at >= now() - interval '30 days'
    )::bigint as payment_completed_30d,
    count(r.id) filter (
      where r.source_event_type = 'enrollment.completed'
        and r.received_at >= now() - interval '30 days'
    )::bigint as enrollment_completed_30d,
    max(r.received_at) filter (where r.source_event_type = 'booking.completed') as last_booking_completed_at,
    max(r.received_at) filter (where r.source_event_type = 'payment.started') as last_payment_started_at,
    max(r.received_at) filter (where r.source_event_type = 'payment.completed') as last_payment_completed_at,
    max(r.received_at) filter (where r.source_event_type = 'enrollment.completed') as last_enrollment_completed_at
  from public.organizations o
  left join public.raw_events r
    on r.organization_id = o.id
   and r.source_event_type in ('booking.completed','payment.started','payment.completed','enrollment.completed')
  group by o.id
)
select
  e.organization_id,
  'commerce_events'::text as readiness_key,
  'Commerce Event Pipeline'::text as readiness_name,
  'integrations'::text as readiness_group,
  case
    when e.booking_completed_30d = 0
     and e.payment_started_30d = 0
     and e.payment_completed_30d = 0
     and e.enrollment_completed_30d = 0
      then 'inactive'::text
    when e.payment_started_30d > 0
     and e.payment_completed_30d = 0
      then 'configuration_blocked'::text
    when e.payment_completed_30d > 0
     and e.enrollment_completed_30d = 0
      then 'warning'::text
    else 'healthy'::text
  end as health_status,
  case
    when e.booking_completed_30d = 0
     and e.payment_started_30d = 0
     and e.payment_completed_30d = 0
     and e.enrollment_completed_30d = 0
      then 'no_recent_commerce_events'::text
    when e.payment_started_30d > 0
     and e.payment_completed_30d = 0
      then 'payment_completion_missing'::text
    when e.payment_completed_30d > 0
     and e.enrollment_completed_30d = 0
      then 'enrollment_completion_missing'::text
    else 'active'::text
  end as operational_status,
  (e.booking_completed_30d > 0 or e.payment_started_30d > 0 or e.payment_completed_30d > 0 or e.enrollment_completed_30d > 0) as active,
  case
    when e.payment_started_30d > 0 and e.payment_completed_30d = 0 then e.payment_started_30d
    when e.payment_completed_30d > 0 and e.enrollment_completed_30d = 0 then e.payment_completed_30d
    else 0::bigint
  end as issue_count,
  jsonb_build_object(
    'booking_completed_30d', e.booking_completed_30d,
    'payment_started_30d', e.payment_started_30d,
    'payment_completed_30d', e.payment_completed_30d,
    'enrollment_completed_30d', e.enrollment_completed_30d,
    'last_booking_completed_at', e.last_booking_completed_at,
    'last_payment_started_at', e.last_payment_started_at,
    'last_payment_completed_at', e.last_payment_completed_at,
    'last_enrollment_completed_at', e.last_enrollment_completed_at,
    'blocker_message', case
      when e.payment_started_30d > 0 and e.payment_completed_30d = 0
        then 'Payment attempts are reaching Salsys, but no verified payment.completed events have arrived. Connect the authoritative payment-success emitter before relying on automated paid/enrollment projection.'
      when e.payment_completed_30d > 0 and e.enrollment_completed_30d = 0
        then 'Verified payments are arriving, but enrollment.completed events are missing. Review the post-payment enrollment emitter.'
      else null
    end
  ) as details,
  now() as checked_at
from event_counts e;
