begin;

-- ============================================================
-- MIGRATION 034
-- TRACKING CONSENT LEDGER + PROVIDER MATCH SIGNALS
--
-- Foundation only:
--
--   1. immutable tracking_consent_events ledger
--   2. fbc / fbp fields on canonical sessions + touchpoints
--   3. idempotent consent ingestion RPC
--   4. canonical raw-event -> fbc/fbp projection RPC
--   5. service-role-only execution
--
-- This migration DOES NOT:
--
--   - upload conversions
--   - call Google or Meta
--   - infer advertising consent from analytics consent
--   - manufacture fbc / fbp values
--   - alter existing tracking behavior
-- ============================================================


-- ============================================================
-- 0. SAFETY PRECONDITIONS
-- ============================================================

do $migration$
begin

  if to_regclass(
       'public.tracking_consent_events'
     ) is not null then

    raise exception
      '034 abort: public.tracking_consent_events already exists';

  end if;


  if to_regclass(
       'public.web_sessions'
     ) is null then

    raise exception
      '034 abort: public.web_sessions is missing';

  end if;


  if to_regclass(
       'public.touchpoints'
     ) is null then

    raise exception
      '034 abort: public.touchpoints is missing';

  end if;


  if to_regclass(
       'public.raw_events'
     ) is null then

    raise exception
      '034 abort: public.raw_events is missing';

  end if;

end;
$migration$;


-- ============================================================
-- 1. PROVIDER MATCH SIGNALS
-- ============================================================

alter table public.web_sessions

  add column fbc text null,

  add column fbp text null;


alter table public.touchpoints

  add column fbc text null,

  add column fbp text null;


alter table public.web_sessions

  add constraint web_sessions_fbc_length_check

    check (
      fbc is null
      or length(fbc) <= 500
    ),

  add constraint web_sessions_fbp_length_check

    check (
      fbp is null
      or length(fbp) <= 500
    );


alter table public.touchpoints

  add constraint touchpoints_fbc_length_check

    check (
      fbc is null
      or length(fbc) <= 500
    ),

  add constraint touchpoints_fbp_length_check

    check (
      fbp is null
      or length(fbp) <= 500
    );


comment on column public.web_sessions.fbc is
  'Observed Meta _fbc browser value when available. Never manufactured server-side.';


comment on column public.web_sessions.fbp is
  'Observed Meta _fbp browser value when available. Never manufactured server-side.';


comment on column public.touchpoints.fbc is
  'Observed Meta _fbc value associated with this event when available.';


comment on column public.touchpoints.fbp is
  'Observed Meta _fbp value associated with this event when available.';


-- ============================================================
-- 2. IMMUTABLE CONSENT LEDGER
-- ============================================================

create table public.tracking_consent_events (

  id uuid
    primary key
    default gen_random_uuid(),


  organization_id uuid
    not null
    references public.organizations(id),


  source_event_id text
    not null,


  raw_event_id uuid
    null
    references public.raw_events(id),


  anonymous_visitor_id text
    null,


  session_key text
    null,


  site text
    null,


  consent_analytics boolean
    null,


  consent_ad_user_data boolean
    null,


  consent_ad_personalization boolean
    null,


  consent_marketing boolean
    null,


  consent_mode text
    null,


  consent_source text
    not null
    default 'yk_tracker',


  occurred_at timestamptz
    not null,


  received_at timestamptz
    not null
    default now(),


  metadata jsonb
    not null
    default '{}'::jsonb,


  constraint tracking_consent_events_source_event_id_check

    check (
      length(
        btrim(source_event_id)
      ) between 1 and 120
    ),


  constraint tracking_consent_events_visitor_length_check

    check (
      anonymous_visitor_id is null
      or length(anonymous_visitor_id) <= 200
    ),


  constraint tracking_consent_events_session_length_check

    check (
      session_key is null
      or length(session_key) <= 200
    ),


  constraint tracking_consent_events_site_length_check

    check (
      site is null
      or length(site) <= 255
    ),


  constraint tracking_consent_events_mode_length_check

    check (
      consent_mode is null
      or length(consent_mode) <= 60
    ),


  constraint tracking_consent_events_source_length_check

    check (
      length(
        btrim(consent_source)
      ) between 1 and 100
    ),


  constraint tracking_consent_events_state_check

    check (

      consent_analytics is not null

      or consent_ad_user_data
         is not null

      or consent_ad_personalization
         is not null

      or consent_marketing
         is not null

    ),


  constraint tracking_consent_events_metadata_object_check

    check (
      jsonb_typeof(metadata) =
      'object'
    ),


  constraint tracking_consent_events_org_source_unique

    unique (
      organization_id,
      source_event_id
    )

);


