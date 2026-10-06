begin;

-- ============================================================
-- MIGRATION 032
-- CANONICAL CONVERSION FEEDBACK FOUNDATION
--
-- Creates:
--
--   conversion_feedback_routes
--   conversion_feedback_deliveries
--   conversion_feedback_attempts
--
-- Architecture:
--
-- canonical conversion fact
--        ↓
-- feedback route
--        ↓
-- idempotent delivery
--        ↓
-- immutable delivery attempts
--
-- Provider credentials remain in the existing integration
-- platform / server environment. They are never copied here.
-- ============================================================


-- ============================================================
-- 1. CONVERSION FEEDBACK ROUTES
-- ============================================================

create table public.conversion_feedback_routes (

  id uuid
    primary key
    default gen_random_uuid(),

  organization_id uuid
    not null
    references public.organizations(id)
    on delete cascade,

  connection_id uuid
    not null
    references public.integration_connections(id)
    on delete restrict,

  integration_asset_id uuid
    not null
    references public.integration_assets(id)
    on delete restrict,

  route_key text
    not null,

  name text
    not null,

  conversion_type text
    not null,

  destination_kind text
    not null,

  destination_external_id text,

  destination_event_name text,

  status text
    not null
    default 'inactive',

  provider_config jsonb
    not null
    default '{}'::jsonb,

  max_attempts integer
    not null
    default 5,

  base_retry_seconds integer
    not null
    default 60,

  max_retry_seconds integer
    not null
    default 3600,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint conversion_feedback_routes_key_nonempty
    check (
      nullif(
        btrim(route_key),
        ''
      ) is not null
    ),

  constraint conversion_feedback_routes_name_nonempty
    check (
      nullif(
        btrim(name),
        ''
      ) is not null
    ),

  constraint conversion_feedback_routes_conversion_type_nonempty
    check (
      nullif(
        btrim(conversion_type),
        ''
      ) is not null
    ),

  constraint conversion_feedback_routes_destination_kind_check
    check (
      destination_kind in (
        'google_ads_conversion_action',
        'meta_dataset_event'
      )
    ),

  constraint conversion_feedback_routes_status_check
    check (
      status in (
        'inactive',
        'active'
      )
    ),

  constraint conversion_feedback_routes_provider_config_object
    check (
      jsonb_typeof(provider_config) =
      'object'
    ),

  constraint conversion_feedback_routes_max_attempts_check
    check (
      max_attempts between 1 and 20
    ),

  constraint conversion_feedback_routes_base_retry_check
    check (
      base_retry_seconds
      between 10 and 86400
    ),

  constraint conversion_feedback_routes_max_retry_check
    check (
      max_retry_seconds >=
      base_retry_seconds

      and max_retry_seconds <=
      604800
    ),

  constraint conversion_feedback_routes_org_key_unique
    unique (
      organization_id,
      route_key
    )
);


create index conversion_feedback_routes_org_status_idx
  on public.conversion_feedback_routes (
    organization_id,
    status
  );


create index conversion_feedback_routes_connection_idx
  on public.conversion_feedback_routes (
    connection_id
  );


create index conversion_feedback_routes_asset_idx
  on public.conversion_feedback_routes (
    integration_asset_id
  );


-- ============================================================
-- 2. ROUTE VALIDATION
-- ============================================================

create or replace function
public.validate_conversion_feedback_route()
returns trigger
language plpgsql
set search_path =
  'public',
  'pg_temp'
as $function$

declare

  v_connection_organization_id uuid;
  v_provider text;
  v_connection_status text;

  v_asset_organization_id uuid;
  v_asset_connection_id uuid;
  v_asset_type text;
  v_asset_status text;
  v_asset_selected boolean;

  v_has_deliveries boolean := false;

