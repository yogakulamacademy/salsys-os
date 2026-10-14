begin;

-- =============================================================================
-- 057_contact_intelligence_security_invoker_hardening.sql
--
-- Removes Supabase Security Advisor security_definer_view findings for the six
-- Reports workspace Contact Intelligence views while preserving the existing
-- has_workspace_access(..., 'reports') authorization model.
-- =============================================================================

create schema if not exists app_private authorization postgres;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

alter default privileges
for role postgres
in schema app_private
revoke execute on functions from public;

alter default privileges
for role postgres
in schema app_private
revoke execute on functions from anon;

create or replace function app_private.contact_intelligence_lead_workspace_rows()
returns table (
  lead_id uuid,
  lead_code text,
  lead_name text,
  owner_user_id uuid,
  owner_name text,
  current_stage public.lead_stage,
  intent public.intent_level,
  interested_course_id uuid,
  course_name text,
  preferred_location text,
  preferred_mode text,
  country text,
  lead_created_at timestamptz,
  is_enrolled boolean,
  enrolled_at timestamptz,
  first_paid_at timestamptz,
  paid_transaction_count bigint,
  total_contacts bigint,
  outbound_contacts bigint,
  inbound_contacts bigint,
  successful_contacts bigint,
  no_answer_contacts bigint,
  follow_up_needed_contacts bigint,
  unique_employees bigint,
  whatsapp_contacts bigint,
  sms_contacts bigint,
  phone_contacts bigint,
  email_contacts bigint,
  instagram_contacts bigint,
  first_contact_at timestamptz,
  first_outbound_at timestamptz,
  first_inbound_at timestamptz,
  last_contact_at timestamptz,
  first_response_minutes numeric,
  first_outbound_after_inbound timestamptz,
  first_inbound_response_minutes numeric,
  contacts_before_enrollment bigint,
  attempts_before_enrollment bigint,
  contacts_before_first_payment bigint,
  organization_id uuid
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
with enrollment_facts as (
  select
    e.lead_id,
    min(coalesce(e.enrolled_at, e.created_at)) filter (
      where e.status in ('confirmed', 'completed')
    ) as enrollment_record_at,
    bool_or(e.status in ('confirmed', 'completed')) as has_confirmed_enrollment
  from public.enrollments e
  group by e.lead_id
),
stage_enrollment as (
  select
    h.lead_id,
    min(h.changed_at) as enrolled_stage_at
  from public.lead_stage_history h
  where h.to_stage = 'enrolled'
  group by h.lead_id
),
payment_facts as (
  select
    p.lead_id,
    min(coalesce(p.paid_at, p.created_at)) filter (
      where p.status = 'paid'
        and p.payment_kind <> 'refund'
    ) as first_paid_at,
    count(*) filter (
      where p.status = 'paid'
        and p.payment_kind <> 'refund'
    ) as paid_transaction_count
  from public.payments p
  group by p.lead_id
),
lead_conversion as (
  select
    l.id as lead_id,
    l.current_stage = 'enrolled'
      or coalesce(ef.has_confirmed_enrollment, false) as is_enrolled,
    coalesce(se.enrolled_stage_at, ef.enrollment_record_at) as enrolled_at,
    pf.first_paid_at,
    coalesce(pf.paid_transaction_count, 0::bigint) as paid_transaction_count
  from public.leads l
  left join enrollment_facts ef on ef.lead_id = l.id
  left join stage_enrollment se on se.lead_id = l.id
  left join payment_facts pf on pf.lead_id = l.id
),
contact_facts as (
  select
    lcl.lead_id,
    count(*) as total_contacts,
    count(*) filter (where lcl.direction = 'outbound') as outbound_contacts,
    count(*) filter (where lcl.direction = 'inbound') as inbound_contacts,
    count(*) filter (where lcl.outcome in ('connected', 'replied')) as successful_contacts,
    count(*) filter (where lcl.outcome = 'no_answer') as no_answer_contacts,
    count(*) filter (where lcl.outcome = 'follow_up_needed') as follow_up_needed_contacts,
    min(lcl.contacted_at) as first_contact_at,
    min(lcl.contacted_at) filter (where lcl.direction = 'outbound') as first_outbound_at,
    min(lcl.contacted_at) filter (where lcl.direction = 'inbound') as first_inbound_at,
    max(lcl.contacted_at) as last_contact_at,
    count(distinct lcl.employee_user_id) filter (
      where lcl.employee_user_id is not null
    ) as unique_employees,
    count(*) filter (where lcl.method = 'whatsapp') as whatsapp_contacts,
    count(*) filter (where lcl.method = 'sms') as sms_contacts,
    count(*) filter (where lcl.method = 'phone') as phone_contacts,
    count(*) filter (where lcl.method = 'email') as email_contacts,
    count(*) filter (where lcl.method = 'instagram') as instagram_contacts
  from public.lead_contact_logs lcl
  group by lcl.lead_id
),
first_inbound_response as (
  select
    l.id as lead_id,
    inbound.first_inbound_at,
    outbound.first_outbound_after_inbound
  from public.leads l
  left join lateral (
    select min(lcl.contacted_at) as first_inbound_at
    from public.lead_contact_logs lcl
    where lcl.lead_id = l.id
      and lcl.direction = 'inbound'
  ) inbound on true
  left join lateral (
    select min(lcl.contacted_at) as first_outbound_after_inbound
    from public.lead_contact_logs lcl
    where lcl.lead_id = l.id
      and lcl.direction = 'outbound'
      and inbound.first_inbound_at is not null
      and lcl.contacted_at >= inbound.first_inbound_at
  ) outbound on true
),
pre_conversion_counts as (
  select
    lc.lead_id,
    count(lcl.id) filter (
      where lc.enrolled_at is not null
        and lcl.contacted_at <= lc.enrolled_at
    ) as contacts_before_enrollment,
    count(lcl.id) filter (
      where lc.enrolled_at is not null
        and lcl.direction = 'outbound'
        and lcl.contacted_at <= lc.enrolled_at
    ) as attempts_before_enrollment,
    count(lcl.id) filter (
      where lc.first_paid_at is not null
        and lcl.contacted_at <= lc.first_paid_at
    ) as contacts_before_first_payment
  from lead_conversion lc
  left join public.lead_contact_logs lcl on lcl.lead_id = lc.lead_id
  group by lc.lead_id
)
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  l.owner_user_id,
  owner.full_name as owner_name,
  l.current_stage,
  l.intent,
  l.interested_course_id,
  c.name as course_name,
  l.preferred_location,
  l.preferred_mode,
  l.country,
  l.created_at as lead_created_at,
  lc.is_enrolled,
  lc.enrolled_at,
  lc.first_paid_at,
  lc.paid_transaction_count,
  coalesce(cf.total_contacts, 0::bigint) as total_contacts,
  coalesce(cf.outbound_contacts, 0::bigint) as outbound_contacts,
  coalesce(cf.inbound_contacts, 0::bigint) as inbound_contacts,
  coalesce(cf.successful_contacts, 0::bigint) as successful_contacts,
  coalesce(cf.no_answer_contacts, 0::bigint) as no_answer_contacts,
  coalesce(cf.follow_up_needed_contacts, 0::bigint) as follow_up_needed_contacts,
  coalesce(cf.unique_employees, 0::bigint) as unique_employees,
  coalesce(cf.whatsapp_contacts, 0::bigint) as whatsapp_contacts,
  coalesce(cf.sms_contacts, 0::bigint) as sms_contacts,
  coalesce(cf.phone_contacts, 0::bigint) as phone_contacts,
  coalesce(cf.email_contacts, 0::bigint) as email_contacts,
  coalesce(cf.instagram_contacts, 0::bigint) as instagram_contacts,
  cf.first_contact_at,
  cf.first_outbound_at,
  cf.first_inbound_at,
  cf.last_contact_at,
  case
    when cf.first_outbound_at is not null
      and cf.first_outbound_at >= l.created_at
    then round(extract(epoch from (cf.first_outbound_at - l.created_at)) / 60::numeric, 2)
    else null::numeric
  end as first_response_minutes,
  fir.first_outbound_after_inbound,
  case
    when fir.first_inbound_at is not null
      and fir.first_outbound_after_inbound is not null
      and fir.first_outbound_after_inbound >= fir.first_inbound_at
    then round(
      extract(epoch from (fir.first_outbound_after_inbound - fir.first_inbound_at))
        / 60::numeric,
      2
    )
    else null::numeric
  end as first_inbound_response_minutes,
  case
    when lc.enrolled_at is not null then pcc.contacts_before_enrollment
    else null::bigint
  end as contacts_before_enrollment,
  case
    when lc.enrolled_at is not null then pcc.attempts_before_enrollment
    else null::bigint
  end as attempts_before_enrollment,
  case
    when lc.first_paid_at is not null then pcc.contacts_before_first_payment
    else null::bigint
  end as contacts_before_first_payment,
  l.organization_id
from public.leads l
left join public.profiles owner on owner.id = l.owner_user_id
left join public.courses c
  on c.id = l.interested_course_id
 and c.organization_id = l.organization_id
left join lead_conversion lc on lc.lead_id = l.id
left join contact_facts cf on cf.lead_id = l.id
left join first_inbound_response fir on fir.lead_id = l.id
left join pre_conversion_counts pcc on pcc.lead_id = l.id
where public.has_workspace_access(l.organization_id, 'reports');
$function$;

create or replace function app_private.contact_intelligence_overview_workspace_rows()
returns table (
  accessible_leads bigint,
  contacted_leads bigint,
  never_contacted_leads bigint,
  total_contacts bigint,
  outbound_contacts bigint,
  inbound_contacts bigint,
  successful_contacts bigint,
  no_answer_contacts bigint,
  follow_up_needed_contacts bigint,
  enrolled_leads bigint,
  avg_first_response_minutes numeric,
  median_first_response_minutes double precision,
  avg_first_inbound_response_minutes numeric,
  median_first_inbound_response_minutes double precision,
  avg_attempts_before_enrollment numeric,
  median_attempts_before_enrollment double precision,
  avg_contacts_before_enrollment numeric,
  avg_contacts_before_first_payment numeric,
  organization_id uuid
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
select
  count(*) as accessible_leads,
  count(*) filter (where total_contacts > 0) as contacted_leads,
  count(*) filter (where total_contacts = 0) as never_contacted_leads,
  sum(total_contacts)::bigint as total_contacts,
  sum(outbound_contacts)::bigint as outbound_contacts,
  sum(inbound_contacts)::bigint as inbound_contacts,
  sum(successful_contacts)::bigint as successful_contacts,
  sum(no_answer_contacts)::bigint as no_answer_contacts,
  sum(follow_up_needed_contacts)::bigint as follow_up_needed_contacts,
  count(*) filter (where is_enrolled) as enrolled_leads,
  round(avg(first_response_minutes) filter (where first_response_minutes is not null), 2)
    as avg_first_response_minutes,
  percentile_cont(0.5) within group (order by first_response_minutes::double precision)
    filter (where first_response_minutes is not null)
    as median_first_response_minutes,
  round(
    avg(first_inbound_response_minutes)
      filter (where first_inbound_response_minutes is not null),
    2
  ) as avg_first_inbound_response_minutes,
  percentile_cont(0.5) within group (
    order by first_inbound_response_minutes::double precision
  ) filter (where first_inbound_response_minutes is not null)
    as median_first_inbound_response_minutes,
  round(avg(attempts_before_enrollment) filter (where attempts_before_enrollment is not null), 2)
    as avg_attempts_before_enrollment,
  percentile_cont(0.5) within group (order by attempts_before_enrollment::double precision)
    filter (where attempts_before_enrollment is not null)
    as median_attempts_before_enrollment,
  round(avg(contacts_before_enrollment) filter (where contacts_before_enrollment is not null), 2)
    as avg_contacts_before_enrollment,
  round(avg(contacts_before_first_payment) filter (where contacts_before_first_payment is not null), 2)
    as avg_contacts_before_first_payment,
  organization_id
from app_private.contact_intelligence_lead_workspace_rows()
group by organization_id;
$function$;

create or replace function app_private.contact_intelligence_employee_workspace_rows()
returns table (
  employee_user_id uuid,
  employee_name text,
  contacted_leads bigint,
  total_contacts bigint,
  outbound_contacts bigint,
  inbound_contacts bigint,
  successful_contacts bigint,
  no_answer_contacts bigint,
  follow_up_needed_contacts bigint,
  phone_contacts bigint,
  whatsapp_contacts bigint,
  email_contacts bigint,
  sms_contacts bigint,
  instagram_contacts bigint,
  total_call_seconds bigint,
  successful_contact_rate_pct numeric,
  contacted_leads_later_enrolled bigint,
  contacted_to_enrolled_observed_pct numeric,
  last_contact_at timestamptz,
  organization_id uuid
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
with per_employee_lead as (
  select
    l.organization_id,
    lcl.employee_user_id,
    lcl.lead_id,
    max(lcl.employee_name_snapshot) as employee_name_snapshot,
    min(lcl.contacted_at) as first_contact_at,
    max(lcl.contacted_at) as last_contact_at,
    count(*) as total_contacts,
    count(*) filter (where lcl.direction = 'outbound') as outbound_contacts,
    count(*) filter (where lcl.direction = 'inbound') as inbound_contacts,
    count(*) filter (where lcl.outcome in ('connected', 'replied')) as successful_contacts,
    count(*) filter (where lcl.outcome = 'no_answer') as no_answer_contacts,
    count(*) filter (where lcl.outcome = 'follow_up_needed') as follow_up_needed_contacts,
    count(*) filter (where lcl.method = 'phone') as phone_contacts,
    count(*) filter (where lcl.method = 'whatsapp') as whatsapp_contacts,
    count(*) filter (where lcl.method = 'email') as email_contacts,
    count(*) filter (where lcl.method = 'sms') as sms_contacts,
    count(*) filter (where lcl.method = 'instagram') as instagram_contacts,
    coalesce(sum(lcl.call_duration_seconds), 0::bigint) as total_call_seconds
  from public.lead_contact_logs lcl
  join public.leads l on l.id = lcl.lead_id
  where lcl.employee_user_id is not null
    and public.has_workspace_access(l.organization_id, 'reports')
  group by l.organization_id, lcl.employee_user_id, lcl.lead_id
)
select
  pel.employee_user_id,
  coalesce(p.full_name, max(pel.employee_name_snapshot), 'Unknown employee') as employee_name,
  count(distinct pel.lead_id) as contacted_leads,
  sum(pel.total_contacts)::bigint as total_contacts,
  sum(pel.outbound_contacts)::bigint as outbound_contacts,
  sum(pel.inbound_contacts)::bigint as inbound_contacts,
  sum(pel.successful_contacts)::bigint as successful_contacts,
  sum(pel.no_answer_contacts)::bigint as no_answer_contacts,
  sum(pel.follow_up_needed_contacts)::bigint as follow_up_needed_contacts,
  sum(pel.phone_contacts)::bigint as phone_contacts,
  sum(pel.whatsapp_contacts)::bigint as whatsapp_contacts,
  sum(pel.email_contacts)::bigint as email_contacts,
  sum(pel.sms_contacts)::bigint as sms_contacts,
  sum(pel.instagram_contacts)::bigint as instagram_contacts,
  sum(pel.total_call_seconds)::bigint as total_call_seconds,
  round(
    sum(pel.successful_contacts) / nullif(sum(pel.total_contacts), 0::numeric) * 100::numeric,
    2
  ) as successful_contact_rate_pct,
  count(distinct pel.lead_id) filter (
    where ci.enrolled_at is not null
      and ci.enrolled_at >= pel.first_contact_at
  ) as contacted_leads_later_enrolled,
  round(
    count(distinct pel.lead_id) filter (
      where ci.enrolled_at is not null
        and ci.enrolled_at >= pel.first_contact_at
    )::numeric
    / nullif(count(distinct pel.lead_id), 0)::numeric
    * 100::numeric,
    2
  ) as contacted_to_enrolled_observed_pct,
  max(pel.last_contact_at) as last_contact_at,
  pel.organization_id
from per_employee_lead pel
left join public.profiles p on p.id = pel.employee_user_id
left join app_private.contact_intelligence_lead_workspace_rows() ci
  on ci.lead_id = pel.lead_id
 and ci.organization_id = pel.organization_id
group by pel.organization_id, pel.employee_user_id, p.full_name;
$function$;

create or replace function app_private.contact_intelligence_channel_workspace_rows()
returns table (
  method text,
  contacted_leads bigint,
  total_contacts bigint,
  outbound_contacts bigint,
  inbound_contacts bigint,
  successful_contacts bigint,
  no_answer_contacts bigint,
  follow_up_needed_contacts bigint,
  successful_contact_rate_pct numeric,
  contacted_leads_later_enrolled bigint,
  contacted_to_enrolled_observed_pct numeric,
  organization_id uuid
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
with per_method_lead as (
  select
    l.organization_id,
    lcl.method,
    lcl.lead_id,
    min(lcl.contacted_at) as first_method_contact_at,
    count(*) as contacts,
    count(*) filter (where lcl.direction = 'outbound') as outbound_contacts,
    count(*) filter (where lcl.direction = 'inbound') as inbound_contacts,
    count(*) filter (where lcl.outcome in ('connected', 'replied')) as successful_contacts,
    count(*) filter (where lcl.outcome = 'no_answer') as no_answer_contacts,
    count(*) filter (where lcl.outcome = 'follow_up_needed') as follow_up_needed_contacts
  from public.lead_contact_logs lcl
  join public.leads l on l.id = lcl.lead_id
  where public.has_workspace_access(l.organization_id, 'reports')
  group by l.organization_id, lcl.method, lcl.lead_id
)
select
  pml.method,
  count(distinct pml.lead_id) as contacted_leads,
  sum(pml.contacts)::bigint as total_contacts,
  sum(pml.outbound_contacts)::bigint as outbound_contacts,
  sum(pml.inbound_contacts)::bigint as inbound_contacts,
  sum(pml.successful_contacts)::bigint as successful_contacts,
  sum(pml.no_answer_contacts)::bigint as no_answer_contacts,
  sum(pml.follow_up_needed_contacts)::bigint as follow_up_needed_contacts,
  round(
    sum(pml.successful_contacts) / nullif(sum(pml.contacts), 0::numeric) * 100::numeric,
    2
  ) as successful_contact_rate_pct,
  count(distinct pml.lead_id) filter (
    where ci.enrolled_at is not null
      and ci.enrolled_at >= pml.first_method_contact_at
  ) as contacted_leads_later_enrolled,
  round(
    count(distinct pml.lead_id) filter (
      where ci.enrolled_at is not null
        and ci.enrolled_at >= pml.first_method_contact_at
    )::numeric
    / nullif(count(distinct pml.lead_id), 0)::numeric
    * 100::numeric,
    2
  ) as contacted_to_enrolled_observed_pct,
  pml.organization_id
from per_method_lead pml
left join app_private.contact_intelligence_lead_workspace_rows() ci
  on ci.lead_id = pml.lead_id
 and ci.organization_id = pml.organization_id
group by pml.organization_id, pml.method;
$function$;

create or replace function app_private.contact_intelligence_outcome_workspace_rows()
returns table (
  outcome text,
  leads bigint,
  total_contacts bigint,
  leads_later_enrolled bigint,
  later_enrolled_observed_pct numeric,
  organization_id uuid
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
with per_outcome_lead as (
  select
    l.organization_id,
    lcl.outcome,
    lcl.lead_id,
    min(lcl.contacted_at) as first_outcome_at,
    count(*) as contacts
  from public.lead_contact_logs lcl
  join public.leads l on l.id = lcl.lead_id
  where public.has_workspace_access(l.organization_id, 'reports')
  group by l.organization_id, lcl.outcome, lcl.lead_id
)
select
  pol.outcome,
  count(distinct pol.lead_id) as leads,
  sum(pol.contacts)::bigint as total_contacts,
  count(distinct pol.lead_id) filter (
    where ci.enrolled_at is not null
      and ci.enrolled_at >= pol.first_outcome_at
  ) as leads_later_enrolled,
  round(
    count(distinct pol.lead_id) filter (
      where ci.enrolled_at is not null
        and ci.enrolled_at >= pol.first_outcome_at
    )::numeric
    / nullif(count(distinct pol.lead_id), 0)::numeric
    * 100::numeric,
    2
  ) as later_enrolled_observed_pct,
  pol.organization_id
from per_outcome_lead pol
left join app_private.contact_intelligence_lead_workspace_rows() ci
  on ci.lead_id = pol.lead_id
 and ci.organization_id = pol.organization_id
group by pol.organization_id, pol.outcome;
$function$;

create or replace function app_private.contact_intelligence_time_ist_workspace_rows()
returns table (
  iso_day_of_week integer,
  day_name text,
  hour_of_day integer,
  contacted_leads bigint,
  total_contacts bigint,
  successful_contacts bigint,
  successful_contact_rate_pct numeric,
  contacted_leads_later_enrolled bigint,
  organization_id uuid
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
with contact_time as (
  select
    l.organization_id,
    lcl.lead_id,
    lcl.contacted_at,
    lcl.outcome,
    extract(isodow from (lcl.contacted_at at time zone 'Asia/Kolkata'))::integer
      as iso_day_of_week,
    extract(hour from (lcl.contacted_at at time zone 'Asia/Kolkata'))::integer
      as hour_of_day
  from public.lead_contact_logs lcl
  join public.leads l on l.id = lcl.lead_id
  where public.has_workspace_access(l.organization_id, 'reports')
),
per_slot_lead as (
  select
    contact_time.organization_id,
    contact_time.iso_day_of_week,
    contact_time.hour_of_day,
    contact_time.lead_id,
    min(contact_time.contacted_at) as first_slot_contact_at,
    count(*) as contacts,
    count(*) filter (
      where contact_time.outcome in ('connected', 'replied')
    ) as successful_contacts
  from contact_time
  group by
    contact_time.organization_id,
    contact_time.iso_day_of_week,
    contact_time.hour_of_day,
    contact_time.lead_id
)
select
  psl.iso_day_of_week,
  case psl.iso_day_of_week
    when 1 then 'Monday'
    when 2 then 'Tuesday'
    when 3 then 'Wednesday'
    when 4 then 'Thursday'
    when 5 then 'Friday'
    when 6 then 'Saturday'
    when 7 then 'Sunday'
    else null::text
  end as day_name,
  psl.hour_of_day,
  count(distinct psl.lead_id) as contacted_leads,
  sum(psl.contacts)::bigint as total_contacts,
  sum(psl.successful_contacts)::bigint as successful_contacts,
  round(
    sum(psl.successful_contacts) / nullif(sum(psl.contacts), 0::numeric) * 100::numeric,
    2
  ) as successful_contact_rate_pct,
  count(distinct psl.lead_id) filter (
    where ci.enrolled_at is not null
      and ci.enrolled_at >= psl.first_slot_contact_at
  ) as contacted_leads_later_enrolled,
  psl.organization_id
from per_slot_lead psl
left join app_private.contact_intelligence_lead_workspace_rows() ci
  on ci.lead_id = psl.lead_id
 and ci.organization_id = psl.organization_id
group by psl.organization_id, psl.iso_day_of_week, psl.hour_of_day;
$function$;

revoke all on function app_private.contact_intelligence_lead_workspace_rows()
  from public, anon;
revoke all on function app_private.contact_intelligence_overview_workspace_rows()
  from public, anon;
revoke all on function app_private.contact_intelligence_employee_workspace_rows()
  from public, anon;
revoke all on function app_private.contact_intelligence_channel_workspace_rows()
  from public, anon;
revoke all on function app_private.contact_intelligence_outcome_workspace_rows()
  from public, anon;
revoke all on function app_private.contact_intelligence_time_ist_workspace_rows()
  from public, anon;

grant execute on function app_private.contact_intelligence_lead_workspace_rows()
  to authenticated, service_role;
grant execute on function app_private.contact_intelligence_overview_workspace_rows()
  to authenticated, service_role;
grant execute on function app_private.contact_intelligence_employee_workspace_rows()
  to authenticated, service_role;
grant execute on function app_private.contact_intelligence_channel_workspace_rows()
  to authenticated, service_role;
grant execute on function app_private.contact_intelligence_outcome_workspace_rows()
  to authenticated, service_role;
grant execute on function app_private.contact_intelligence_time_ist_workspace_rows()
  to authenticated, service_role;

create or replace view public.v_contact_intelligence_lead_workspace
with (security_invoker = true)
as
select * from app_private.contact_intelligence_lead_workspace_rows();

create or replace view public.v_contact_intelligence_overview_workspace
with (security_invoker = true)
as
select * from app_private.contact_intelligence_overview_workspace_rows();

create or replace view public.v_contact_intelligence_employee_workspace
with (security_invoker = true)
as
select * from app_private.contact_intelligence_employee_workspace_rows();

create or replace view public.v_contact_intelligence_channel_workspace
with (security_invoker = true)
as
select * from app_private.contact_intelligence_channel_workspace_rows();

create or replace view public.v_contact_intelligence_outcome_workspace
with (security_invoker = true)
as
select * from app_private.contact_intelligence_outcome_workspace_rows();

create or replace view public.v_contact_intelligence_time_ist_workspace
with (security_invoker = true)
as
select * from app_private.contact_intelligence_time_ist_workspace_rows();

revoke all on table public.v_contact_intelligence_lead_workspace
  from public, anon, authenticated;
revoke all on table public.v_contact_intelligence_overview_workspace
  from public, anon, authenticated;
revoke all on table public.v_contact_intelligence_employee_workspace
  from public, anon, authenticated;
revoke all on table public.v_contact_intelligence_channel_workspace
  from public, anon, authenticated;
revoke all on table public.v_contact_intelligence_outcome_workspace
  from public, anon, authenticated;
revoke all on table public.v_contact_intelligence_time_ist_workspace
  from public, anon, authenticated;

grant select on table public.v_contact_intelligence_lead_workspace
  to authenticated, service_role;
grant select on table public.v_contact_intelligence_overview_workspace
  to authenticated, service_role;
grant select on table public.v_contact_intelligence_employee_workspace
  to authenticated, service_role;
grant select on table public.v_contact_intelligence_channel_workspace
  to authenticated, service_role;
grant select on table public.v_contact_intelligence_outcome_workspace
  to authenticated, service_role;
grant select on table public.v_contact_intelligence_time_ist_workspace
  to authenticated, service_role;

comment on schema app_private is
  'Internal privileged query helpers. Not intended as a direct public API schema.';

comment on function app_private.contact_intelligence_lead_workspace_rows() is
  'Reports-workspace-scoped Contact Intelligence lead rows. SECURITY DEFINER with fixed search_path and has_workspace_access authorization.';

comment on function app_private.contact_intelligence_overview_workspace_rows() is
  'Reports-workspace-scoped Contact Intelligence overview rows. SECURITY DEFINER with fixed search_path.';

comment on function app_private.contact_intelligence_employee_workspace_rows() is
  'Reports-workspace-scoped Contact Intelligence employee rows. SECURITY DEFINER with fixed search_path and has_workspace_access authorization.';

comment on function app_private.contact_intelligence_channel_workspace_rows() is
  'Reports-workspace-scoped Contact Intelligence channel rows. SECURITY DEFINER with fixed search_path and has_workspace_access authorization.';

comment on function app_private.contact_intelligence_outcome_workspace_rows() is
  'Reports-workspace-scoped Contact Intelligence outcome rows. SECURITY DEFINER with fixed search_path and has_workspace_access authorization.';

comment on function app_private.contact_intelligence_time_ist_workspace_rows() is
  'Reports-workspace-scoped Contact Intelligence IST timing rows. SECURITY DEFINER with fixed search_path and has_workspace_access authorization.';

commit;
