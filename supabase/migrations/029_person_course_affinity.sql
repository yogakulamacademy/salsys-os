-- ============================================================
-- MIGRATION 029
-- CANONICAL PERSON × COURSE AFFINITY
--
-- Creates:
--   v_person_course_affinity
--   v_person_course_recommendation
--
-- Does NOT:
--   update leads.interested_course_id
--   update leads.intent
--   create another generic lead_score
--   attach anonymous browser history to Persons
-- ============================================================

begin;


-- ============================================================
-- 1. PERSON × COURSE AFFINITY
-- ============================================================

create or replace view public.v_person_course_affinity
with (security_invoker = true)
as

with

-- ------------------------------------------------------------
-- EXPLICIT CRM INTEREST
-- ------------------------------------------------------------

explicit_signals as (
  select distinct
    l.organization_id,
    pl.person_id,
    l.id as lead_id,
    l.interested_course_id as course_id,

    'explicit_interest'::text
      as signal_type,

    100::integer
      as signal_strength,

    l.updated_at
      as signal_at,

    'crm_interested_course'::text
      as reason_code

  from public.leads l

  join public.person_leads pl
    on pl.organization_id =
       l.organization_id

   and pl.lead_id =
       l.id

  where l.interested_course_id
        is not null
),


-- ------------------------------------------------------------
-- SERVER CAPTURE EVIDENCE
-- ------------------------------------------------------------

capture_candidates as (
  select
    lie.organization_id,
    lie.lead_id,
    lie.received_at,

    nullif(
      btrim(
        coalesce(
          lie.metadata ->> 'course_raw',
          ''
        )
      ),
      ''
    ) as course_raw

  from public.lead_ingest_events lie

  where lie.source_system =
        'website'
),

capture_resolved as (
  select
    cc.organization_id,
    cc.lead_id,
    cc.received_at,

    r.course_id

  from capture_candidates cc

  left join lateral
    public.resolve_course_capture_value(
      cc.organization_id,
      'website',
      cc.course_raw
    ) r
    on true

  where cc.course_raw is not null
),

capture_signals as (
  select
    cr.organization_id,
    pl.person_id,
    cr.lead_id,
    cr.course_id,

    'capture_value'::text
      as signal_type,

    80::integer
      as signal_strength,

    max(
      cr.received_at
    ) as signal_at,

    'server_capture_course'::text
      as reason_code

  from capture_resolved cr

  join public.person_leads pl
    on pl.organization_id =
       cr.organization_id

   and pl.lead_id =
       cr.lead_id

  where cr.course_id is not null

  group by
    cr.organization_id,
    pl.person_id,
    cr.lead_id,
    cr.course_id
),


-- ------------------------------------------------------------
-- RAW WEBSITE COURSE EVENTS
-- ------------------------------------------------------------

website_events as (
  select
    re.id as raw_event_id,
    re.organization_id,
    re.source_event_id,
    re.session_key,

    re.source_event_type
      as event_name,

    re.occurred_at,

    coalesce(

      nullif(
        re.payload ->> 'courseId',
        ''
      ),

      nullif(
        re.payload ->> 'course_id',
        ''
      ),

      nullif(
        re.payload
          -> 'metadata'
          ->> 'course_id',
        ''
      ),

      nullif(
        re.metadata ->> 'course_id',
        ''
      ),

      nullif(
        (
          regexp_match(
            coalesce(
              re.payload ->> 'pageUrl',
              ''
            ),
            '[?&]course_id=([^&#]+)'
          )
        )[1],
        ''
      )

    ) as tracking_key,

    coalesce(
      nullif(
        re.payload ->> 'pagePath',
        ''
      ),

      nullif(
        re.payload ->> 'page_path',
        ''
      ),

      nullif(
        re.payload
          -> 'metadata'
          ->> 'page_path',
        ''
      )
    ) as page_path,

    coalesce(
      nullif(
        re.payload ->> 'pageUrl',
        ''
      ),

      nullif(
        re.payload ->> 'page_url',
        ''
      )
    ) as page_url

  from public.raw_events re

  where re.source_system =
        'website'
),


-- ------------------------------------------------------------
-- EXACT EVENT / SESSION IDENTITY BRIDGES
--
-- No anonymous_visitor_id historical linking.
-- ------------------------------------------------------------