create unique index
  uq_tracking_consent_events_raw_event

on public.tracking_consent_events (
  raw_event_id
)

where raw_event_id is not null;


create index
  idx_tracking_consent_events_org_occurred

on public.tracking_consent_events (
  organization_id,
  occurred_at desc,
  id
);


create index
  idx_tracking_consent_events_org_visitor

on public.tracking_consent_events (
  organization_id,
  anonymous_visitor_id,
  occurred_at desc
)

where anonymous_visitor_id is not null;


create index
  idx_tracking_consent_events_org_session

on public.tracking_consent_events (
  organization_id,
  session_key,
  occurred_at desc
)

where session_key is not null;


comment on table public.tracking_consent_events is
  'Immutable tenant-scoped ledger of browser consent state changes. NULL consent fields mean unknown; analytics consent never implies advertising consent.';


-- ============================================================
-- 3. INSERT VALIDATION
-- ============================================================

create or replace function
public.validate_tracking_consent_event()

returns trigger

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

declare

  v_raw_organization_id uuid;

  v_raw_source_system text;

  v_raw_source_event_id text;

begin

  new.source_event_id :=
    btrim(
      new.source_event_id
    );


  new.consent_source :=
    btrim(
      new.consent_source
    );


  new.anonymous_visitor_id :=
    nullif(
      btrim(
        coalesce(
          new.anonymous_visitor_id,
          ''
        )
      ),
      ''
    );


  new.session_key :=
    nullif(
      btrim(
        coalesce(
          new.session_key,
          ''
        )
      ),
      ''
    );


  new.site :=
    nullif(
      btrim(
        coalesce(
          new.site,
          ''
        )
      ),
      ''
    );


  new.consent_mode :=
    nullif(
      btrim(
        coalesce(
          new.consent_mode,
          ''
        )
      ),
      ''
    );


  if new.received_at is null then

    new.received_at :=
      now();

  end if;


  if new.raw_event_id is not null then

    select

      re.organization_id,

      re.source_system,

      re.source_event_id

    into

      v_raw_organization_id,

      v_raw_source_system,

      v_raw_source_event_id

    from public.raw_events re

    where re.id =
          new.raw_event_id;


    if not found then

      raise exception
        'Referenced raw event does not exist';

    end if;


    if v_raw_organization_id
       is distinct from
       new.organization_id then

      raise exception
        'Consent/raw-event tenant mismatch';

    end if;


    if v_raw_source_system
       is distinct from
       'website' then

      raise exception
        'Consent raw event must be a website event';

    end if;


    if v_raw_source_event_id
       is distinct from
       new.source_event_id then

      raise exception
        'Consent source_event_id does not match raw event';

    end if;

  end if;


  return new;

end;

$function$;


create trigger
  trg_validate_tracking_consent_event

before insert
on public.tracking_consent_events

for each row

execute function
  public.validate_tracking_consent_event();


-- ============================================================
-- 4. IMMUTABILITY
-- ============================================================

create or replace function
public.prevent_tracking_consent_event_mutation()

returns trigger

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

begin

  raise exception
    'tracking_consent_events is immutable';

end;

$function$;


