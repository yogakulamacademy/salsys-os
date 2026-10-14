begin;

-- W8 Tenant Isolation: revenue forecasting and pipeline aging now consume
-- organization-specific settings while preserving their existing view schemas.

create or replace view public.v_revenue_forecast
with (security_invoker = true)
as
select
  l.id,
  l.lead_code,
  trim(both from concat_ws(' ', l.first_name, l.last_name)) as lead_name,
  l.current_stage,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.first_touch_source,
  l.first_touch_medium,
  l.first_touch_campaign,
  l.lead_creation_channel,
  l.expected_close_date,
  l.created_at,
  coalesce(l.potential_value, latest_enrollment.total_value) as potential_value,
  coalesce(l.potential_currency, latest_enrollment.currency, 'INR'::text) as currency,
  coalesce(tenant_probability.probability, default_probability.probability, 0::numeric) as probability,
  round(
    coalesce(l.potential_value, latest_enrollment.total_value, 0::numeric)
    * coalesce(tenant_probability.probability, default_probability.probability, 0::numeric),
    2
  ) as weighted_value,
  case
    when l.current_stage = 'enrolled'::public.lead_stage
      then coalesce(latest_enrollment.total_value, l.potential_value, 0::numeric)
    else 0::numeric
  end as actual_revenue,
  date_trunc(
    'month',
    coalesce(l.expected_close_date, l.created_at::date)::timestamptz
  )::date as forecast_month,
  l.organization_id
from public.leads l
left join public.organization_lead_stage_probabilities tenant_probability
  on tenant_probability.organization_id = l.organization_id
 and tenant_probability.stage = l.current_stage::text
left join public.lead_stage_probabilities default_probability
  on default_probability.stage = l.current_stage::text
left join lateral (
  select e.total_value, e.currency
  from public.enrollments e
  where e.lead_id = l.id
    and e.organization_id = l.organization_id
  order by e.created_at desc
  limit 1
) latest_enrollment on true;

create or replace view public.v_pipeline_stage_aging
with (security_invoker = true)
as
with current_stage_entry as (
  select
    l0.id as lead_id,
    coalesce(
      (
        select lsh.changed_at
        from public.lead_stage_history lsh
        where lsh.lead_id = l0.id
          and lsh.to_stage::text = l0.current_stage::text
        order by lsh.changed_at desc, lsh.id desc
        limit 1
      ),
      l0.created_at
    ) as stage_entered_at
  from public.leads l0
)
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  l.current_stage::text as current_stage,
  l.status::text as lead_status,
  l.intent::text as intent,
  l.owner_user_id,
  p.full_name as owner_name,
  l.interested_course_id,
  c.code as course_code,
  c.name as course_name,
  l.preferred_batch_id,
  cb.batch_code,
  cb.location as batch_location,
  cb.start_date as batch_start_date,
  cb.end_date as batch_end_date,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.lead_creation_channel::text as lead_creation_channel,
  l.current_contact_channel::text as current_contact_channel,
  l.last_contacted_at,
  l.next_followup_at,
  l.last_inbound_at,
  l.last_outbound_at,
  l.created_at as lead_created_at,
  cse.stage_entered_at,
  greatest(
    extract(epoch from (now() - cse.stage_entered_at)) / 3600.0,
    0::numeric
  )::numeric(12,2) as stage_age_hours,
  greatest(
    extract(epoch from (now() - cse.stage_entered_at)) / 86400.0,
    0::numeric
  )::numeric(12,2) as stage_age_days,
  coalesce(
    tenant_rule.warning_after_days,
    default_rule.warning_after_days
  )::numeric(8,2) as warning_after_days,
  coalesce(
    tenant_rule.stuck_after_days,
    default_rule.stuck_after_days
  )::numeric(8,2) as stuck_after_days,
  case
    when coalesce(tenant_rule.stage, default_rule.stage) is null
      or coalesce(tenant_rule.active, default_rule.active) is not true
      then 'untracked'::text
    when extract(epoch from (now() - cse.stage_entered_at)) / 86400.0
      >= coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days)
      then 'stuck'::text
    when extract(epoch from (now() - cse.stage_entered_at)) / 86400.0
      >= coalesce(tenant_rule.warning_after_days, default_rule.warning_after_days)
      then 'warning'::text
    else 'healthy'::text
  end as aging_status,
  case
    when coalesce(tenant_rule.stage, default_rule.stage) is null
      or coalesce(tenant_rule.active, default_rule.active) is not true
      then null::numeric
    when extract(epoch from (now() - cse.stage_entered_at)) / 86400.0
      >= coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days)
      then greatest(
        extract(epoch from (now() - cse.stage_entered_at)) / 86400.0
        - coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days),
        0::numeric
      )::numeric(12,2)
    else 0::numeric(12,2)
  end as days_over_stuck_threshold,
  case
    when l.last_contacted_at is null then null::numeric
    else greatest(
      extract(epoch from (now() - l.last_contacted_at)) / 86400.0,
      0::numeric
    )::numeric(12,2)
  end as days_since_last_contact
from public.leads l
join current_stage_entry cse on cse.lead_id = l.id
left join public.organization_pipeline_stage_aging_rules tenant_rule
  on tenant_rule.organization_id = l.organization_id
 and tenant_rule.stage = l.current_stage::text
left join public.pipeline_stage_aging_rules default_rule
  on default_rule.stage = l.current_stage::text
left join public.profiles p on p.id = l.owner_user_id
left join public.courses c on c.id = l.interested_course_id
left join public.course_batches cb on cb.id = l.preferred_batch_id;

commit;