begin

  new.route_key :=
    btrim(
      new.route_key
    );

  new.name :=
    btrim(
      new.name
    );

  new.conversion_type :=
    btrim(
      new.conversion_type
    );

  new.destination_kind :=
    btrim(
      new.destination_kind
    );

  new.destination_external_id :=
    nullif(
      btrim(
        coalesce(
          new.destination_external_id,
          ''
        )
      ),
      ''
    );

  new.destination_event_name :=
    nullif(
      btrim(
        coalesce(
          new.destination_event_name,
          ''
        )
      ),
      ''
    );


  select
    ic.organization_id,
    ic.provider,
    ic.status

  into
    v_connection_organization_id,
    v_provider,
    v_connection_status

  from public.integration_connections ic

  where ic.id =
        new.connection_id;


  if not found then
    raise exception
      'Conversion feedback connection does not exist';
  end if;


  new.organization_id :=
    v_connection_organization_id;


  select
    ia.organization_id,
    ia.connection_id,
    ia.asset_type,
    ia.status,
    ia.is_selected

  into
    v_asset_organization_id,
    v_asset_connection_id,
    v_asset_type,
    v_asset_status,
    v_asset_selected

  from public.integration_assets ia

  where ia.id =
        new.integration_asset_id;


  if not found then
    raise exception
      'Conversion feedback integration asset does not exist';
  end if;


  if v_asset_organization_id is distinct from
     v_connection_organization_id then

    raise exception
      'Conversion feedback asset must belong to the connection organization';

  end if;


  if v_asset_connection_id is distinct from
     new.connection_id then

    raise exception
      'Conversion feedback asset must belong to the selected connection';

  end if;


  if v_provider = 'google' then

    if v_asset_type <>
       'google_ads_customer' then

      raise exception
        'Google conversion feedback requires a google_ads_customer asset';

    end if;


    if new.destination_kind <>
       'google_ads_conversion_action' then

      raise exception
        'Google conversion feedback requires destination_kind=google_ads_conversion_action';

    end if;


  elsif v_provider = 'meta' then

    if v_asset_type <>
       'meta_ad_account' then

      raise exception
        'Meta conversion feedback requires a meta_ad_account asset';

    end if;


    if new.destination_kind <>
       'meta_dataset_event' then

      raise exception
        'Meta conversion feedback requires destination_kind=meta_dataset_event';

    end if;


  else

    raise exception
      'Conversion feedback currently supports only Google and Meta connections';

  end if;


  if new.status =
     'active' then

    if v_connection_status <>
       'connected' then

      raise exception
        'Conversion feedback route requires an active integration connection';

    end if;


    if v_asset_selected is distinct from true
       or v_asset_status =
          'unavailable' then

      raise exception
        'Conversion feedback route requires a selected available integration asset';

    end if;


    if new.destination_external_id
       is null then

      raise exception
        'Active conversion feedback route requires a destination external ID';

    end if;


    if v_provider =
       'meta'
       and new.destination_event_name
           is null then

      raise exception
        'Active Meta conversion feedback route requires an event name';

    end if;

  end if;


  new.provider_config :=
    coalesce(
      new.provider_config,
      '{}'::jsonb
    );


  if tg_op =
     'UPDATE' then

    select exists (
      select 1

      from public.conversion_feedback_deliveries d

      where d.route_id =
            old.id
    )
    into v_has_deliveries;


    if v_has_deliveries then

      if new.organization_id
           is distinct from
         old.organization_id

         or new.connection_id
           is distinct from
         old.connection_id

         or new.integration_asset_id
           is distinct from
         old.integration_asset_id

         or new.route_key
           is distinct from
         old.route_key

         or new.conversion_type
           is distinct from
         old.conversion_type

         or new.destination_kind
           is distinct from
         old.destination_kind

         or new.destination_external_id
           is distinct from
         old.destination_external_id

         or new.destination_event_name
           is distinct from
         old.destination_event_name

         or new.provider_config
           is distinct from
         old.provider_config

      then

        raise exception
          'Conversion feedback route mapping cannot change after deliveries exist';

      end if;

    end if;

  end if;


  return new;

end;

$function$;


create trigger
conversion_feedback_routes_validate

before insert or update
on public.conversion_feedback_routes

for each row

execute function
public.validate_conversion_feedback_route();


create trigger
conversion_feedback_routes_set_updated_at

before update
on public.conversion_feedback_routes

for each row

execute function
public.set_updated_at();


