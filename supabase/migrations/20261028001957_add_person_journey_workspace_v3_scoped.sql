create or replace function public.get_person_journey_workspace_v3(
  p_organization_id uuid,
  p_lead_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_person_id uuid;
  v_person jsonb;
  v_journey jsonb := '[]'::jsonb;
  v_journey_total integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if p_organization_id is null or p_lead_id is null then
    raise exception 'Organization ID and lead ID are required';
  end if;

  if not public.is_organization_member(p_organization_id)
     or not public.can_access_lead(p_lead_id) then
    raise exception 'Not authorized for requested lead';
  end if;

  select pl.person_id
    into v_person_id
  from public.person_leads pl
  where pl.organization_id = p_organization_id
    and pl.lead_id = p_lead_id
  limit 1;

  if v_person_id is null then
    return jsonb_build_object(
      'person_id', null,
      'person', null,
      'journey', '[]'::jsonb,
      'journey_total', 0
    );
  end if;

  with person_lead_rows as (
    select
      l.id as lead_id,
      l.organization_id,
      l.lead_code,
      l.display_name,
      l.first_name,
      l.last_name,
      l.current_stage,
      l.status as lead_status,
      l.intent,
      l.owner_user_id,
      l.next_followup_at,
      l.last_contacted_at,
      l.last_inbound_at,
      l.last_outbound_at,
      l.created_at as lead_created_at,
      l.updated_at as lead_updated_at,
      row_number() over (
        order by l.created_at desc, l.updated_at desc, l.id desc
      ) as latest_rank
    from public.person_leads pl
    join public.leads l
      on l.organization_id = pl.organization_id
     and l.id = pl.lead_id
    where pl.organization_id = p_organization_id
      and pl.person_id = v_person_id
  ),
  lead_rollup as (
    select
      count(*) as lead_count,
      min(lead_created_at) as first_lead_at,
      max(lead_created_at) as latest_lead_at,
      max(last_contacted_at) as last_contacted_at,
      max(last_inbound_at) as last_inbound_at,
      max(last_outbound_at) as last_outbound_at
    from person_lead_rows
  ),
  latest_lead as (
    select *
    from person_lead_rows
    where latest_rank = 1
  ),
  identifier_ranked as (
    select
      pi.identifier_type,
      pi.normalized_value,
      pi.verified,
      pi.confidence,
      pi.last_seen_at,
      pi.id,
      row_number() over (
        partition by pi.identifier_type
        order by pi.verified desc, pi.confidence desc, pi.last_seen_at desc, pi.id desc
      ) as rn
    from public.person_identifiers pi
    where pi.organization_id = p_organization_id
      and pi.person_id = v_person_id
  ),
  identifier_rollup as (
    select
      count(*) as identifier_count,
      count(*) filter (where verified) as verified_identifier_count,
      max(normalized_value) filter (where identifier_type = 'email' and rn = 1) as primary_email,
      max(normalized_value) filter (where identifier_type = 'phone' and rn = 1) as primary_phone,
      max(normalized_value) filter (where identifier_type = 'whatsapp' and rn = 1) as primary_whatsapp
    from identifier_ranked
  ),
  session_rollup as (
    select
      count(distinct ps.web_session_id) as session_count,
      min(ws.started_at) as first_session_at,
      max(coalesce(ws.last_seen_at, ws.ended_at, ws.started_at)) as last_session_at,
      count(distinct ps.web_session_id) filter (
        where ws.started_at >= now() - interval '7 days'
      ) as sessions_7d,
      count(distinct ps.web_session_id) filter (
        where ws.started_at >= now() - interval '30 days'
      ) as sessions_30d
    from public.person_sessions ps
    join public.web_sessions ws
      on ws.organization_id = ps.organization_id
     and ws.id = ps.web_session_id
    where ps.organization_id = p_organization_id
      and ps.person_id = v_person_id
  ),
  person_touchpoint_rows as (
    select t.id, t.event_type, t.occurred_at
    from person_lead_rows plr
    join public.touchpoints t
      on t.organization_id = plr.organization_id
     and t.lead_id = plr.lead_id
    union
    select t.id, t.event_type, t.occurred_at
    from public.person_sessions ps
    join public.touchpoints t
      on t.organization_id = ps.organization_id
     and t.web_session_id = ps.web_session_id
    where ps.organization_id = p_organization_id
      and ps.person_id = v_person_id
  ),
  touchpoint_rollup as (
    select
      count(*) as touchpoint_count,
      count(*) filter (where event_type = 'page_view') as page_view_count,
      count(*) filter (
        where occurred_at >= now() - interval '7 days'
          and event_type = any(array[
            'lead_form_submit',
            'course_enquire_click',
            'whatsapp_click',
            'reservation_start',
            'payment_start'
          ]::text[])
      ) as high_intent_events_7d,
      min(occurred_at) as first_touchpoint_at,
      max(occurred_at) as last_touchpoint_at
    from person_touchpoint_rows
  ),
  conversation_rollup as (
    select
      count(distinct c.id) as conversation_count,
      max(coalesce(c.last_message_at, c.started_at, c.created_at)) as last_conversation_activity_at
    from person_lead_rows plr
    join public.conversations c
      on c.organization_id = plr.organization_id
     and c.lead_id = plr.lead_id
  ),
  message_rollup as (
    select
      count(distinct m.id) as message_count,
      max(coalesce(m.received_at, m.sent_at, m.created_at)) as last_message_at
    from person_lead_rows plr
    join public.messages m
      on m.organization_id = plr.organization_id
     and m.lead_id = plr.lead_id
  ),
  enrollment_rollup as (
    select
      count(distinct e.id) as enrollment_count,
      count(distinct e.id) filter (
        where e.status::text = any(array['confirmed','completed']::text[])
      ) as confirmed_or_completed_enrollment_count,
      max(coalesce(e.enrolled_at, e.created_at)) as last_enrollment_at
    from person_lead_rows plr
    join public.enrollments e
      on e.organization_id = plr.organization_id
     and e.lead_id = plr.lead_id
  ),
  payment_rows as (
    select p.*
    from person_lead_rows plr
    join public.payments p
      on p.organization_id = plr.organization_id
     and p.lead_id = plr.lead_id
  ),
  payment_counts as (
    select
      count(distinct id) as payment_count,
      count(distinct id) filter (where status::text = 'paid') as paid_payment_count,
      max(paid_at) filter (where status::text = 'paid') as last_paid_at
    from payment_rows
  ),
  paid_by_currency as (
    select currency, sum(amount) as paid_amount
    from payment_rows
    where status::text = 'paid'
    group by currency
  ),
  payment_currency_rollup as (
    select
      count(*) as paid_currency_count,
      coalesce(
        jsonb_object_agg(currency, to_jsonb(paid_amount) order by currency),
        '{}'::jsonb
      ) as paid_amount_by_currency
    from paid_by_currency
  ),
  latest_signal as (
    select
      j.engagement_score,
      j.behaviour_temperature,
      j.behaviour_reason
    from latest_lead ll
    left join public.v_lead_journey_intelligence j
      on j.organization_id = ll.organization_id
     and j.lead_id = ll.lead_id
  )
  select to_jsonb(x)
    into v_person
  from (
    select
      p.id as person_id,
      p.organization_id,
      p.status as person_status,
      ir.primary_email,
      ir.primary_phone,
      ir.primary_whatsapp,
      coalesce(ir.identifier_count, 0) as identifier_count,
      coalesce(ir.verified_identifier_count, 0) as verified_identifier_count,
      coalesce(lr.lead_count, 0) as lead_count,
      lr.first_lead_at,
      lr.latest_lead_at,
      ll.lead_id as latest_lead_id,
      ll.lead_code as latest_lead_code,
      coalesce(
        nullif(btrim(ll.display_name), ''),
        nullif(btrim(concat_ws(' ', ll.first_name, ll.last_name)), ''),
        ll.lead_code
      ) as latest_lead_name,
      ll.current_stage,
      ll.lead_status,
      ll.intent,
      ll.owner_user_id,
      ll.next_followup_at,
      lr.last_contacted_at,
      lr.last_inbound_at,
      lr.last_outbound_at,
      coalesce(sr.session_count, 0) as session_count,
      sr.first_session_at,
      sr.last_session_at,
      coalesce(sr.sessions_7d, 0) as sessions_7d,
      coalesce(sr.sessions_30d, 0) as sessions_30d,
      coalesce(tr.touchpoint_count, 0) as touchpoint_count,
      coalesce(tr.page_view_count, 0) as page_view_count,
      coalesce(tr.high_intent_events_7d, 0) as high_intent_events_7d,
      tr.first_touchpoint_at,
      tr.last_touchpoint_at,
      ls.engagement_score as latest_lead_engagement_score,
      ls.behaviour_temperature as latest_lead_behaviour_temperature,
      ls.behaviour_reason as latest_lead_behaviour_reason,
      coalesce(cr.conversation_count, 0) as conversation_count,
      coalesce(mr.message_count, 0) as message_count,
      cr.last_conversation_activity_at,
      mr.last_message_at,
      coalesce(er.enrollment_count, 0) as enrollment_count,
      coalesce(er.confirmed_or_completed_enrollment_count, 0) as confirmed_or_completed_enrollment_count,
      er.last_enrollment_at,
      coalesce(pc.payment_count, 0) as payment_count,
      coalesce(pc.paid_payment_count, 0) as paid_payment_count,
      pc.last_paid_at,
      coalesce(pcr.paid_currency_count, 0) as paid_currency_count,
      coalesce(pcr.paid_amount_by_currency, '{}'::jsonb) as paid_amount_by_currency
    from public.persons p
    cross join identifier_rollup ir
    cross join lead_rollup lr
    left join latest_lead ll on true
    cross join session_rollup sr
    cross join touchpoint_rollup tr
    left join latest_signal ls on true
    cross join conversation_rollup cr
    cross join message_rollup mr
    cross join enrollment_rollup er
    cross join payment_counts pc
    cross join payment_currency_rollup pcr
    where p.organization_id = p_organization_id
      and p.id = v_person_id
  ) x;

  if v_person is not null and not public.can_view_lead_pii() then
    v_person := (v_person - 'primary_email' - 'primary_phone' - 'primary_whatsapp')
      || jsonb_build_object(
        'primary_email', null,
        'primary_phone', null,
        'primary_whatsapp', null
      );
  end if;

  select count(*)::integer
    into v_journey_total
  from public.v_person_journey j
  where j.organization_id = p_organization_id
    and j.person_id = v_person_id;

  select coalesce(
    jsonb_agg(to_jsonb(j) order by j.event_at desc, j.journey_event_key desc),
    '[]'::jsonb
  )
    into v_journey
  from (
    select *
    from public.v_person_journey
    where organization_id = p_organization_id
      and person_id = v_person_id
    order by event_at desc, journey_event_key desc
    limit v_limit
  ) j;

  return jsonb_build_object(
    'person_id', v_person_id,
    'person', v_person,
    'journey', v_journey,
    'journey_total', coalesce(v_journey_total, 0)
  );
end;
$function$;

revoke all on function public.get_person_journey_workspace_v3(uuid, uuid, integer) from public;
revoke all on function public.get_person_journey_workspace_v3(uuid, uuid, integer) from anon;
grant execute on function public.get_person_journey_workspace_v3(uuid, uuid, integer) to authenticated;
grant execute on function public.get_person_journey_workspace_v3(uuid, uuid, integer) to service_role;
