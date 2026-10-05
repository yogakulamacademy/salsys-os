begin;

-- =============================================================================
-- 015_website_raw_event_processor.sql
--
-- Phase 3B: canonical website raw-event normalization primitive.
--
-- Purpose:
--   raw_events(source_system = 'website')
--       -> tenant-scoped web_sessions
--       -> tenant-scoped touchpoints
--
-- This function intentionally DOES NOT change raw_event_processing state.
-- Phase 2 lifecycle/lease primitives remain responsible for marking work
-- processed/failed. That keeps this normalizer reusable by:
--   1. the current synchronous tracking route; and
--   2. a future claimed background worker.
--
-- Existing CRM lifecycle touchpoints such as lead_created are outside this
-- processor and remain owned by their current CRM/lead-ingestion writers.
-- =============================================================================


create or replace function public.process_website_raw_event(
  p_organization_id uuid,
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_raw public.raw_events%rowtype;

  v_payload jsonb;
  v_touch jsonb;
  v_payload_metadata jsonb;

  v_event_id text;
  v_event_type text;
  v_session_key text;
  v_visitor_id text;
  v_site text;

  v_occurred_at timestamptz;
  v_now timestamptz := now();

  v_geo_country text;
  v_geo_region text;
  v_geo_city text;
  v_geo_timezone text;
  v_user_agent text;

  v_existing_session public.web_sessions%rowtype;
  v_session_id uuid;
  v_session_created boolean := false;

  v_identity_lead_id uuid;
  v_identity_last_session_key text;
  v_candidate_lead_id uuid;
  v_resolved_lead_id uuid;

  v_touchpoint_id uuid;
  v_touchpoint_created boolean := false;

  v_landing_page text;
  v_referrer text;

  v_source text;
  v_medium text;
  v_campaign text;
  v_content text;
  v_term text;

  v_gclid text;
  v_gbraid text;
  v_wbraid text;
  v_fbclid text;

  v_session_metadata jsonb;
  v_touchpoint_metadata jsonb;
begin
  -- ---------------------------------------------------------------------------
  -- Required trusted identifiers.
  -- ---------------------------------------------------------------------------

  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if p_raw_event_id is null then
    raise exception 'raw_event_id is required';
  end if;


  -- ---------------------------------------------------------------------------
  -- Load only a tenant-owned canonical website raw event.
  -- ---------------------------------------------------------------------------

  select re.*
  into v_raw
  from public.raw_events re
  where re.id = p_raw_event_id
    and re.organization_id = p_organization_id
    and re.source_system = 'website';

  if not found then
    raise exception
      'Tenant-owned website raw event not found';
  end if;


  -- ---------------------------------------------------------------------------
  -- Canonical raw columns are authoritative for event/session identity.
  -- Browser payload organization data is never trusted.
  -- ---------------------------------------------------------------------------

  v_event_id :=
    nullif(
      btrim(v_raw.source_event_id),
      ''
    );

  v_event_type :=
    nullif(
      btrim(v_raw.source_event_type),
      ''
    );

  v_session_key :=
    nullif(
      btrim(v_raw.session_key),
      ''
    );

  v_visitor_id :=
    nullif(
      btrim(v_raw.anonymous_visitor_id),
      ''
    );

  v_site :=
    coalesce(
      nullif(
        btrim(v_raw.site),
        ''
      ),
      nullif(
        btrim(v_raw.context ->> 'trusted_site'),
        ''
      )
    );

  if v_event_id is null then
    raise exception
      'Website raw event source_event_id is required';
  end if;

  if v_event_type is null then
    raise exception
      'Website raw event source_event_type is required';
  end if;

  if v_session_key is null then
    raise exception
      'Website raw event session_key is required';
  end if;

  if v_visitor_id is null then
    raise exception
      'Website raw event anonymous_visitor_id is required';
  end if;

  if v_site is null then
    raise exception
      'Website raw event trusted site is required';
  end if;


  -- ---------------------------------------------------------------------------
  -- Normalize JSON containers defensively.
  -- ---------------------------------------------------------------------------

  v_payload :=
    case
      when jsonb_typeof(v_raw.payload) = 'object'
        then v_raw.payload
      else '{}'::jsonb
    end;

  v_touch :=
    case
      when jsonb_typeof(
        v_payload -> 'sessionTouch'
      ) = 'object'
        then v_payload -> 'sessionTouch'
      else '{}'::jsonb
    end;

  v_payload_metadata :=
    case
      when jsonb_typeof(
        v_payload -> 'metadata'
      ) = 'object'
        then v_payload -> 'metadata'
      else '{}'::jsonb
    end;


  -- ---------------------------------------------------------------------------
  -- Event timestamp + trusted request context.
  -- ---------------------------------------------------------------------------

  v_occurred_at :=
    coalesce(
      v_raw.occurred_at,
      v_raw.received_at,
      v_now
    );

  v_geo_country :=
    nullif(
      v_raw.context ->> 'geo_country',
      ''
    );

  v_geo_region :=
    nullif(
      v_raw.context ->> 'geo_region',
      ''
    );

  v_geo_city :=
    nullif(
      v_raw.context ->> 'geo_city',
      ''
    );

  v_geo_timezone :=
    nullif(
      v_raw.context ->> 'geo_timezone',
      ''
    );

  v_user_agent :=
    nullif(
      v_raw.context ->> 'user_agent',
      ''
    );


  -- ---------------------------------------------------------------------------
  -- Normalized marketing/session fields.
  -- ---------------------------------------------------------------------------

  v_landing_page :=
    coalesce(
      nullif(
        v_payload ->> 'pageUrl',
        ''
      ),
      nullif(
        v_payload ->> 'pagePath',
        ''
      )
    );

  v_referrer :=
    nullif(
      v_payload ->> 'referrer',
      ''
    );

  v_source :=
    nullif(
      v_touch ->> 'source',
      ''
    );

  v_medium :=
    nullif(
      v_touch ->> 'medium',
      ''
    );

  v_campaign :=
    nullif(
      v_touch ->> 'campaign',
      ''
    );

  v_content :=
    nullif(
      v_touch ->> 'content',
      ''
    );

  v_term :=
    nullif(
      v_touch ->> 'term',
      ''
    );

  v_gclid :=
    nullif(
      v_touch ->> 'gclid',
      ''
    );

  v_gbraid :=
    nullif(
      v_touch ->> 'gbraid',
      ''
    );

  v_wbraid :=
    nullif(
      v_touch ->> 'wbraid',
      ''
    );

  v_fbclid :=
    nullif(
      v_touch ->> 'fbclid',
      ''
    );


  -- ---------------------------------------------------------------------------
  -- Serialize processing for one tenant/session.
  --
  -- The existing unique index still remains the hard database guarantee.
  -- The advisory lock prevents two canonical processors from racing through
  -- "session does not exist" at the same time.
  -- ---------------------------------------------------------------------------

  perform pg_advisory_xact_lock(
    hashtextextended(
      'website-session:'
      || p_organization_id::text
      || ':'
      || v_session_key,
      0
    )
  );


  -- ---------------------------------------------------------------------------
  -- Exact current session is authoritative.
  -- ---------------------------------------------------------------------------

  select ws.*
  into v_existing_session
  from public.web_sessions ws
  where ws.organization_id = p_organization_id
    and ws.session_key = v_session_key
  for update;

  if found then
    if v_existing_session.anonymous_visitor_id
       is distinct from v_visitor_id then
      raise exception
        'Tracking session does not belong to the supplied anonymous visitor';
    end if;
  end if;


  -- ---------------------------------------------------------------------------
  -- Browser identity is routing state only.
  --
  -- A previous browser-level visitor -> lead relationship may identify this
  -- event only when it explicitly points to this exact current session.
  -- ---------------------------------------------------------------------------

  select
    vil.lead_id,
    vil.last_session_key
  into
    v_identity_lead_id,
    v_identity_last_session_key
  from public.visitor_identity_links vil
  where vil.organization_id = p_organization_id
    and vil.anonymous_visitor_id = v_visitor_id
  limit 1;

  if v_existing_session.id is not null
     and v_existing_session.lead_id is not null then

    v_candidate_lead_id :=
      v_existing_session.lead_id;

  elsif v_identity_lead_id is not null
        and v_identity_last_session_key = v_session_key then

    v_candidate_lead_id :=
      v_identity_lead_id;

  else

    v_candidate_lead_id := null;

  end if;


  -- ---------------------------------------------------------------------------
  -- Admin/service-role execution still requires explicit tenant validation.
  -- ---------------------------------------------------------------------------

  if v_candidate_lead_id is not null then
    select l.id
    into v_resolved_lead_id
    from public.leads l
    where l.id = v_candidate_lead_id
      and l.organization_id = p_organization_id
    limit 1;
  end if;


  -- ---------------------------------------------------------------------------
  -- Session metadata mirrors the current tracking route contract.
  -- ---------------------------------------------------------------------------

  v_session_metadata :=
    jsonb_strip_nulls(
      jsonb_build_object(
        'site',
          v_site,
        'reported_site',
          nullif(
            v_payload ->> 'site',
            ''
          ),
        'page_title',
          nullif(
            v_payload ->> 'pageTitle',
            ''
          ),
        'first_touch',
          v_payload -> 'firstTouch',
        'utm_id',
          nullif(
            v_touch ->> 'utmId',
            ''
          ),
        'adgroup_id',
          nullif(
            v_touch ->> 'adgroupId',
            ''
          ),
        'creative_id',
          nullif(
            v_touch ->> 'creativeId',
            ''
          )
      )
    );


  -- ---------------------------------------------------------------------------
  -- Existing session: preserve first-touch/session-acquisition fields.
  --
  -- This matches the live route: later events update only last_seen, resolved
  -- lead association, and available geo fields.
  -- ---------------------------------------------------------------------------

  if v_existing_session.id is not null then

    update public.web_sessions ws
    set
      last_seen_at =
        v_now,

      lead_id =
        case
          when v_resolved_lead_id is not null
            then v_resolved_lead_id
          else ws.lead_id
        end,

      geo_country =
        coalesce(
          v_geo_country,
          ws.geo_country
        ),

      geo_region =
        coalesce(
          v_geo_region,
          ws.geo_region
        ),

      geo_city =
        coalesce(
          v_geo_city,
          ws.geo_city
        ),

      geo_timezone =
        coalesce(
          v_geo_timezone,
          ws.geo_timezone
        )

    where ws.id = v_existing_session.id
      and ws.organization_id = p_organization_id

    returning ws.id
    into v_session_id;


  -- ---------------------------------------------------------------------------
  -- New exact session.
  -- ---------------------------------------------------------------------------

  else

    insert into public.web_sessions (
      organization_id,
      anonymous_visitor_id,
      lead_id,
      session_key,
      site,

      source,
      medium,

      geo_country,
      geo_region,
      geo_city,
      geo_timezone,

      campaign_name,
      landing_page,
      referrer,

      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,

      gclid,
      gbraid,
      wbraid,
      fbclid,

      user_agent,
      last_seen_at,
      metadata
    )
    values (
      p_organization_id,
      v_visitor_id,
      v_resolved_lead_id,
      v_session_key,
      v_site,

      v_source,
      v_medium,

      v_geo_country,
      v_geo_region,
      v_geo_city,
      v_geo_timezone,

      v_campaign,
      v_landing_page,
      v_referrer,

      v_source,
      v_medium,
      v_campaign,
      v_content,
      v_term,

      v_gclid,
      v_gbraid,
      v_wbraid,
      v_fbclid,

      v_user_agent,
      v_now,
      v_session_metadata
    )

    on conflict (
      organization_id,
      session_key
    )
    do nothing

    returning id
    into v_session_id;

    if v_session_id is not null then
      v_session_created := true;

    else
      /*
       * Defensive compatibility with writers that do not yet use this
       * canonical processor. The unique index may have been won by another
       * writer between our initial lookup and INSERT.
       */
      select ws.*
      into v_existing_session
      from public.web_sessions ws
      where ws.organization_id = p_organization_id
        and ws.session_key = v_session_key
      for update;

      if not found then
        raise exception
          'Unable to create or recover tracking session';
      end if;

      if v_existing_session.anonymous_visitor_id
         is distinct from v_visitor_id then
        raise exception
          'Tracking session does not belong to the supplied anonymous visitor';
      end if;

      /*
       * If the concurrent writer attached an authoritative lead, preserve it
       * after tenant validation.
       */
      if v_existing_session.lead_id is not null then
        select l.id
        into v_resolved_lead_id
        from public.leads l
        where l.id = v_existing_session.lead_id
          and l.organization_id = p_organization_id
        limit 1;
      end if;

      update public.web_sessions ws
      set
        last_seen_at =
          v_now,

        lead_id =
          case
            when v_resolved_lead_id is not null
              then v_resolved_lead_id
            else ws.lead_id
          end,

        geo_country =
          coalesce(
            v_geo_country,
            ws.geo_country
          ),

        geo_region =
          coalesce(
            v_geo_region,
            ws.geo_region
          ),

        geo_city =
          coalesce(
            v_geo_city,
            ws.geo_city
          ),

        geo_timezone =
          coalesce(
            v_geo_timezone,
            ws.geo_timezone
          )

      where ws.id = v_existing_session.id
        and ws.organization_id = p_organization_id

      returning ws.id
      into v_session_id;
    end if;
  end if;


  if v_session_id is null then
    raise exception
      'Unable to resolve tracking session';
  end if;


  -- ---------------------------------------------------------------------------
  -- Touchpoint metadata mirrors the live tracking route.
  --
  -- User/browser metadata is merged last, matching the current JavaScript
  -- spread behavior (...payload.metadata).
  -- ---------------------------------------------------------------------------

  v_touchpoint_metadata :=
    jsonb_strip_nulls(
      jsonb_build_object(
        'site',
          v_site,
        'reported_site',
          nullif(
            v_payload ->> 'site',
            ''
          ),
        'page_title',
          nullif(
            v_payload ->> 'pageTitle',
            ''
          ),
        'page_path',
          nullif(
            v_payload ->> 'pagePath',
            ''
          ),
        'first_touch',
          v_payload -> 'firstTouch',
        'utm_id',
          nullif(
            v_touch ->> 'utmId',
            ''
          ),
        'adgroup_id',
          nullif(
            v_touch ->> 'adgroupId',
            ''
          )
      )
    )
    || v_payload_metadata;


  -- ---------------------------------------------------------------------------
  -- Tenant/event idempotency.
  --
  -- Event-backed website touchpoints always use the canonical source_event_id.
  -- CRM lifecycle touchpoints (for example lead_created) remain separate and
  -- may legitimately have event_id = NULL.
  -- ---------------------------------------------------------------------------

  insert into public.touchpoints (
    organization_id,
    event_id,
    lead_id,
    web_session_id,
    anonymous_visitor_id,

    geo_country,
    geo_region,
    geo_city,

    occurred_at,

    source,
    medium,
    campaign_name,
    content,
    term,

    platform,
    channel,

    landing_page,
    referrer,

    event_type,

    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,

    gclid,
    gbraid,
    wbraid,
    fbclid,

    external_campaign_id,
    external_adset_id,
    external_ad_id,

    metadata
  )
  values (
    p_organization_id,
    v_event_id,
    v_resolved_lead_id,
    v_session_id,
    v_visitor_id,

    v_geo_country,
    v_geo_region,
    v_geo_city,

    v_occurred_at,

    v_source,
    v_medium,
    v_campaign,
    v_content,
    v_term,

    v_source,
    'website'::public.contact_channel,

    v_landing_page,
    v_referrer,

    v_event_type,

    v_source,
    v_medium,
    v_campaign,
    v_content,
    v_term,

    v_gclid,
    v_gbraid,
    v_wbraid,
    v_fbclid,

    nullif(
      v_touch ->> 'campaignId',
      ''
    ),

    nullif(
      v_touch ->> 'adsetId',
      ''
    ),

    coalesce(
      nullif(
        v_touch ->> 'adId',
        ''
      ),
      nullif(
        v_touch ->> 'creativeId',
        ''
      )
    ),

    v_touchpoint_metadata
  )

  on conflict (
    organization_id,
    event_id
  )
  do nothing

  returning id
  into v_touchpoint_id;


  if v_touchpoint_id is not null then
    v_touchpoint_created := true;

  else
    select tp.id
    into v_touchpoint_id
    from public.touchpoints tp
    where tp.organization_id = p_organization_id
      and tp.event_id = v_event_id
    limit 1;
  end if;


  -- ---------------------------------------------------------------------------
  -- Result is deliberately processing-state neutral.
  -- ---------------------------------------------------------------------------

  return jsonb_build_object(
    'ok',
      true,

    'raw_event_id',
      p_raw_event_id,

    'organization_id',
      p_organization_id,

    'source_event_id',
      v_event_id,

    'session_id',
      v_session_id,

    'session_created',
      v_session_created,

    'touchpoint_id',
      v_touchpoint_id,

    'touchpoint_created',
      v_touchpoint_created,

    'lead_id',
      v_resolved_lead_id
  );
end;
$function$;


-- =============================================================================
-- EXECUTION CONTRACT
-- =============================================================================

revoke all
on function public.process_website_raw_event(
  uuid,
  uuid
)
from public, anon, authenticated;


grant execute
on function public.process_website_raw_event(
  uuid,
  uuid
)
to service_role;


-- =============================================================================
-- FINAL ASSERTIONS
-- =============================================================================

do $$
begin
  if to_regprocedure(
    'public.process_website_raw_event(uuid,uuid)'
  ) is null then
    raise exception
      '015 abort: process_website_raw_event(uuid,uuid) is missing';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.process_website_raw_event(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception
      '015 abort: service_role lacks website processor EXECUTE';
  end if;

  if to_regclass(
    'public.uq_web_sessions_org_session_key'
  ) is null then
    raise exception
      '015 abort: tenant/session uniqueness index is missing';
  end if;

  if to_regclass(
    'public.uq_touchpoints_org_event_id'
  ) is null then
    raise exception
      '015 abort: tenant/event uniqueness index is missing';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.web_sessions'::regclass
  ) then
    raise exception
      '015 abort: web_sessions RLS is not enabled';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.touchpoints'::regclass
  ) then
    raise exception
      '015 abort: touchpoints RLS is not enabled';
  end if;
end
$$;


commit;
