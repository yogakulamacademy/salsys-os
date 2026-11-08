begin;

-- R2 #643 DRAFT: exact-source, fail-closed contact primary collision guard.
-- No table, index, role, RLS, endpoint, payment, or enrollment changes.
-- This migration is NOT authorized for live deployment until separate
-- isolated end-to-end acceptance, reviewer approval and rollback planning.
--
-- The existing matched-lead UPDATE ... RETURNING locks its lead row before
-- contact insertion. For that lead, reuse the established primary email /
-- phone contact and insert a new normalized contact as secondary.
-- Preserve the historical phone-primary policy: no primary promotion when
-- the submission also contains an email.
--
-- IMPORTANT: a secondary contact still goes through the existing
-- reconcile_person_after_contact_change_v1 trigger. Existing canonical
-- person-conflict review, identity locks and non-merge rules are unchanged.

do $r2_contact_source_guard$
declare
  v_rpc oid := to_regprocedure(
    'public.ingest_website_lead(text,text,text,text,text,text,text,text,text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb)'
  );
  v_body_md5 text;
begin
  if v_rpc is null then
    raise exception 'R2 #643: canonical website ingest RPC absent; fail closed';
  end if;

  select md5(btrim(replace(
    split_part(split_part(pg_get_functiondef(v_rpc), 'AS $function$', 2), '$function$', 1),
    E'\r\n', E'\n'
  ))) into v_body_md5;

  -- Verified production on 2026-11-08: exact checked-in migration 008 body.
  if v_body_md5 is distinct from '309f9d3ea4929e26f6c44f77099559ed' then
    raise exception 'R2 #643: website ingest function has drifted; require review';
  end if;

  if not exists (
    select 1 from pg_proc p
    where p.oid = v_rpc
      and p.prosecdef = true
      and p.proowner::regrole::text = 'postgres'
      and p.proacl::text = '{postgres=X/postgres,service_role=X/postgres}'
      and array_to_string(p.proconfig, ',') = 'search_path=public'
  ) then
    raise exception 'R2 #643: privileged RPC owner/ACL/search path changed; fail closed';
  end if;
end;
$r2_contact_source_guard$;