behavior_identity_candidates as (
  select
    we.*,

    tp.lead_id
      as touchpoint_lead_id,

    ws.id
      as web_session_id,

    ws.lead_id
      as session_lead_id,

    tp_person.person_id
      as touchpoint_person_id,

    session_person.person_id
      as session_person_id,

    session_lead_person.person_id
      as session_lead_person_id

  from website_events we


  -- Exact raw event → touchpoint.
  left join lateral (
    select
      t.lead_id

    from public.touchpoints t

    where t.organization_id =
          we.organization_id

      and t.event_id =
          we.source_event_id

    order by t.id

    limit 1
  ) tp
    on true


  -- Exact raw session → canonical web session.
  left join public.web_sessions ws
    on ws.organization_id =
       we.organization_id

   and ws.session_key =
       we.session_key


  -- Exact touchpoint Lead → Person.
  left join public.person_leads tp_person
    on tp_person.organization_id =
       we.organization_id

   and tp_person.lead_id =
       tp.lead_id


  -- Exact canonical session → Person.
  left join public.person_sessions session_person
    on session_person.organization_id =
       we.organization_id

   and session_person.web_session_id =
       ws.id


  -- Exact canonical session's Lead → Person.
  left join public.person_leads session_lead_person
    on session_lead_person.organization_id =
       we.organization_id

   and session_lead_person.lead_id =
       ws.lead_id
),

behavior_identity as (
  select
    b.*,

    case

      when
        b.touchpoint_person_id is not null
        and b.session_person_id is not null
        and b.touchpoint_person_id <>
            b.session_person_id
      then true

      when
        b.touchpoint_person_id is not null
        and b.session_lead_person_id is not null
        and b.touchpoint_person_id <>
            b.session_lead_person_id
      then true

      when
        b.session_person_id is not null
        and b.session_lead_person_id is not null
        and b.session_person_id <>
            b.session_lead_person_id
      then true

      else false

    end as identity_conflict,


    case

      when
        (
          b.touchpoint_person_id is not null
          and b.session_person_id is not null
          and b.touchpoint_person_id <>
              b.session_person_id
        )

        or

        (
          b.touchpoint_person_id is not null
          and b.session_lead_person_id is not null
          and b.touchpoint_person_id <>
              b.session_lead_person_id
        )

        or

        (
          b.session_person_id is not null
          and b.session_lead_person_id is not null
          and b.session_person_id <>
              b.session_lead_person_id
        )

      then null

      else coalesce(
        b.touchpoint_person_id,
        b.session_person_id,
        b.session_lead_person_id
      )

    end as person_id

  from behavior_identity_candidates b
),


-- ------------------------------------------------------------
-- RESOLVE SAFE BEHAVIOR TO COURSE
-- ------------------------------------------------------------

behavior_courses as (
  select
    bi.*,

    r.course_id

  from behavior_identity bi

  left join lateral
    public.resolve_course_tracking_signal(
      bi.organization_id,
      'website',
      bi.tracking_key,
      bi.page_path,
      bi.page_url
    ) r
    on true

  where bi.person_id is not null
    and bi.identity_conflict = false
),

behavior_signals as (
  select
    bc.organization_id,
    bc.person_id,

    coalesce(
      bc.touchpoint_lead_id,
      bc.session_lead_id
    ) as lead_id,

    bc.course_id,

    'behavior'::text
      as signal_type,

    case bc.event_name

      when 'enrollment_cta_click'
        then 70

      when 'lead_form_submit'
        then 60

      when 'form_start'
        then 35

      when 'page_view'
        then 10

      else 0

    end::integer
      as signal_strength,

    bc.occurred_at
      as signal_at,

    case bc.event_name

      when 'enrollment_cta_click'
        then 'enrollment_cta_click'

      when 'lead_form_submit'
        then 'course_form_submit'

      when 'form_start'
        then 'course_form_start'

      when 'page_view'
        then 'course_page_view'

      else 'other_course_behavior'

    end::text
      as reason_code

  from behavior_courses bc

  where bc.course_id is not null

    and bc.event_name in (
      'page_view',
      'form_start',
      'lead_form_submit',
      'enrollment_cta_click'
    )
),


-- ------------------------------------------------------------
-- TRUSTWORTHY SIGNAL UNION
-- ------------------------------------------------------------

all_signals as (

  select *
  from explicit_signals

  union all

  select *
  from capture_signals

  union all

  select *
  from behavior_signals
),