create trigger
  trg_prevent_tracking_consent_event_mutation

before update or delete
on public.tracking_consent_events

for each row

execute function
  public.prevent_tracking_consent_event_mutation();


-- ============================================================
-- 5. IDEMPOTENT CONSENT INGESTION
-- ============================================================

create or replace function
public.ingest_tracking_consent_event(

  p_organization_id uuid,

  p_source_event_id text,

  p_occurred_at timestamptz,

  p_anonymous_visitor_id text
    default null,

  p_session_key text
    default null,

  p_site text
    default null,

  p_consent_analytics boolean
    default null,

  p_consent_ad_user_data boolean
    default null,

  p_consent_ad_personalization boolean
    default null,

  p_consent_marketing boolean
    default null,

  p_consent_mode text
    default null,

  p_consent_source text
    default 'yk_tracker',

  p_raw_event_id uuid
    default null,

  p_metadata jsonb
    default '{}'::jsonb

)

returns jsonb

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

declare

  v_id uuid;

  v_created boolean := false;

  v_existing
    public.tracking_consent_events%rowtype;


  v_source_event_id text :=
    nullif(
      btrim(
        coalesce(
          p_source_event_id,
          ''
        )
      ),
      ''
    );


  v_visitor text :=
    nullif(
      btrim(
        coalesce(
          p_anonymous_visitor_id,
          ''
        )
      ),
      ''
    );


  v_session text :=
    nullif(
      btrim(
        coalesce(
          p_session_key,
          ''
        )
      ),
      ''
    );


  v_site text :=
    nullif(
      btrim(
        coalesce(
          p_site,
          ''
        )
      ),
      ''
    );


  v_mode text :=
    nullif(
      btrim(
        coalesce(
          p_consent_mode,
          ''
        )
      ),
      ''
    );


  v_source text :=
    nullif(
      btrim(
        coalesce(
          p_consent_source,
          ''
        )
      ),
      ''
    );

begin

  if p_organization_id is null then

    raise exception
      'organization_id is required';

  end if;


  if not exists (

    select 1

    from public.organizations o

    where o.id =
          p_organization_id

  ) then

    raise exception
      'organization does not exist';

  end if;


  if v_source_event_id is null then

    raise exception
      'source_event_id is required';

  end if;


  if p_occurred_at is null then

    raise exception
      'occurred_at is required';

  end if;


  if v_source is null then

    raise exception
      'consent_source is required';

  end if;


  if p_consent_analytics is null
     and p_consent_ad_user_data is null
     and p_consent_ad_personalization is null
     and p_consent_marketing is null then

    raise exception
      'at least one consent state is required';

  end if;


  if jsonb_typeof(
       coalesce(
         p_metadata,
         '{}'::jsonb
       )
     ) <>
     'object' then

    raise exception
      'metadata must be a JSON object';

  end if;


  insert into public.tracking_consent_events (

    organization_id,

    source_event_id,

    raw_event_id,

    anonymous_visitor_id,

    session_key,

    site,

    consent_analytics,

    consent_ad_user_data,

    consent_ad_personalization,

    consent_marketing,

    consent_mode,

    consent_source,

    occurred_at,

    metadata

  )

  values (

    p_organization_id,

    v_source_event_id,

    p_raw_event_id,

    v_visitor,

    v_session,

    v_site,

    p_consent_analytics,

    p_consent_ad_user_data,

    p_consent_ad_personalization,

    p_consent_marketing,

    v_mode,

    v_source,

    p_occurred_at,

    coalesce(
      p_metadata,
      '{}'::jsonb
    )

  )

  on conflict (
    organization_id,
    source_event_id
  )

  do nothing

  returning id

  into v_id;


  if v_id is not null then

    v_created :=
      true;

  else

    select e.*

    into v_existing

    from public.tracking_consent_events e

    where e.organization_id =
          p_organization_id

      and e.source_event_id =
          v_source_event_id;


    if not found then

      raise exception
        'Unable to resolve idempotent consent event';

    end if;


    if v_existing.raw_event_id
         is distinct from
       p_raw_event_id

       or v_existing.anonymous_visitor_id
            is distinct from
          v_visitor

       or v_existing.session_key
            is distinct from
          v_session

       or v_existing.site
            is distinct from
          v_site

       or v_existing.consent_analytics
            is distinct from
          p_consent_analytics

       or v_existing.consent_ad_user_data
            is distinct from
          p_consent_ad_user_data

       or v_existing.consent_ad_personalization
            is distinct from
          p_consent_ad_personalization

       or v_existing.consent_marketing
            is distinct from
          p_consent_marketing

       or v_existing.consent_mode
            is distinct from
          v_mode

       or v_existing.consent_source
            is distinct from
          v_source

       or v_existing.occurred_at
            is distinct from
          p_occurred_at

       or v_existing.metadata
            is distinct from
          coalesce(
            p_metadata,
            '{}'::jsonb
          ) then

      raise exception
        'Consent idempotency conflict for source_event_id %',
        v_source_event_id;

    end if;


    v_id :=
      v_existing.id;

  end if;


  return jsonb_build_object(

    'ok',
      true,

    'created',
      v_created,

    'id',
      v_id,

    'organization_id',
      p_organization_id,

    'source_event_id',
      v_source_event_id

  );