-- ============================================================
-- 3. CONVERSION FEEDBACK DELIVERIES
-- ============================================================

create table public.conversion_feedback_deliveries (

  id uuid
    primary key
    default gen_random_uuid(),

  organization_id uuid
    not null
    references public.organizations(id)
    on delete cascade,

  route_id uuid
    not null
    references public.conversion_feedback_routes(id)
    on delete restrict,

  lead_id uuid
    not null
    references public.leads(id)
    on delete restrict,

  conversion_fact_key text
    not null,

  conversion_type text
    not null,

  authority_level text
    not null,

  source_table text
    not null,

  source_id uuid
    not null,

  conversion_at timestamptz
    not null,

  amount numeric,

  currency text,

  payment_kind text,

  status text
    not null
    default 'queued',

  attempt_count integer
    not null
    default 0,

  max_attempts integer
    not null
    default 5,

  base_retry_seconds integer
    not null
    default 60,

  max_retry_seconds integer
    not null
    default 3600,

  next_retry_at timestamptz,

  last_attempt_at timestamptz,

  lease_token uuid,

  lease_expires_at timestamptz,

  delivered_at timestamptz,

  failed_at timestamptz,

  skipped_at timestamptz,

  provider_event_id text,

  last_error_code text,

  last_error_message text,

  skip_reason text,

  provider_config_snapshot jsonb
    not null
    default '{}'::jsonb,

  delivery_metadata jsonb
    not null
    default '{}'::jsonb,

  queued_at timestamptz
    not null
    default now(),

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint conversion_feedback_deliveries_fact_key_nonempty
    check (
      nullif(
        btrim(conversion_fact_key),
        ''
      ) is not null
    ),

  constraint conversion_feedback_deliveries_conversion_type_nonempty
    check (
      nullif(
        btrim(conversion_type),
        ''
      ) is not null
    ),

  constraint conversion_feedback_deliveries_authority_check
    check (
      authority_level in (
        'transactional',
        'operational'
      )
    ),

  constraint conversion_feedback_deliveries_status_check
    check (
      status in (
        'queued',
        'processing',
        'delivered',
        'retryable_failed',
        'permanent_failed',
        'skipped'
      )
    ),

  constraint conversion_feedback_deliveries_attempt_count_check
    check (
      attempt_count >= 0
    ),

  constraint conversion_feedback_deliveries_max_attempts_check
    check (
      max_attempts between 1 and 20
    ),

  constraint conversion_feedback_deliveries_retry_check
    check (
      base_retry_seconds
        between 10 and 86400

      and max_retry_seconds >=
          base_retry_seconds

      and max_retry_seconds <=
          604800
    ),

  constraint conversion_feedback_deliveries_currency_check
    check (
      currency is null
      or currency ~ '^[A-Z]{3}$'
    ),

  constraint conversion_feedback_deliveries_provider_config_object
    check (
      jsonb_typeof(
        provider_config_snapshot
      ) =
      'object'
    ),

  constraint conversion_feedback_deliveries_metadata_object
    check (
      jsonb_typeof(
        delivery_metadata
      ) =
      'object'
    ),

  constraint conversion_feedback_delivery_idempotency
    unique (
      route_id,
      conversion_fact_key
    )
);


create index conversion_feedback_deliveries_org_status_idx
  on public.conversion_feedback_deliveries (
    organization_id,
    status,
    next_retry_at,
    queued_at
  );


create index conversion_feedback_deliveries_route_idx
  on public.conversion_feedback_deliveries (
    route_id,
    created_at desc
  );


create index conversion_feedback_deliveries_lead_idx
  on public.conversion_feedback_deliveries (
    lead_id,
    conversion_at desc
  );


create index conversion_feedback_deliveries_claim_idx
  on public.conversion_feedback_deliveries (
    organization_id,
    next_retry_at,
    queued_at
  )
  where status in (
    'queued',
    'retryable_failed'
  );


create index conversion_feedback_deliveries_lease_idx
  on public.conversion_feedback_deliveries (
    lease_expires_at
  )
  where status =
        'processing';