-- ------------------------------------------------------------
-- PERSON × COURSE EVIDENCE ROLLUP
-- ------------------------------------------------------------

person_course as (
  select
    s.organization_id,
    s.person_id,
    s.course_id,

    count(
      distinct s.lead_id
    ) filter (
      where s.signal_type =
            'explicit_interest'
    ) as explicit_leads,

    count(
      distinct s.lead_id
    ) filter (
      where s.signal_type =
            'capture_value'
    ) as capture_leads,

    count(*) filter (
      where s.signal_type =
            'behavior'
    ) as behavior_events,

    count(*) filter (
      where s.reason_code =
            'course_page_view'
    ) as course_page_views,

    count(*) filter (
      where s.reason_code =
            'course_form_start'
    ) as course_form_starts,

    count(*) filter (
      where s.reason_code =
            'course_form_submit'
    ) as course_form_submits,

    count(*) filter (
      where s.reason_code =
            'enrollment_cta_click'
    ) as enrollment_cta_clicks,

    coalesce(
      sum(
        s.signal_strength
      ) filter (
        where s.signal_type =
              'behavior'
      ),
      0
    ) as raw_behavior_points,

    min(s.signal_at)
      as first_signal_at,

    max(s.signal_at)
      as last_signal_at,

    array_agg(
      distinct s.reason_code
      order by s.reason_code
    ) as reason_codes

  from all_signals s

  group by
    s.organization_id,
    s.person_id,
    s.course_id
)

select
  pc.organization_id,
  pc.person_id,
  pc.course_id,

  c.code
    as course_code,

  c.name
    as course_name,

  (pc.explicit_leads > 0)
    as has_explicit_interest,

  pc.explicit_leads,
  pc.capture_leads,
  pc.behavior_events,

  pc.course_page_views,
  pc.course_form_starts,
  pc.course_form_submits,
  pc.enrollment_cta_clicks,

  pc.raw_behavior_points,

  least(
    pc.raw_behavior_points,
    75
  )::integer
    as behavior_score,

  greatest(

    case
      when pc.explicit_leads > 0
        then 100
      else 0
    end,

    case
      when pc.capture_leads > 0
        then 80
      else 0
    end,

    least(
      pc.raw_behavior_points,
      75
    )

  )::integer
    as affinity_score,

  case

    when pc.explicit_leads > 0
      then 'explicit_interest'

    when pc.capture_leads > 0
      then 'server_capture'

    when pc.raw_behavior_points > 0
      then 'behavior'

    else 'unknown'

  end::text
    as primary_evidence,

  pc.first_signal_at,
  pc.last_signal_at,
  pc.reason_codes

from person_course pc

join public.courses c
  on c.organization_id =
     pc.organization_id

 and c.id =
     pc.course_id

where c.active = true;


-- ============================================================
-- 2. RECOMMENDED COURSE
--
-- One row per Person with affinity.
--
-- Precedence:
--   explicit interest
--   server capture
--   affinity score
--   recency
-- ============================================================

create or replace view public.v_person_course_recommendation
with (security_invoker = true)
as

with ranked as (
  select
    a.*,

    count(*) over (
      partition by
        a.organization_id,
        a.person_id
    ) as candidate_course_count,

    row_number() over (
      partition by
        a.organization_id,
        a.person_id

      order by
        a.has_explicit_interest desc,
        (a.capture_leads > 0) desc,
        a.affinity_score desc,
        a.last_signal_at desc nulls last,
        a.course_code
    ) as recommendation_rank

  from public.v_person_course_affinity a
)

select
  organization_id,
  person_id,

  course_id
    as recommended_course_id,

  course_code
    as recommended_course_code,

  course_name
    as recommended_course_name,

  affinity_score
    as recommended_affinity_score,

  primary_evidence
    as recommendation_basis,

  has_explicit_interest,
  explicit_leads,
  capture_leads,
  behavior_events,

  reason_codes
    as recommendation_reason_codes,

  first_signal_at,
  last_signal_at,

  candidate_course_count

from ranked

where recommendation_rank = 1;


-- ============================================================
-- 3. PERMISSIONS
-- ============================================================

revoke all
on public.v_person_course_affinity
from public, anon;


revoke all
on public.v_person_course_recommendation
from public, anon;


grant select
on public.v_person_course_affinity
to authenticated, service_role;


grant select
on public.v_person_course_recommendation
to authenticated, service_role;


commit;