end;

$function$;


-- ============================================================
-- 6. PROJECT OBSERVED FBC / FBP FROM RAW EVENT
-- ============================================================

create or replace function
public.apply_tracking_match_signals(

  p_organization_id uuid,

  p_raw_event_id uuid

)

returns jsonb

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

declare

  v_raw public.raw_events%rowtype;

  v_fbc text;

  v_fbp text;

  v_session_key text;

  v_event_id text;

  v_session_rows integer := 0;

  v_touchpoint_rows integer := 0;

begin

  if p_organization_id is null then

    raise exception
      'organization_id is required';

  end if;


  if p_raw_event_id is null then

    raise exception
      'raw_event_id is required';

  end if;


  select re.*

  into v_raw

  from public.raw_events re

  where re.id =
        p_raw_event_id

    and re.organization_id =
        p_organization_id

    and re.source_system =
        'website';


  if not found then

    raise exception
      'Tenant-owned website raw event not found';

  end if;


  v_fbc :=
    nullif(
      btrim(
        coalesce(
          v_raw.payload ->> 'fbc',
          ''
        )
      ),
      ''
    );


  v_fbp :=
    nullif(
      btrim(
        coalesce(
          v_raw.payload ->> 'fbp',
          ''
        )
      ),
      ''
    );


  if v_fbc is not null
     and length(v_fbc) > 500 then

    raise exception
      'fbc exceeds maximum length';

  end if;


  if v_fbp is not null
     and length(v_fbp) > 500 then

    raise exception
      'fbp exceeds maximum length';

  end if;


  v_session_key :=
    coalesce(

      nullif(
        btrim(
          coalesce(
            v_raw.session_key,
            ''
          )
        ),
        ''
      ),

      nullif(
        btrim(
          coalesce(
            v_raw.payload ->> 'sessionKey',
            ''
          )
        ),
        ''
      )

    );


  v_event_id :=
    nullif(
      btrim(
        coalesce(
          v_raw.source_event_id,
          ''
        )
      ),
      ''
    );


  if v_fbc is null
     and v_fbp is null then

    return jsonb_build_object(

      'ok',
        true,

      'signals_present',
        false,

      'session_rows',
        0,

      'touchpoint_rows',
        0

    );

  end if;


  if v_session_key is not null then

    update public.web_sessions ws

    set

      fbc =
        coalesce(
          v_fbc,
          ws.fbc
        ),

      fbp =
        coalesce(
          v_fbp,
          ws.fbp
        )

    where ws.organization_id =
          p_organization_id

      and ws.session_key =
          v_session_key;


    get diagnostics
      v_session_rows =
        row_count;

  end if;


  if v_event_id is not null then

    update public.touchpoints tp

    set

      fbc =
        coalesce(
          v_fbc,
          tp.fbc
        ),

      fbp =
        coalesce(
          v_fbp,
          tp.fbp
        )

    where tp.organization_id =
          p_organization_id

      and tp.event_id =
          v_event_id;


    get diagnostics
      v_touchpoint_rows =
        row_count;

  end if;


  return jsonb_build_object(

    'ok',
      true,

    'signals_present',
      true,

    'session_rows',
      v_session_rows,

    'touchpoint_rows',
      v_touchpoint_rows

  );