CREATE OR REPLACE FUNCTION public.ingest_website_lead(p_external_event_id text, p_site text DEFAULT NULL::text, p_form_name text DEFAULT NULL::text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_course_code text DEFAULT NULL::text, p_preferred_location text DEFAULT NULL::text, p_preferred_month date DEFAULT NULL::date, p_preferred_mode text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_anonymous_visitor_id text DEFAULT NULL::text, p_session_key text DEFAULT NULL::text, p_first_touch jsonb DEFAULT '{}'::jsonb, p_session_touch jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare

    v_existing_event public.lead_ingest_events;

    v_email_norm text :=
        lower(
            nullif(
                trim(p_email),
                ''
            )
        );

    v_phone_norm text :=
        nullif(
            regexp_replace(
                coalesce(p_phone, ''),
                '[^0-9+]',
                '',
                'g'
            ),
            ''
        );

    v_email_lead uuid;
    v_phone_lead uuid;

    v_lead public.leads;

    v_course_id uuid;

    v_matched_existing boolean := false;

    v_conversation_id uuid;

    v_now timestamptz := now();

    v_source text :=
        nullif(
            trim(
                coalesce(
                    p_session_touch ->> 'source',
                    p_first_touch ->> 'source'
                )
            ),
            ''
        );

    v_medium text :=
        nullif(
            trim(
                coalesce(
                    p_session_touch ->> 'medium',
                    p_first_touch ->> 'medium'
                )
            ),
            ''
        );

    v_campaign text :=
        nullif(
            trim(
                coalesce(
                    p_session_touch ->> 'campaign',
                    p_first_touch ->> 'campaign'
                )
            ),
            ''
        );

    v_touchpoint_id uuid;

    -- Tenant resolution
    v_organization_id uuid;
    v_site_host text;

begin

    -- ========================================================
    -- 1. VALIDATE EXTERNAL EVENT
    -- ========================================================

    if nullif(
        trim(p_external_event_id),
        ''
    ) is null then

        raise exception
            'external_event_id is required';

    end if;


    -- ========================================================
    -- 2. NORMALIZE WEBSITE HOSTNAME
    --
    -- Supports:
    --
    -- yogakulam.com
    -- www.yogakulam.com
    -- https://www.yogakulam.com
    -- https://www.yogakulam.com/some/page
    -- ========================================================

    v_site_host :=
        lower(
            trim(
                coalesce(
                    p_site,
                    ''
                )
            )
        );

    v_site_host :=
        regexp_replace(
            v_site_host,
            '^https?://',
            ''
        );

    v_site_host :=
        split_part(
            v_site_host,
            '/',
            1
        );

    v_site_host :=
        split_part(
            v_site_host,
            ':',
            1
        );


    -- ========================================================
    -- 3. RESOLVE ORGANIZATION FROM REGISTERED WEBSITE
    -- ========================================================

    if nullif(
        v_site_host,
        ''
    ) is not null then

        select
            os.organization_id
        into
            v_organization_id

        from public.organization_sites os

        where lower(os.hostname) =
              v_site_host

          and os.status =
              'active'

        limit 1;

    end if;


    -- ========================================================
    -- 4. FALLBACK TO TRACKED SESSION
    --
    -- Useful for an older form integration that sends the
    -- session but not the website hostname.
    --
    -- Only accepts the fallback when exactly one organization
    -- owns the supplied session key.
    -- ========================================================

    if v_organization_id is null
       and nullif(
           trim(p_session_key),
           ''
       ) is not null then

        select
            min(ws.organization_id)
        into
            v_organization_id

        from public.web_sessions ws

        where ws.session_key =
              trim(p_session_key)

        having count(
            distinct
            ws.organization_id
        ) = 1;

    end if;


    -- ========================================================
    -- 5. SECOND FALLBACK TO VISITOR
    --
    -- Again, only if the visitor currently belongs to exactly
    -- one organization.
    -- ========================================================

    if v_organization_id is null
       and nullif(
           trim(p_anonymous_visitor_id),
           ''
       ) is not null then

        select
            min(ws.organization_id)
        into
            v_organization_id

        from public.web_sessions ws

        where ws.anonymous_visitor_id =
              trim(p_anonymous_visitor_id)

        having count(
            distinct
            ws.organization_id
        ) = 1;

    end if;


    if v_organization_id is null then

        raise exception
            'Unable to resolve organization for website lead capture';

    end if;


    -- ========================================================
    -- 6. ORGANIZATION-SCOPED IDEMPOTENCY LOCK
    -- ========================================================

    perform pg_advisory_xact_lock(
        hashtext(
            'website:'
            || v_organization_id::text
            || ':'
            || trim(
                p_external_event_id
            )
        )
    );


    -- ========================================================
    -- 7. TENANT-SCOPED IDEMPOTENCY CHECK
    -- ========================================================

    select *
    into v_existing_event

    from public.lead_ingest_events lie

    where lie.organization_id =
          v_organization_id

      and lie.source_system =
          'website'

      and lie.external_event_id =
          trim(
              p_external_event_id
          )

    limit 1;


    if found then

        select *
        into v_lead

        from public.leads l

        where l.id =
              v_existing_event.lead_id

          and l.organization_id =
              v_organization_id;


        return jsonb_build_object(
            'ok',
                true,

            'duplicate_event',
                true,

            'created',
                false,

            'matched_existing',
                v_existing_event.matched_existing,

            'lead_id',
                v_lead.id,

            'lead_code',
                v_lead.lead_code,

            'organization_id',
                v_organization_id
        );

    end if;


    -- ========================================================
    -- 8. TENANT-SCOPED CONTACT MATCHING
    -- ========================================================

    if v_email_norm is not null then

        select lc.lead_id
        into v_email_lead

        from public.lead_contacts lc

        where lc.organization_id =
              v_organization_id

          and lc.contact_type =
              'email'

          and lc.normalized_value =
              v_email_norm

        limit 1;

    end if;


    if v_phone_norm is not null then

        select lc.lead_id
        into v_phone_lead

        from public.lead_contacts lc

        where lc.organization_id =
              v_organization_id

          and lc.contact_type in (
              'phone',
              'whatsapp'
          )

          and lc.normalized_value =
              v_phone_norm

        limit 1;

    end if;


    if v_email_lead is not null
       and v_phone_lead is not null
       and v_email_lead <>
           v_phone_lead then

        raise exception
            'Email and phone belong to different existing leads';

    end if;


    -- ========================================================
    -- 9. TENANT-SCOPED COURSE LOOKUP
    -- ========================================================

    if nullif(
        trim(p_course_code),
        ''
    ) is not null then

        select c.id
        into v_course_id

        from public.courses c

        where c.organization_id =
              v_organization_id

          and c.code =
              trim(
                  p_course_code
              )

          and c.active =
              true

        limit 1;

    end if;


    -- ========================================================
    -- 10. UPDATE EXISTING LEAD
    -- ========================================================

    if coalesce(
        v_email_lead,
        v_phone_lead
    ) is not null then

        v_matched_existing :=
            true;


        update public.leads

        set
            first_name =
                coalesce(
                    nullif(
                        trim(
                            p_first_name
                        ),
                        ''
                    ),
                    first_name
                ),

            last_name =
                coalesce(
                    nullif(
                        trim(
                            p_last_name
                        ),
                        ''
                    ),
                    last_name
                ),

            display_name =
                coalesce(
                    nullif(
                        trim(
                            concat_ws(
                                ' ',
                                nullif(
                                    trim(
                                        p_first_name
                                    ),
                                    ''
                                ),
                                nullif(
                                    trim(
                                        p_last_name
                                    ),
                                    ''
                                )
                            )
                        ),
                        ''
                    ),
                    display_name
                ),

            interested_course_id =
                coalesce(
                    v_course_id,
                    interested_course_id
                ),

            preferred_location =
                coalesce(
                    nullif(
                        trim(
                            p_preferred_location
                        ),
                        ''
                    ),
                    preferred_location
                ),

            preferred_month =
                coalesce(
                    p_preferred_month,
                    preferred_month
                ),

            preferred_mode =
                coalesce(
                    nullif(
                        trim(
                            p_preferred_mode
                        ),
                        ''
                    ),
                    preferred_mode
                ),

            country =
                coalesce(
                    nullif(
                        trim(
                            p_country
                        ),
                        ''
                    ),
                    country
                ),

            timezone =
                coalesce(
                    nullif(
                        trim(
                            p_timezone
                        ),
                        ''
                    ),
                    timezone
                ),

            current_contact_channel =
                'website',

            first_contacted_at =
                coalesce(
                    first_contacted_at,
                    v_now
                ),

            last_contacted_at =
                v_now,

            last_inbound_at =
                v_now,

            notes =
                case

                    when nullif(
                        trim(
                            p_message
                        ),
                        ''
                    ) is null
                    then notes

                    when notes is null
                         or trim(notes) = ''
                    then left(
                        trim(
                            p_message
                        ),
                        4000
                    )

                    else notes

                end,

            metadata =
                metadata
                ||
                jsonb_build_object(
                    'last_website_submission',
                    jsonb_build_object(
                        'event_id',
                            trim(
                                p_external_event_id
                            ),

                        'site',
                            nullif(
                                trim(
                                    p_site
                                ),
                                ''
                            ),

                        'form_name',
                            nullif(
                                trim(
                                    p_form_name
                                ),
                                ''
                            ),

                        'received_at',
                            v_now,

                        'organization_id',
                            v_organization_id
                    )
                )

        where id =
              coalesce(
                  v_email_lead,
                  v_phone_lead
              )

          and organization_id =
              v_organization_id

        returning *
        into v_lead;


    -- ========================================================
    -- 11. CREATE NEW TENANT-OWNED LEAD
    -- ========================================================

    else

        insert into public.leads(
            organization_id,

            first_name,
            last_name,
            display_name,

            interested_course_id,

            preferred_location,
            preferred_month,
            preferred_mode,

            country,
            timezone,

            lead_creation_channel,
            current_contact_channel,

            first_contacted_at,
            last_contacted_at,
            last_inbound_at,

            notes,
            metadata
        )
        values (
            v_organization_id,

            nullif(
                trim(
                    p_first_name
                ),
                ''
            ),

            nullif(
                trim(
                    p_last_name
                ),
                ''
            ),

            coalesce(
                nullif(
                    trim(
                        concat_ws(
                            ' ',
                            nullif(
                                trim(
                                    p_first_name
                                ),
                                ''
                            ),
                            nullif(
                                trim(
                                    p_last_name
                                ),
                                ''
                            )
                        )
                    ),
                    ''
                ),

                nullif(
                    v_email_norm,
                    ''
                ),

                nullif(
                    v_phone_norm,
                    ''
                ),

                'Website Lead'
            ),

            v_course_id,

            nullif(
                trim(
                    p_preferred_location
                ),
                ''
            ),

            p_preferred_month,

            nullif(
                trim(
                    p_preferred_mode
                ),
                ''
            ),

            nullif(
                trim(
                    p_country
                ),
                ''
            ),

            nullif(
                trim(
                    p_timezone
                ),
                ''
            ),

            'website',
            'website',

            v_now,
            v_now,
            v_now,

            nullif(
                left(
                    trim(
                        p_message
                    ),
                    4000
                ),
                ''
            ),

            jsonb_build_object(
                'website_capture',
                jsonb_build_object(
                    'event_id',
                        trim(
                            p_external_event_id
                        ),

                    'site',
                        nullif(
                            trim(
                                p_site
                            ),
                            ''
                        ),

                    'form_name',
                        nullif(
                            trim(
                                p_form_name
                            ),
                            ''
                        ),

                    'received_at',
                        v_now,

                    'organization_id',
                        v_organization_id
                )
            )
            ||
            coalesce(
                p_metadata,
                '{}'::jsonb
            )
        )

        returning *
        into v_lead;

    end if;


    -- ========================================================
    -- 12. TENANT-OWNED CONTACTS
    --
    -- Keep the existing global conflict target TEMPORARILY.
    -- We will migrate contact uniqueness after all writers are
    -- organization-aware.
    -- ========================================================

    if v_email_norm is not null then

        insert into public.lead_contacts(
            organization_id,
            lead_id,
            contact_type,
            value,
            normalized_value,
            is_primary
        )
        values (
            v_organization_id,
            v_lead.id,
            'email',
            trim(
                p_email
            ),
            v_email_norm,
            not exists (
                select 1 from public.lead_contacts lc
                where lc.organization_id = v_organization_id
                  and lc.lead_id = v_lead.id
                  and lc.contact_type = 'email'
                  and lc.is_primary = true
            )
        )

        on conflict (
            organization_id,
            contact_type,
            normalized_value
        )
        do nothing;

    end if;


    if v_phone_norm is not null then

        insert into public.lead_contacts(
            organization_id,
            lead_id,
            contact_type,
            value,
            normalized_value,
            is_primary
        )
        values (
            v_organization_id,
            v_lead.id,
            'phone',
            trim(
                p_phone
            ),
            v_phone_norm,
            v_email_norm is null
            and not exists (
                select 1 from public.lead_contacts lc
                where lc.organization_id = v_organization_id
                  and lc.lead_id = v_lead.id
                  and lc.contact_type = 'phone'
                  and lc.is_primary = true
            )
        )

        on conflict (
            organization_id,
            contact_type,
            normalized_value
        )
        do nothing;

    end if;


    -- ========================================================
    -- 13. TENANT-OWNED VISITOR IDENTITY
    --
    -- Old global PK remains temporarily.
    -- Guard against accidental cross-organization reassignment.
    -- ========================================================

    if nullif(
        trim(
            p_anonymous_visitor_id
        ),
        ''
    ) is not null then

        if exists (
            select 1

            from public.visitor_identity_links vil

            where vil.anonymous_visitor_id =
                  trim(
                      p_anonymous_visitor_id
                  )

              and vil.organization_id <>
                  v_organization_id
        ) then

            raise exception
                'Anonymous visitor identity belongs to a different organization';

        end if;


        insert into public.visitor_identity_links(
            organization_id,
            anonymous_visitor_id,
            lead_id,
            last_session_key,
            source_system,
            metadata
        )
        values (
            v_organization_id,

            trim(
                p_anonymous_visitor_id
            ),

            v_lead.id,

            nullif(
                trim(
                    p_session_key
                ),
                ''
            ),

            'website',

            jsonb_build_object(
                'last_external_event_id',
                    trim(
                        p_external_event_id
                    )
            )
        )

        on conflict (
            organization_id,
            anonymous_visitor_id
        )
        do update set

            lead_id =
                excluded.lead_id,

            last_session_key =
                excluded.last_session_key,

            source_system =
                excluded.source_system,

            linked_at =
                now(),

            metadata =
                public.visitor_identity_links.metadata
                ||
                excluded.metadata,

            updated_at =
                now()

        where public.visitor_identity_links.organization_id =
              excluded.organization_id;


        perform
            public.attach_visitor_journey_to_lead(
                v_lead.id,

                trim(
                    p_anonymous_visitor_id
                ),

                nullif(
                    trim(
                        p_session_key
                    ),
                    ''
                )
            );

    end if;


    -- ========================================================
    -- 14. TENANT-OWNED LEAD-CREATION TOUCHPOINT
    -- ========================================================

    insert into public.touchpoints(
        organization_id,

        lead_id,
        anonymous_visitor_id,

        occurred_at,

        source,
        medium,
        campaign_name,

        platform,
        channel,

        event_type,

        utm_source,
        utm_medium,
        utm_campaign,

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
        v_organization_id,

        v_lead.id,

        nullif(
            trim(
                p_anonymous_visitor_id
            ),
            ''
        ),

        v_now,

        v_source,
        v_medium,
        v_campaign,

        v_source,
        'website',

        'lead_created',

        v_source,
        v_medium,
        v_campaign,

        nullif(
            p_session_touch ->> 'gclid',
            ''
        ),

        nullif(
            p_session_touch ->> 'gbraid',
            ''
        ),

        nullif(
            p_session_touch ->> 'wbraid',
            ''
        ),

        nullif(
            p_session_touch ->> 'fbclid',
            ''
        ),

        nullif(
            p_session_touch ->> 'campaignId',
            ''
        ),

        nullif(
            p_session_touch ->> 'adsetId',
            ''
        ),

        coalesce(
            nullif(
                p_session_touch ->> 'adId',
                ''
            ),

            nullif(
                p_session_touch ->> 'creativeId',
                ''
            )
        ),

        jsonb_build_object(
            'external_event_id',
                trim(
                    p_external_event_id
                ),

            'site',
                nullif(
                    trim(
                        p_site
                    ),
                    ''
                ),

            'form_name',
                nullif(
                    trim(
                        p_form_name
                    ),
                    ''
                ),

            'capture',
                'server',

            'organization_id',
                v_organization_id
        )
        ||
        coalesce(
            p_metadata,
            '{}'::jsonb
        )
    )

    returning id
    into v_touchpoint_id;


    perform
        public.refresh_lead_attribution_internal(
            v_lead.id
        );


    -- ========================================================
    -- 15. WEBSITE CONVERSATION / MESSAGE
    -- ========================================================

    if nullif(
        trim(
            p_message
        ),
        ''
    ) is not null then

        select c.id
        into v_conversation_id

        from public.conversations c

        where c.lead_id =
              v_lead.id

          and c.organization_id =
              v_organization_id

          and c.channel =
              'website'

          and c.status =
              'open'

        order by
            coalesce(
                c.last_message_at,
                c.started_at
            )
            desc

        limit 1;


        if v_conversation_id is null then

            insert into public.conversations(
                organization_id,
                lead_id,
                channel,
                status,
                started_at,
                last_message_at,
                external_conversation_id,
                metadata
            )
            values (
                v_organization_id,
                v_lead.id,
                'website',
                'open',
                v_now,
                v_now,
                null,

                jsonb_build_object(
                    'site',
                        p_site,

                    'form_name',
                        p_form_name,

                    'organization_id',
                        v_organization_id
                )
            )

            returning id
            into v_conversation_id;

        else

            update public.conversations

            set last_message_at =
                v_now

            where id =
                  v_conversation_id
              and organization_id =
                  v_organization_id;

        end if;


        insert into public.messages(
            organization_id,
            conversation_id,
            lead_id,
            external_message_id,
            direction,
            sender_type,
            message_type,
            body,
            status,
            received_at,
            metadata
        )

        select
            v_organization_id,

            v_conversation_id,

            v_lead.id,

            'website:'
            ||
            trim(
                p_external_event_id
            ),

            'inbound',
            'lead',
            'text',

            left(
                trim(
                    p_message
                ),
                8000
            ),

            'received',

            v_now,

            jsonb_build_object(
                'site',
                    p_site,

                'form_name',
                    p_form_name,

                'organization_id',
                    v_organization_id
            )

        where not exists (

            select 1

            from public.messages m

            where m.organization_id =
                  v_organization_id

              and m.external_message_id =
                  'website:'
                  ||
                  trim(
                      p_external_event_id
                  )

              and m.lead_id =
                  v_lead.id
        );

    end if;


    -- ========================================================
    -- 16. ACTIVITY
    -- ========================================================

    insert into public.activities(
        lead_id,
        activity_type,
        channel,
        actor_type,
        actor_id,
        title,
        details,
        metadata,
        occurred_at
    )
    values (
        v_lead.id,

        case

            when v_matched_existing
            then 'website_form_repeat'

            else 'website_lead_created'

        end,

        'website',
        'automation',
        'website-capture',

        case

            when v_matched_existing
            then 'Website enquiry received'

            else 'Website lead created'

        end,

        left(
            coalesce(
                nullif(
                    trim(
                        p_message
                    ),
                    ''
                ),

                coalesce(
                    p_form_name,
                    'Website form submission'
                )
            ),
            500
        ),

        jsonb_build_object(
            'external_event_id',
                trim(
                    p_external_event_id
                ),

            'site',
                p_site,

            'form_name',
                p_form_name,

            'matched_existing',
                v_matched_existing,

            'organization_id',
                v_organization_id
        )
        ||
        coalesce(
            p_metadata,
            '{}'::jsonb
        ),

        v_now
    );


    -- ========================================================
    -- 17. TENANT-OWNED INGEST EVENT
    -- ========================================================

    insert into public.lead_ingest_events(
        organization_id,

        source_system,
        external_event_id,

        lead_id,

        site,
        form_name,

        matched_existing,
        status,

        metadata,
        received_at
    )
    values (
        v_organization_id,

        'website',

        trim(
            p_external_event_id
        ),

        v_lead.id,

        nullif(
            trim(
                p_site
            ),
            ''
        ),

        nullif(
            trim(
                p_form_name
            ),
            ''
        ),

        v_matched_existing,

        'processed',

        jsonb_build_object(
            'anonymous_visitor_id',
                nullif(
                    trim(
                        p_anonymous_visitor_id
                    ),
                    ''
                ),

            'session_key',
                nullif(
                    trim(
                        p_session_key
                    ),
                    ''
                ),

            'organization_id',
                v_organization_id
        )
        ||
        coalesce(
            p_metadata,
            '{}'::jsonb
        ),

        v_now
    );


    -- ========================================================
    -- 18. RETURN
    -- ========================================================

    return jsonb_build_object(
        'ok',
            true,

        'duplicate_event',
            false,

        'created',
            not v_matched_existing,

        'matched_existing',
            v_matched_existing,

        'lead_id',
            v_lead.id,

        'lead_code',
            v_lead.lead_code,

        'touchpoint_id',
            v_touchpoint_id,

        'organization_id',
            v_organization_id
    );

end;
$function$;

-- CREATE OR REPLACE preserves the existing function identity and ACL, unlike
-- DROP + CREATE. Verify the security boundary has not changed as intended.
do $r2_contact_security_postcheck$
begin
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure(
      'public.ingest_website_lead(text,text,text,text,text,text,text,text,text,date,text,text,text,text,text,text,jsonb,jsonb,jsonb)'
    )
      and p.prosecdef = true
      and p.proowner::regrole::text = 'postgres'
      and p.proacl::text = '{postgres=X/postgres,service_role=X/postgres}'
      and array_to_string(p.proconfig, ',') = 'search_path=public'
  ) then
    raise exception 'R2 #643: post-migration privileged RPC boundary changed; rollback';
  end if;
end;
$r2_contact_security_postcheck$;

commit;
