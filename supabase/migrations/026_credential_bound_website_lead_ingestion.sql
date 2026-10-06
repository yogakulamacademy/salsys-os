begin;


/* ============================================================
   MIGRATION 026
   Credential-Bound Website Lead Ingestion

   Purpose:
   - credential organization is authoritative
   - submitted website must belong to that organization
   - existing ingest_website_lead remains unchanged
   - service-role only
   ============================================================ */


create or replace function
public.ingest_website_lead_for_organization(

  p_organization_id uuid,

  p_external_event_id text,

  p_site text default null,

  p_form_name text default null,

  p_first_name text default null,

  p_last_name text default null,

  p_email text default null,

  p_phone text default null,

  p_course_code text default null,

  p_preferred_location text default null,

  p_preferred_month date default null,

  p_preferred_mode text default null,

  p_country text default null,

  p_timezone text default null,

  p_message text default null,

  p_anonymous_visitor_id text default null,

  p_session_key text default null,

  p_first_touch jsonb default '{}'::jsonb,

  p_session_touch jsonb default '{}'::jsonb,

  p_metadata jsonb default '{}'::jsonb

)
returns jsonb

language plpgsql

security definer

set search_path = public, pg_temp

as $function$

declare

  v_site_host text;

  v_result jsonb;

  v_result_organization_id uuid;

begin


  /* ==========================================================
     1. ORGANIZATION IS REQUIRED
     ========================================================== */

  if p_organization_id is null then

    raise exception
      'organization_id is required';

  end if;


  if not exists (

    select 1

    from public.organizations o

    where o.id = p_organization_id

  ) then

    raise exception
      'Organization does not exist';

  end if;



  /* ==========================================================
     2. WEBSITE IS REQUIRED FOR CREDENTIAL-BOUND INGEST
     ========================================================== */

  if nullif(
    btrim(p_site),
    ''
  ) is null then

    raise exception
      'site is required for credential-bound website ingestion';

  end if;



  /* ==========================================================
     3. NORMALIZE WEBSITE HOSTNAME
     ========================================================== */

  v_site_host :=
    lower(
      btrim(p_site)
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


  if nullif(
    v_site_host,
    ''
  ) is null then

    raise exception
      'Valid site hostname is required';

  end if;



  /* ==========================================================
     4. WEBSITE MUST BELONG TO AUTHENTICATED ORGANIZATION
     ========================================================== */

  if not exists (

    select 1

    from public.organization_sites os

    where os.organization_id =
      p_organization_id

      and lower(os.hostname) =
        v_site_host

      and os.status =
        'active'

  ) then

    raise exception
      'Website is not registered to the authenticated organization';

  end if;



  /* ==========================================================
     5. OPTIONAL SESSION TENANT GUARD
     ========================================================== */

  if nullif(
    btrim(p_session_key),
    ''
  ) is not null
  and exists (

    select 1

    from public.web_sessions ws

    where ws.session_key =
      btrim(p_session_key)

      and ws.organization_id <>
        p_organization_id

  ) then

    raise exception
      'Session belongs to a different organization';

  end if;



  /* ==========================================================
     6. OPTIONAL VISITOR TENANT GUARD
     ========================================================== */

  if nullif(
    btrim(p_anonymous_visitor_id),
    ''
  ) is not null
  and exists (

    select 1

    from public.web_sessions ws

    where ws.anonymous_visitor_id =
      btrim(p_anonymous_visitor_id)

      and ws.organization_id <>
        p_organization_id

  ) then

    raise exception
      'Visitor belongs to a different organization';

  end if;



  /* ==========================================================
     7. CALL EXISTING PROVEN INGESTION PIPELINE
     ========================================================== */

  v_result :=
    public.ingest_website_lead(

      p_external_event_id =>
        p_external_event_id,

      p_site =>
        v_site_host,

      p_form_name =>
        p_form_name,

      p_first_name =>
        p_first_name,

      p_last_name =>
        p_last_name,

      p_email =>
        p_email,

      p_phone =>
        p_phone,

      p_course_code =>
        p_course_code,

      p_preferred_location =>
        p_preferred_location,

      p_preferred_month =>
        p_preferred_month,

      p_preferred_mode =>
        p_preferred_mode,

      p_country =>
        p_country,

      p_timezone =>
        p_timezone,

      p_message =>
        p_message,

      p_anonymous_visitor_id =>
        p_anonymous_visitor_id,

      p_session_key =>
        p_session_key,

      p_first_touch =>
        coalesce(
          p_first_touch,
          '{}'::jsonb
        ),

      p_session_touch =>
        coalesce(
          p_session_touch,
          '{}'::jsonb
        ),

      p_metadata =>
        coalesce(
          p_metadata,
          '{}'::jsonb
        )

    );



  /* ==========================================================
     8. DEFENSE-IN-DEPTH RESULT VALIDATION
     ========================================================== */

  begin

    v_result_organization_id :=
      nullif(
        v_result ->> 'organization_id',
        ''
      )::uuid;

  exception
    when others then

      raise exception
        'Website lead ingestion returned invalid organization identity';

  end;


  if v_result_organization_id is null then

    raise exception
      'Website lead ingestion did not return organization_id';

  end if;


  if v_result_organization_id <>
     p_organization_id then

    raise exception
      'Website lead ingestion organization mismatch';

  end if;



  /* ==========================================================
     9. RETURN ORIGINAL INGEST RESULT
     ========================================================== */

  return v_result;

end;

$function$;



/* ============================================================
   10. SERVER-ONLY PERMISSIONS
   ============================================================ */

revoke all
on function public.ingest_website_lead_for_organization(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
)
from public;


revoke all
on function public.ingest_website_lead_for_organization(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
)
from anon;


revoke all
on function public.ingest_website_lead_for_organization(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
)
from authenticated;


grant execute
on function public.ingest_website_lead_for_organization(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
)
to service_role;


commit;