end;

$function$;


-- ============================================================
-- 7. RLS
-- ============================================================

alter table
  public.tracking_consent_events

enable row level security;


-- ============================================================
-- 8. TABLE PRIVILEGES
-- ============================================================

revoke all
on table
  public.tracking_consent_events
from public, anon, authenticated;


revoke all
on table
  public.tracking_consent_events
from service_role;


grant select
on table
  public.tracking_consent_events
to service_role;


-- ============================================================
-- 9. FUNCTION PRIVILEGES
-- ============================================================

revoke all
on function
  public.validate_tracking_consent_event()
from public, anon, authenticated;


revoke all
on function
  public.prevent_tracking_consent_event_mutation()
from public, anon, authenticated;


revoke all
on function
  public.ingest_tracking_consent_event(
    uuid,
    text,
    timestamptz,
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    text,
    text,
    uuid,
    jsonb
  )
from public, anon, authenticated;


revoke all
on function
  public.apply_tracking_match_signals(
    uuid,
    uuid
  )
from public, anon, authenticated;


grant execute
on function
  public.validate_tracking_consent_event()
to service_role;


grant execute
on function
  public.prevent_tracking_consent_event_mutation()
to service_role;


grant execute
on function
  public.ingest_tracking_consent_event(
    uuid,
    text,
    timestamptz,
    text,
    text,
    text,
    boolean,
    boolean,
    boolean,
    boolean,
    text,
    text,
    uuid,
    jsonb
  )
to service_role;


grant execute
on function
  public.apply_tracking_match_signals(
    uuid,
    uuid
  )
to service_role;


-- ============================================================
-- 10. FINAL STRUCTURAL ASSERTIONS
-- ============================================================

do $verification$
begin

  if to_regclass(
       'public.tracking_consent_events'
     ) is null then

    raise exception
      '034 verification failed: consent ledger missing';

  end if;


  if not exists (

    select 1

    from information_schema.columns c

    where c.table_schema =
          'public'

      and c.table_name =
          'web_sessions'

      and c.column_name =
          'fbc'

  ) then

    raise exception
      '034 verification failed: web_sessions.fbc missing';

  end if;


  if not exists (

    select 1

    from information_schema.columns c

    where c.table_schema =
          'public'

      and c.table_name =
          'web_sessions'

      and c.column_name =
          'fbp'

  ) then

    raise exception
      '034 verification failed: web_sessions.fbp missing';

  end if;


  if not exists (

    select 1

    from information_schema.columns c

    where c.table_schema =
          'public'

      and c.table_name =
          'touchpoints'

      and c.column_name =
          'fbc'

  ) then

    raise exception
      '034 verification failed: touchpoints.fbc missing';

  end if;


  if not exists (

    select 1

    from information_schema.columns c

    where c.table_schema =
          'public'

      and c.table_name =
          'touchpoints'

      and c.column_name =
          'fbp'

  ) then

    raise exception
      '034 verification failed: touchpoints.fbp missing';

  end if;


  if not (

    select c.relrowsecurity

    from pg_class c

    where c.oid =
          'public.tracking_consent_events'::regclass

  ) then

    raise exception
      '034 verification failed: consent ledger RLS disabled';

  end if;

end;
$verification$;


commit;
