begin;

-- ============================================================
-- MIGRATION 035
-- CONVERSION FEEDBACK MATCH CONTEXT
--
-- Purpose:
--
-- Resolve the privacy-safe first-party match context required
-- by the outbound conversion-feedback worker.
--
-- Guarantees:
--
--   * tenant-scoped lead validation
--   * conversion-time consent semantics
--   * tri-state consent remains true / false / null
--   * partial consent events do not erase earlier explicit state
--   * analytics consent never implies ad_user_data consent
--   * no advertising match data unless ad_user_data = true
--   * no identifiers are fabricated
--   * contacts created after conversion_at are not exposed
--   * tracking signals observed after conversion_at are not exposed
--   * function is service-role-only
--
-- Important:
--
-- This function DOES NOT:
--
--   * send provider requests
--   * hash provider identifiers
--   * persist PII into feedback deliveries / attempts
--   * mutate consent history
--   * mutate lead identity
--
-- Provider adapters must normalize/hash identifiers in memory
-- according to the current Google / Meta API contract.
-- ============================================================


create or replace function
public.resolve_conversion_feedback_match_context(
  p_organization_id uuid,
  p_lead_id uuid,
  p_conversion_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path =
  'public',
  'pg_temp'
as $function$

declare
  v_result jsonb;

begin

  -- ==========================================================
  -- 1. REQUIRED INPUTS
  -- ==========================================================

  if p_organization_id is null then
    raise exception
      'organization_id is required';
  end if;

  if p_lead_id is null then
    raise exception
      'lead_id is required';
  end if;

  if p_conversion_at is null then
    raise exception
      'conversion_at is required';
  end if;


  -- ==========================================================
  -- 2. TENANT VALIDATION
  -- ==========================================================

  if not exists (
    select 1
    from public.organizations o
    where o.id =
      p_organization_id
  ) then

    raise exception
      'organization does not exist';

  end if;


  /*
   * Deliberately use the same generic failure for:
   *
   *   - unknown lead
   *   - cross-tenant lead
   *
   * so this function cannot be used to discover another
   * organization's lead identifiers.
   */
  if not exists (
    select 1
    from public.leads l
    where l.id =
      p_lead_id
      and l.organization_id =
        p_organization_id
  ) then

    raise exception
      'lead not found in organization';

  end if;


  -- ==========================================================
  -- 3. RESOLVE CONTEXT
  -- ==========================================================

  with

  -- ----------------------------------------------------------
  -- Browser visitor identities currently attached to this lead.
  --
  -- Historical identity attachment is intentional: the identity
  -- system can later establish that an earlier anonymous journey
  -- belonged to this lead.
  -- ----------------------------------------------------------

  lead_visitors as (

    select distinct
      x.anonymous_visitor_id

    from (

      select
        vil.anonymous_visitor_id

      from public.visitor_identity_links vil

      where vil.organization_id =
          p_organization_id

        and vil.lead_id =
          p_lead_id


      union all


      select
        ws.anonymous_visitor_id

      from public.web_sessions ws

      where ws.organization_id =
          p_organization_id

        and ws.lead_id =
          p_lead_id


      union all


      select
        tp.anonymous_visitor_id

      from public.touchpoints tp

      where tp.organization_id =
          p_organization_id

        and tp.lead_id =
          p_lead_id

    ) x

    where nullif(
      btrim(
        x.anonymous_visitor_id
      ),
      ''
    ) is not null

  ),


  -- ----------------------------------------------------------
  -- Session keys known through explicit identity links.
  -- ----------------------------------------------------------

  identity_link_session_keys as (

    select distinct
      vil.last_session_key
        as session_key

    from public.visitor_identity_links vil

    where vil.organization_id =
        p_organization_id

      and vil.lead_id =
        p_lead_id

      and nullif(
        btrim(
          vil.last_session_key
        ),
        ''
      ) is not null

  ),


  -- ----------------------------------------------------------
  -- All sessions belonging to the lead's resolved browser
  -- identity family.
  -- ----------------------------------------------------------

  lead_web_sessions as (

    select distinct
      ws.id,
      ws.session_key,
      ws.anonymous_visitor_id

    from public.web_sessions ws

    where ws.organization_id =
        p_organization_id

      and (

        ws.lead_id =
          p_lead_id

        or exists (

          select 1

          from lead_visitors lv

          where lv.anonymous_visitor_id =
            ws.anonymous_visitor_id

        )

        or (

          ws.session_key is not null

          and exists (

            select 1

            from identity_link_session_keys isk

            where isk.session_key =
              ws.session_key

          )

        )

      )

  ),


  -- ----------------------------------------------------------
  -- Complete session-key identity family.
  -- ----------------------------------------------------------

  lead_sessions as (

    select distinct
      x.session_key

    from (

      select
        lws.session_key

      from lead_web_sessions lws


      union all


      select
        isk.session_key

      from identity_link_session_keys isk

    ) x

    where nullif(
      btrim(
        x.session_key
      ),
      ''
    ) is not null

  ),


  -- ----------------------------------------------------------
  -- Consent events belonging to this resolved lead identity,
  -- restricted to the state that existed AT OR BEFORE the
  -- conversion.
  --
  -- received_at is only a deterministic tie-breaker.
  -- occurred_at remains the consent-time authority.
  -- ----------------------------------------------------------

  scoped_consent as (

    select
      e.*

    from public.tracking_consent_events e

    where e.organization_id =
        p_organization_id

      and e.occurred_at <=
        p_conversion_at

      and (

        (
          e.anonymous_visitor_id
            is not null

          and exists (

            select 1

            from lead_visitors lv

            where lv.anonymous_visitor_id =
              e.anonymous_visitor_id

          )

        )

        or

        (
          e.session_key
            is not null

          and exists (

            select 1

            from lead_sessions ls

            where ls.session_key =
              e.session_key

          )

        )

      )

  ),


  -- ----------------------------------------------------------
  -- Each consent category is resolved independently.
  --
  -- This is critical because a later analytics-only event with
  -- ad_user_data = NULL must NOT erase an earlier explicit
  -- grant or revocation.
  -- ----------------------------------------------------------

  analytics_state as (

    select
      e.id,
      e.source_event_id,
      e.occurred_at,
      e.consent_analytics
        as value

    from scoped_consent e

    where e.consent_analytics
      is not null

    order by
      e.occurred_at desc,
      e.received_at desc,
      e.id desc

    limit 1

  ),


  ad_user_data_state as (

    select
      e.id,
      e.source_event_id,
      e.occurred_at,
      e.consent_ad_user_data
        as value

    from scoped_consent e

    where e.consent_ad_user_data
      is not null

    order by
      e.occurred_at desc,
      e.received_at desc,
      e.id desc

    limit 1

  ),


  ad_personalization_state as (

    select
      e.id,
      e.source_event_id,
      e.occurred_at,
      e.consent_ad_personalization
        as value

    from scoped_consent e

    where e.consent_ad_personalization
      is not null

    order by
      e.occurred_at desc,
      e.received_at desc,
      e.id desc

    limit 1

  ),


  marketing_state as (

    select
      e.id,
      e.source_event_id,
      e.occurred_at,
      e.consent_marketing
        as value

    from scoped_consent e

    where e.consent_marketing
      is not null

    order by
      e.occurred_at desc,
      e.received_at desc,
      e.id desc

    limit 1

  ),


  -- ----------------------------------------------------------
  -- Produce exactly one consent row even when no consent
  -- events exist.
  -- ----------------------------------------------------------

  consent_state as (

    select

      a.value
        as analytics,

      a.id
        as analytics_event_id,

      a.source_event_id
        as analytics_source_event_id,

      a.occurred_at
        as analytics_occurred_at,


      u.value
        as ad_user_data,

      u.id
        as ad_user_data_event_id,

      u.source_event_id
        as ad_user_data_source_event_id,

      u.occurred_at
        as ad_user_data_occurred_at,


      p.value
        as ad_personalization,

      p.id
        as ad_personalization_event_id,

      p.source_event_id
        as ad_personalization_source_event_id,

      p.occurred_at
        as ad_personalization_occurred_at,


      m.value
        as marketing,

      m.id
        as marketing_event_id,

      m.source_event_id
        as marketing_source_event_id,

      m.occurred_at
        as marketing_occurred_at

    from (
      select 1
    ) anchor

    left join analytics_state a
      on true

    left join ad_user_data_state u
      on true

    left join ad_personalization_state p
      on true

    left join marketing_state m
      on true

  ),


  -- ----------------------------------------------------------
  -- Touchpoints eligible for conversion-time match signals.
  --
  -- We intentionally use event-level touchpoints instead of
  -- the mutable aggregate values on web_sessions.
  --
  -- This prevents an fbc/fbp value observed AFTER conversion
  -- from leaking backward through a session that began before
  -- the conversion.
  -- ----------------------------------------------------------

  scoped_touchpoints as (

    select
      tp.*

    from public.touchpoints tp

    where tp.organization_id =
        p_organization_id

      and tp.occurred_at <=
        p_conversion_at

      and (

        tp.lead_id =
          p_lead_id

        or (

          tp.anonymous_visitor_id
            is not null

          and exists (

            select 1

            from lead_visitors lv

            where lv.anonymous_visitor_id =
              tp.anonymous_visitor_id

          )

        )

        or (

          tp.web_session_id
            is not null

          and exists (

            select 1

            from lead_web_sessions lws

            where lws.id =
              tp.web_session_id

          )

        )

      )

  ),


  -- ----------------------------------------------------------
  -- Latest observed non-empty value for each provider signal.
  --
  -- No ID is synthesized from another field.
  -- ----------------------------------------------------------

  latest_signals as (

    select

      (
        select
          nullif(
            btrim(tp.gclid),
            ''
          )

        from scoped_touchpoints tp

        where nullif(
          btrim(tp.gclid),
          ''
        ) is not null

        order by
          tp.occurred_at desc,
          tp.created_at desc,
          tp.id desc

        limit 1
      ) as gclid,


      (
        select
          nullif(
            btrim(tp.gbraid),
            ''
          )

        from scoped_touchpoints tp

        where nullif(
          btrim(tp.gbraid),
          ''
        ) is not null

        order by
          tp.occurred_at desc,
          tp.created_at desc,
          tp.id desc

        limit 1
      ) as gbraid,


      (
        select
          nullif(
            btrim(tp.wbraid),
            ''
          )

        from scoped_touchpoints tp

        where nullif(
          btrim(tp.wbraid),
          ''
        ) is not null

        order by
          tp.occurred_at desc,
          tp.created_at desc,
          tp.id desc

        limit 1
      ) as wbraid,


      (
        select
          nullif(
            btrim(tp.fbclid),
            ''
          )

        from scoped_touchpoints tp

        where nullif(
          btrim(tp.fbclid),
          ''
        ) is not null

        order by
          tp.occurred_at desc,
          tp.created_at desc,
          tp.id desc

        limit 1
      ) as fbclid,


      (
        select
          nullif(
            btrim(tp.fbc),
            ''
          )

        from scoped_touchpoints tp

        where nullif(
          btrim(tp.fbc),
          ''
        ) is not null

        order by
          tp.occurred_at desc,
          tp.created_at desc,
          tp.id desc

        limit 1
      ) as fbc,


      (
        select
          nullif(
            btrim(tp.fbp),
            ''
          )

        from scoped_touchpoints tp

        where nullif(
          btrim(tp.fbp),
          ''
        ) is not null

        order by
          tp.occurred_at desc,
          tp.created_at desc,
          tp.id desc

        limit 1
      ) as fbp

  ),


  -- ----------------------------------------------------------
  -- First-party email values known by conversion time.
  --
  -- Use the CRM's canonical normalized_value.
  -- Do not hash in SQL.
  -- ----------------------------------------------------------

  email_candidates as (

    select distinct on (
      btrim(lc.normalized_value)
    )

      btrim(lc.normalized_value)
        as normalized_value,

      lc.is_primary,
      lc.verified,
      lc.created_at

    from public.lead_contacts lc

    where lc.organization_id =
        p_organization_id

      and lc.lead_id =
        p_lead_id

      and lc.contact_type::text =
        'email'

      and lc.created_at <=
        p_conversion_at

      and nullif(
        btrim(
          lc.normalized_value
        ),
        ''
      ) is not null

    order by
      btrim(lc.normalized_value),
      lc.is_primary desc,
      lc.verified desc,
      lc.created_at desc

  ),


  emails as (

    select
      coalesce(
        jsonb_agg(
          ec.normalized_value
          order by
            ec.is_primary desc,
            ec.verified desc,
            ec.created_at desc,
            ec.normalized_value
        ),
        '[]'::jsonb
      ) as values

    from (

      select
        *

      from email_candidates

      order by
        is_primary desc,
        verified desc,
        created_at desc,
        normalized_value

      limit 5

    ) ec

  ),


  -- ----------------------------------------------------------
  -- First-party phone values known by conversion time.
  -- ----------------------------------------------------------

  phone_candidates as (

    select distinct on (
      btrim(lc.normalized_value)
    )

      btrim(lc.normalized_value)
        as normalized_value,

      lc.is_primary,
      lc.verified,
      lc.created_at

    from public.lead_contacts lc

    where lc.organization_id =
        p_organization_id

      and lc.lead_id =
        p_lead_id

      and lc.contact_type::text =
        'phone'

      and lc.created_at <=
        p_conversion_at

      and nullif(
        btrim(
          lc.normalized_value
        ),
        ''
      ) is not null

    order by
      btrim(lc.normalized_value),
      lc.is_primary desc,
      lc.verified desc,
      lc.created_at desc

  ),


  phones as (

    select
      coalesce(
        jsonb_agg(
          pc.normalized_value
          order by
            pc.is_primary desc,
            pc.verified desc,
            pc.created_at desc,
            pc.normalized_value
        ),
        '[]'::jsonb
      ) as values

    from (

      select
        *

      from phone_candidates

      order by
        is_primary desc,
        verified desc,
        created_at desc,
        normalized_value

      limit 5

    ) pc

  ),


  identity_counts as (

    select

      (
        select
          count(*)

        from lead_visitors
      )::integer
        as visitor_count,

      (
        select
          count(*)

        from lead_sessions
      )::integer
        as session_count,

      (
        select
          count(*)

        from scoped_touchpoints
      )::integer
        as touchpoint_count

  )


  select

    jsonb_build_object(

      'ok',
        true,

      'organization_id',
        p_organization_id,

      'lead_id',
        p_lead_id,

      'conversion_at',
        p_conversion_at,


      'identity',
        jsonb_build_object(

          'visitor_count',
            ic.visitor_count,

          'session_count',
            ic.session_count,

          'touchpoint_count',
            ic.touchpoint_count

        ),


      'consent',
        jsonb_build_object(

          'analytics',
            cs.analytics,

          'analytics_event_id',
            cs.analytics_event_id,

          'analytics_source_event_id',
            cs.analytics_source_event_id,

          'analytics_occurred_at',
            cs.analytics_occurred_at,


          'ad_user_data',
            cs.ad_user_data,

          'ad_user_data_event_id',
            cs.ad_user_data_event_id,

          'ad_user_data_source_event_id',
            cs.ad_user_data_source_event_id,

          'ad_user_data_occurred_at',
            cs.ad_user_data_occurred_at,


          'ad_personalization',
            cs.ad_personalization,

          'ad_personalization_event_id',
            cs.ad_personalization_event_id,

          'ad_personalization_source_event_id',
            cs.ad_personalization_source_event_id,

          'ad_personalization_occurred_at',
            cs.ad_personalization_occurred_at,


          'marketing',
            cs.marketing,

          'marketing_event_id',
            cs.marketing_event_id,

          'marketing_source_event_id',
            cs.marketing_source_event_id,

          'marketing_occurred_at',
            cs.marketing_occurred_at

        ),


      'eligible_for_ad_user_data',
        cs.ad_user_data is true,


      'eligibility_reason',
        case

          when cs.ad_user_data is true then
            'explicitly_granted'

          when cs.ad_user_data is false then
            'explicitly_denied'

          else
            'unknown'

        end,


      /*
       * Hard privacy boundary:
       *
       * No advertising match data leaves this function unless
       * the latest explicit ad_user_data state at conversion
       * time is TRUE.
       */
      'match',
        case

          when cs.ad_user_data is true then

            jsonb_build_object(

              'emails',
                em.values,

              'phones',
                ph.values,

              'gclid',
                sig.gclid,

              'gbraid',
                sig.gbraid,

              'wbraid',
                sig.wbraid,

              'fbclid',
                sig.fbclid,

              'fbc',
                sig.fbc,

              'fbp',
                sig.fbp

            )

          else

            jsonb_build_object(

              'emails',
                '[]'::jsonb,

              'phones',
                '[]'::jsonb,

              'gclid',
                null,

              'gbraid',
                null,

              'wbraid',
                null,

              'fbclid',
                null,

              'fbc',
                null,

              'fbp',
                null

            )

        end

    )

  into v_result

  from consent_state cs
  cross join latest_signals sig
  cross join emails em
  cross join phones ph
  cross join identity_counts ic;


  return v_result;

end;

$function$;


-- ============================================================
-- PRIVILEGES
-- ============================================================

revoke all on function
public.resolve_conversion_feedback_match_context(
  uuid,
  uuid,
  timestamptz
)
from public;

revoke all on function
public.resolve_conversion_feedback_match_context(
  uuid,
  uuid,
  timestamptz
)
from anon;

revoke all on function
public.resolve_conversion_feedback_match_context(
  uuid,
  uuid,
  timestamptz
)
from authenticated;

grant execute on function
public.resolve_conversion_feedback_match_context(
  uuid,
  uuid,
  timestamptz
)
to service_role;


comment on function
public.resolve_conversion_feedback_match_context(
  uuid,
  uuid,
  timestamptz
)
is
'Service-role-only conversion feedback resolver. Resolves lead-linked browser identity, latest explicit consent state at or before conversion time, and eligible first-party provider match signals. Advertising identifiers and contact values are withheld unless consent_ad_user_data resolves explicitly TRUE.';


commit;