-- ============================================================
-- 4. DELIVERY SCOPE + IMMUTABLE FACT SNAPSHOT
-- ============================================================

create or replace function
public.validate_conversion_feedback_delivery()
returns trigger
language plpgsql
set search_path =
  'public',
  'pg_temp'
as $function$

declare

  v_route_organization_id uuid;
  v_route_status text;
  v_route_conversion_type text;

  v_route_max_attempts integer;
  v_route_base_retry_seconds integer;
  v_route_max_retry_seconds integer;

  v_route_provider_config jsonb;

  v_lead_organization_id uuid;

begin

  if tg_op =
     'UPDATE' then

    if new.organization_id
         is distinct from
       old.organization_id

       or new.route_id
         is distinct from
       old.route_id

       or new.lead_id
         is distinct from
       old.lead_id

       or new.conversion_fact_key
         is distinct from
       old.conversion_fact_key

       or new.conversion_type
         is distinct from
       old.conversion_type

       or new.authority_level
         is distinct from
       old.authority_level

       or new.source_table
         is distinct from
       old.source_table

       or new.source_id
         is distinct from
       old.source_id

       or new.conversion_at
         is distinct from
       old.conversion_at

       or new.amount
         is distinct from
       old.amount

       or new.currency
         is distinct from
       old.currency

       or new.payment_kind
         is distinct from
       old.payment_kind

       or new.max_attempts
         is distinct from
       old.max_attempts

       or new.base_retry_seconds
         is distinct from
       old.base_retry_seconds

       or new.max_retry_seconds
         is distinct from
       old.max_retry_seconds

       or new.provider_config_snapshot
         is distinct from
       old.provider_config_snapshot

    then

      raise exception
        'Canonical conversion feedback delivery facts are immutable';

    end if;

  end if;


  select
    r.organization_id,
    r.status,
    r.conversion_type,

    r.max_attempts,
    r.base_retry_seconds,
    r.max_retry_seconds,

    r.provider_config

  into
    v_route_organization_id,
    v_route_status,
    v_route_conversion_type,

    v_route_max_attempts,
    v_route_base_retry_seconds,
    v_route_max_retry_seconds,

    v_route_provider_config

  from public.conversion_feedback_routes r

  where r.id =
        new.route_id;


  if not found then
    raise exception
      'Conversion feedback route does not exist';
  end if;


  new.organization_id :=
    v_route_organization_id;


  if tg_op =
     'INSERT'
     and v_route_status <>
         'active' then

    raise exception
      'New conversion feedback delivery requires an active route';

  end if;


  if new.conversion_type <>
     v_route_conversion_type then

    raise exception
      'Delivery conversion type does not match feedback route';

  end if;


  select
    l.organization_id

  into
    v_lead_organization_id

  from public.leads l

  where l.id =
        new.lead_id;


  if not found then
    raise exception
      'Conversion feedback lead does not exist';
  end if;


  if v_lead_organization_id
       is distinct from
     v_route_organization_id then

    raise exception
      'Conversion feedback lead must belong to the route organization';

  end if;


  if tg_op =
     'INSERT' then

    new.max_attempts :=
      v_route_max_attempts;

    new.base_retry_seconds :=
      v_route_base_retry_seconds;

    new.max_retry_seconds :=
      v_route_max_retry_seconds;

    new.provider_config_snapshot :=
      coalesce(
        v_route_provider_config,
        '{}'::jsonb
      );

    new.currency :=
      case
        when new.currency is null
          then null
        else upper(
          btrim(
            new.currency
          )
        )
      end;

  end if;


  return new;

end;

$function$;


create trigger
conversion_feedback_deliveries_validate

before insert or update
on public.conversion_feedback_deliveries

for each row

execute function
public.validate_conversion_feedback_delivery();


create trigger
conversion_feedback_deliveries_set_updated_at

before update
on public.conversion_feedback_deliveries

for each row

execute function
public.set_updated_at();


-- ============================================================
-- 5. IMMUTABLE DELIVERY ATTEMPTS
-- ============================================================

