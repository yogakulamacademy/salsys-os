create or replace function public.get_funnel_intelligence_workspace_v2(
  p_organization_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_result jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  with lead_base as (
    select l.id, l.created_at, l.current_stage::text as current_stage,
      coalesce(l.lead_creation_channel::text, 'unknown') as lead_creation_channel,
      coalesce(nullif(btrim(l.first_touch_source), ''), 'unknown') as first_touch_source
    from public.leads l
    where l.organization_id = p_organization_id and l.created_at >= v_start
  ),
  paid_by_lead as (
    select p.lead_id,
      bool_or(p.payment_kind::text <> 'refund' and p.status::text = 'paid') as is_paid,
      coalesce(sum(p.amount) filter (where p.payment_kind::text <> 'refund' and p.status::text = 'paid' and upper(coalesce(p.currency, '')) = 'INR'), 0)::numeric as revenue_inr,
      coalesce(sum(p.amount) filter (where p.payment_kind::text <> 'refund' and p.status::text = 'paid' and upper(coalesce(p.currency, '')) = 'USD'), 0)::numeric as revenue_usd
    from public.payments p join lead_base l on l.id = p.lead_id
    where p.organization_id = p_organization_id
    group by p.lead_id
  ),
  enrollment_by_lead as (
    select e.lead_id, bool_or(e.status::text in ('confirmed', 'completed')) as is_enrolled
    from public.enrollments e join lead_base l on l.id = e.lead_id
    where e.organization_id = p_organization_id
    group by e.lead_id
  ),
  lead_facts as (
    select l.*, coalesce(p.is_paid, false) as is_paid,
      coalesce(e.is_enrolled, false) or l.current_stage = 'enrolled' as is_enrolled,
      coalesce(p.revenue_inr, 0)::numeric as revenue_inr,
      coalesce(p.revenue_usd, 0)::numeric as revenue_usd,
      (l.current_stage in ('qualified','high_intent','payment_pending','enrolled')) as is_qualified
    from lead_base l
    left join paid_by_lead p on p.lead_id = l.id
    left join enrollment_by_lead e on e.lead_id = l.id
  ),
  business as (
    select count(*)::integer as leads,
      count(*) filter (where is_qualified)::integer as qualified,
      count(*) filter (where current_stage = 'payment_pending')::integer as payment_pending,
      count(*) filter (where is_paid)::integer as paid,
      count(*) filter (where is_enrolled)::integer as enrolled,
      coalesce(sum(revenue_inr), 0)::numeric as revenue_inr,
      coalesce(sum(revenue_usd), 0)::numeric as revenue_usd
    from lead_facts
  ),
  website_leads as (
    select count(*)::integer as leads,
      count(*) filter (where is_qualified)::integer as qualified,
      count(*) filter (where current_stage = 'payment_pending')::integer as payment_pending,
      count(*) filter (where is_paid)::integer as paid,
      count(*) filter (where is_enrolled)::integer as enrolled
    from lead_facts where lead_creation_channel = 'website'
  ),
  whatsapp_leads as (
    select count(*)::integer as leads,
      count(*) filter (where is_qualified)::integer as qualified,
      count(*) filter (where current_stage = 'payment_pending')::integer as payment_pending,
      count(*) filter (where is_paid)::integer as paid,
      count(*) filter (where is_enrolled)::integer as enrolled
    from lead_facts where lead_creation_channel = 'whatsapp'
  ),
  web as (
    select count(*)::integer as sessions,
      count(distinct ws.anonymous_visitor_id)::integer as visitors,
      count(distinct ws.lead_id) filter (where ws.lead_id is not null)::integer as linked_leads
    from public.web_sessions ws
    where ws.organization_id = p_organization_id and ws.started_at >= v_start
  ),
  web_events as (
    select
      count(distinct t.web_session_id) filter (
        where t.web_session_id is not null and t.event_type in (
          'form_start','lead_form_submit','enrollment_cta_click','whatsapp_click','instagram_click',
          'course_enquire_click','reservation_start','payment_start','brochure_download'
        )
      )::integer as engaged_sessions,
      count(distinct t.web_session_id) filter (where t.event_type = 'form_start' and t.web_session_id is not null)::integer as form_start_sessions,
      count(distinct t.web_session_id) filter (where t.event_type = 'lead_form_submit' and t.web_session_id is not null)::integer as form_submit_sessions
    from public.touchpoints t
    where t.organization_id = p_organization_id and t.occurred_at >= v_start
  ),
  source_rows as (
    select lf.first_touch_source as source,
      count(*)::integer as leads,
      count(*) filter (where lf.is_qualified)::integer as qualified,
      count(*) filter (where lf.is_paid)::integer as paid,
      count(*) filter (where lf.is_enrolled)::integer as enrolled,
      coalesce(sum(lf.revenue_inr), 0)::numeric as revenue_inr,
      coalesce(sum(lf.revenue_usd), 0)::numeric as revenue_usd
    from lead_facts lf group by lf.first_touch_source
  ),
  source_json as (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.leads desc, s.source asc), '[]'::jsonb) as rows from source_rows s
  ),
  daily_days as (
    select generate_series((current_date - (v_days - 1))::date, current_date, interval '1 day')::date as date
  ),
  daily_web as (
    select (ws.started_at at time zone 'Asia/Kolkata')::date as date, count(*)::integer as sessions
    from public.web_sessions ws
    where ws.organization_id = p_organization_id and ws.started_at >= v_start
    group by 1
  ),
  daily_leads as (
    select (lf.created_at at time zone 'Asia/Kolkata')::date as date,
      count(*)::integer as leads,
      count(*) filter (where lf.is_qualified)::integer as qualified,
      count(*) filter (where lf.is_enrolled)::integer as enrolled
    from lead_facts lf group by 1
  ),
  daily_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', d.date,
      'sessions', coalesce(w.sessions, 0),
      'leads', coalesce(l.leads, 0),
      'qualified', coalesce(l.qualified, 0),
      'enrolled', coalesce(l.enrolled, 0)
    ) order by d.date), '[]'::jsonb) as rows
    from daily_days d
    left join daily_web w on w.date = d.date
    left join daily_leads l on l.date = d.date
  ),
  measurement as (
    select count(*)::integer as total_leads,
      count(*) filter (where first_touch_source <> 'unknown')::integer as known_first_touch,
      count(*) filter (where first_touch_source = 'unknown')::integer as unknown_first_touch
    from lead_facts
  )
  select jsonb_build_object(
    'status', jsonb_build_object('available', true, 'window_days', v_days, 'generated_at', now()),
    'overview', jsonb_build_object(
      'visitors', w.visitors, 'sessions', w.sessions, 'leads', b.leads, 'qualified', b.qualified,
      'payment_pending', b.payment_pending, 'paid', b.paid, 'enrolled', b.enrolled,
      'revenue_inr', b.revenue_inr, 'revenue_usd', b.revenue_usd
    ),
    'journeys', jsonb_build_array(
      jsonb_build_object(
        'key', 'business', 'label', 'Cross-channel business',
        'description', 'All CRM leads created in the selected reporting window.',
        'stages', jsonb_build_array(
          jsonb_build_object('key','leads','label','CRM leads','count',b.leads,'unit','people'),
          jsonb_build_object('key','qualified','label','Qualified','count',b.qualified,'unit','people'),
          jsonb_build_object('key','payment_pending','label','Payment pending','count',b.payment_pending,'unit','people'),
          jsonb_build_object('key','paid','label','Paid','count',b.paid,'unit','people'),
          jsonb_build_object('key','enrolled','label','Enrolled','count',b.enrolled,'unit','people')
        )
      ),
      jsonb_build_object(
        'key', 'website', 'label', 'Website form',
        'description', 'Observed website sessions and form events, followed by website-created CRM leads.',
        'stages', jsonb_build_array(
          jsonb_build_object('key','sessions','label','Sessions','count',w.sessions,'unit','sessions'),
          jsonb_build_object('key','engaged','label','Engaged','count',we.engaged_sessions,'unit','sessions'),
          jsonb_build_object('key','form_start','label','Form starts','count',we.form_start_sessions,'unit','sessions'),
          jsonb_build_object('key','form_submit','label','Submissions','count',we.form_submit_sessions,'unit','sessions'),
          jsonb_build_object('key','leads','label','CRM leads','count',wl.leads,'unit','people'),
          jsonb_build_object('key','qualified','label','Qualified','count',wl.qualified,'unit','people'),
          jsonb_build_object('key','paid','label','Paid','count',wl.paid,'unit','people'),
          jsonb_build_object('key','enrolled','label','Enrolled','count',wl.enrolled,'unit','people')
        )
      ),
      jsonb_build_object(
        'key', 'whatsapp', 'label', 'WhatsApp',
        'description', 'CRM leads created through WhatsApp and their downstream sales outcomes.',
        'stages', jsonb_build_array(
          jsonb_build_object('key','leads','label','CRM leads','count',wa.leads,'unit','people'),
          jsonb_build_object('key','qualified','label','Qualified','count',wa.qualified,'unit','people'),
          jsonb_build_object('key','payment_pending','label','Payment pending','count',wa.payment_pending,'unit','people'),
          jsonb_build_object('key','paid','label','Paid','count',wa.paid,'unit','people'),
          jsonb_build_object('key','enrolled','label','Enrolled','count',wa.enrolled,'unit','people')
        )
      )
    ),
    'sources', sj.rows,
    'daily', dj.rows,
    'measurement', jsonb_build_object(
      'total_leads', m.total_leads,
      'known_first_touch', m.known_first_touch,
      'unknown_first_touch', m.unknown_first_touch,
      'first_touch_coverage', case when m.total_leads > 0 then round((m.known_first_touch::numeric / m.total_leads::numeric) * 100, 1) else null end,
      'web_linked_leads', w.linked_leads,
      'website_created_leads', wl.leads,
      'form_submit_sessions', we.form_submit_sessions
    )
  ) into v_result
  from business b
  cross join website_leads wl
  cross join whatsapp_leads wa
  cross join web w
  cross join web_events we
  cross join source_json sj
  cross join daily_json dj
  cross join measurement m;

  return v_result;
end;
$function$;

grant execute on function public.get_funnel_intelligence_workspace_v2(uuid, integer) to authenticated;
grant execute on function public.get_funnel_intelligence_workspace_v2(uuid, integer) to service_role;