create table public.conversion_feedback_attempts (

  id uuid
    primary key
    default gen_random_uuid(),

  organization_id uuid
    not null
    references public.organizations(id)
    on delete cascade,

  delivery_id uuid
    not null
    references public.conversion_feedback_deliveries(id)
    on delete restrict,

  attempt_number integer
    not null,

  outcome text
    not null,

  attempted_at timestamptz
    not null
    default now(),

  completed_at timestamptz
    not null
    default now(),

  duration_ms integer,

  http_status integer,

  provider_request_id text,

  provider_response_code text,

  error_code text,

  error_message text,

  request_metadata jsonb
    not null
    default '{}'::jsonb,

  response_metadata jsonb
    not null
    default '{}'::jsonb,

  created_at timestamptz
    not null
    default now(),

  constraint conversion_feedback_attempt_number_check
    check (
      attempt_number >= 1
    ),

  constraint conversion_feedback_attempt_outcome_check
    check (
      outcome in (
        'delivered',
        'retryable_failed',
        'permanent_failed'
      )
    ),

  constraint conversion_feedback_attempt_duration_check
    check (
      duration_ms is null
      or duration_ms >= 0
    ),

  constraint conversion_feedback_attempt_http_status_check
    check (
      http_status is null
      or http_status between 100 and 599
    ),

  constraint conversion_feedback_attempt_request_metadata_object
    check (
      jsonb_typeof(
        request_metadata
      ) =
      'object'
    ),

  constraint conversion_feedback_attempt_response_metadata_object
    check (
      jsonb_typeof(
        response_metadata
      ) =
      'object'
    ),

  constraint conversion_feedback_attempt_delivery_number_unique
    unique (
      delivery_id,
      attempt_number
    )
);


create index conversion_feedback_attempts_org_time_idx
  on public.conversion_feedback_attempts (
    organization_id,
    attempted_at desc
  );


create index conversion_feedback_attempts_delivery_idx
  on public.conversion_feedback_attempts (
    delivery_id,
    attempt_number
  );


-- ============================================================
-- 6. ATTEMPT TENANT SCOPE
-- ============================================================

create or replace function
public.scope_conversion_feedback_attempt()
returns trigger
language plpgsql
set search_path =
  'public',
  'pg_temp'
as $function$

declare

  v_delivery_organization_id uuid;

begin

  select
    d.organization_id

  into
    v_delivery_organization_id

  from public.conversion_feedback_deliveries d

  where d.id =
        new.delivery_id;


  if not found then

    raise exception
      'Conversion feedback delivery does not exist';

  end if;


  new.organization_id :=
    v_delivery_organization_id;


  return new;

end;

$function$;


create trigger
conversion_feedback_attempts_scope

before insert
on public.conversion_feedback_attempts

for each row

execute function
public.scope_conversion_feedback_attempt();


-- ============================================================
-- 7. ATTEMPT IMMUTABILITY
-- ============================================================

create or replace function
public.prevent_conversion_feedback_attempt_mutation()
returns trigger
language plpgsql
set search_path =
  'public',
  'pg_temp'
as $function$

begin

  raise exception
    'Conversion feedback attempt history is immutable';

end;

$function$;


create trigger
conversion_feedback_attempts_immutable

before update or delete
on public.conversion_feedback_attempts

for each row

execute function
public.prevent_conversion_feedback_attempt_mutation();


-- ============================================================
-- 8. RLS
-- ============================================================

alter table
  public.conversion_feedback_routes
enable row level security;


alter table
  public.conversion_feedback_deliveries
enable row level security;


alter table
  public.conversion_feedback_attempts
enable row level security;


-- ============================================================
-- 9. PRIVILEGES
-- ============================================================

revoke all
on table
  public.conversion_feedback_routes,
  public.conversion_feedback_deliveries,
  public.conversion_feedback_attempts
from public, anon, authenticated;


grant
  select,
  insert,
  update,
  delete
on table
  public.conversion_feedback_routes
to service_role;


grant
  select,
  insert,
  update
on table
  public.conversion_feedback_deliveries
to service_role;


grant
  select,
  insert
on table
  public.conversion_feedback_attempts
to service_role;


commit;
