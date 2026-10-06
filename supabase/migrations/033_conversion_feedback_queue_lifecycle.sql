begin;

-- ============================================================
-- MIGRATION 033
-- CONVERSION FEEDBACK QUEUE LIFECYCLE
--
-- Adds:
--
--   enqueue_conversion_feedback
--   recover_stale_conversion_feedback_deliveries
--   claim_conversion_feedback_deliveries
--   complete_conversion_feedback_delivery
--   fail_conversion_feedback_delivery
--   skip_conversion_feedback_delivery
--
-- Guarantees:
--
--   tenant-scoped work
--   idempotent enqueue
--   atomic SKIP LOCKED claiming
--   lease ownership
--   stale lease recovery
--   immutable attempt history
--   bounded exponential retry
--   max-attempt exhaustion
--   service-role-only worker execution
--
-- No Google / Meta API calls occur in this migration.
-- ============================================================


-- ============================================================
-- 1. ENQUEUE CANONICAL CONVERSION FACTS
-- ============================================================

create or replace function
public.enqueue_conversion_feedback(

  p_organization_id uuid,

  p_conversion_fact_key text
    default null,

  p_limit integer
    default 500

)
returns jsonb

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

declare

  v_fact_key text;

  v_candidate_count integer := 0;
  v_inserted_count integer := 0;

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


  if p_limit is null
     or p_limit < 1
     or p_limit > 5000 then

    raise exception
      'p_limit must be between 1 and 5000';

  end if;


  v_fact_key :=
    nullif(
      btrim(
        coalesce(
          p_conversion_fact_key,
          ''
        )
      ),
      ''
    );


  with candidates as (

    select

      r.id
        as route_id,

      f.organization_id,

      f.lead_id,

      f.conversion_fact_key,

      f.conversion_type,

      f.authority_level,

      f.source_table,

      f.source_id,

      f.conversion_at,

      f.amount,

      f.currency,

      f.payment_kind

    from public.conversion_feedback_routes r

    join public.v_lead_conversion_facts f
      on f.organization_id =
         r.organization_id

     and f.conversion_type =
         r.conversion_type

    where r.organization_id =
          p_organization_id

      and r.status =
          'active'

      and (
        v_fact_key is null

        or f.conversion_fact_key =
           v_fact_key
      )

    order by
      f.conversion_at,
      r.id,
      f.conversion_fact_key

    limit p_limit

  ),


  inserted as (

    insert into public.conversion_feedback_deliveries (

      organization_id,

      route_id,

      lead_id,

      conversion_fact_key,

      conversion_type,

      authority_level,

      source_table,

      source_id,

      conversion_at,

      amount,

      currency,

      payment_kind

    )

    select

      c.organization_id,

      c.route_id,

      c.lead_id,

      c.conversion_fact_key,

      c.conversion_type,

      c.authority_level,

      c.source_table,

      c.source_id,

      c.conversion_at,

      c.amount,

      c.currency,

      c.payment_kind

    from candidates c

    on conflict (
      route_id,
      conversion_fact_key
    )
    do nothing

    returning id

  )

  select

    (
      select count(*)
      from candidates
    ),

    (
      select count(*)
      from inserted
    )

  into
    v_candidate_count,
    v_inserted_count;


  return jsonb_build_object(

    'ok',
      true,

    'organization_id',
      p_organization_id,

    'conversion_fact_key',
      v_fact_key,

    'candidate_count',
      v_candidate_count,

    'inserted_count',
      v_inserted_count,

    'already_queued_count',
      greatest(
        v_candidate_count
        - v_inserted_count,
        0
      )

  );

end;

$function$;


-- ============================================================
-- 2. RECOVER STALE LEASES
-- ============================================================

create or replace function
public.recover_stale_conversion_feedback_deliveries(

  p_organization_id uuid,

  p_limit integer
    default 100

)
returns integer

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

declare

  v_delivery record;

  v_attempt_number integer;

  v_outcome text;

  v_next_retry_at timestamptz;

  v_recovered integer := 0;

begin

  if p_organization_id is null then
    raise exception
      'organization_id is required';
  end if;


  if p_limit is null
     or p_limit < 1
     or p_limit > 1000 then

    raise exception
      'p_limit must be between 1 and 1000';

  end if;


  for v_delivery in

    select

      d.id,

      d.organization_id,

      d.attempt_count,

      d.max_attempts,

      d.last_attempt_at,

      d.lease_token,

      d.lease_expires_at

    from public.conversion_feedback_deliveries d

    where d.organization_id =
          p_organization_id

      and d.status =
          'processing'

      and d.lease_expires_at
          is not null

      and d.lease_expires_at <=
          now()

    order by
      d.lease_expires_at,
      d.id

    for update
    skip locked

    limit p_limit

  loop

    v_attempt_number :=
      v_delivery.attempt_count + 1;


    if v_attempt_number >=
       v_delivery.max_attempts then

      v_outcome :=
        'permanent_failed';

      v_next_retry_at :=
        null;

    else

      v_outcome :=
        'retryable_failed';

      v_next_retry_at :=
        now();

    end if;


    insert into public.conversion_feedback_attempts (

      organization_id,

      delivery_id,

      attempt_number,

      outcome,

      attempted_at,

      completed_at,

      error_code,

      error_message,

      request_metadata,

      response_metadata

    )
    values (

      p_organization_id,

      v_delivery.id,

      v_attempt_number,

      v_outcome,

      coalesce(
        v_delivery.last_attempt_at,
        now()
      ),

      now(),

      'lease_expired',

      'Conversion feedback processing lease expired before completion.',

      jsonb_build_object(

        'recovery',
          true,

        'provider_call_state',
          'unknown'

      ),

      '{}'::jsonb

    )

    on conflict (
      delivery_id,
      attempt_number
    )
    do nothing;


    update public.conversion_feedback_deliveries d

    set

      status =
        v_outcome,

      attempt_count =
        v_attempt_number,

      next_retry_at =
        v_next_retry_at,

      lease_token =
        null,

      lease_expires_at =
        null,

      failed_at =
        case

          when v_outcome =
               'permanent_failed'

            then now()

          else null

        end,

      last_error_code =
        'lease_expired',

      last_error_message =
        'Conversion feedback processing lease expired before completion.',

      delivery_metadata =
        coalesce(
          d.delivery_metadata,
          '{}'::jsonb
        )
        ||
        jsonb_build_object(

          'stale_lease_recovered_at',
            now(),

          'stale_attempt_number',
            v_attempt_number

        ),

      updated_at =
        now()

    where d.id =
          v_delivery.id

      and d.organization_id =
          p_organization_id

      and d.status =
          'processing'

      and d.lease_token
          is not distinct from
          v_delivery.lease_token

      and d.lease_expires_at <=
          now();


    if found then

      v_recovered :=
        v_recovered + 1;

    end if;

  end loop;


  return v_recovered;

end;

$function$;


-- ============================================================
-- 3. CLAIM DELIVERIES
-- ============================================================

create or replace function
public.claim_conversion_feedback_deliveries(

  p_organization_id uuid,

  p_limit integer
    default 25,

  p_lease_seconds integer
    default 300

)
returns table (

  delivery_id uuid,

  lease_token uuid,

  attempt_number integer,

  organization_id uuid,

  route_id uuid,

  lead_id uuid,

  conversion_fact_key text,

  conversion_type text,

  authority_level text,

  source_table text,

  source_id uuid,

  conversion_at timestamptz,

  amount numeric,

  currency text,

  payment_kind text,

  connection_id uuid,

  integration_asset_id uuid,

  provider text,

  destination_kind text,

  destination_external_id text,

  destination_event_name text,

  provider_config_snapshot jsonb

)

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

begin

  if p_organization_id is null then
    raise exception
      'organization_id is required';
  end if;


  if p_limit is null
     or p_limit < 1
     or p_limit > 100 then

    raise exception
      'p_limit must be between 1 and 100';

  end if;


  if p_lease_seconds is null
     or p_lease_seconds < 30
     or p_lease_seconds > 3600 then

    raise exception
      'p_lease_seconds must be between 30 and 3600';

  end if;


  perform
    public.recover_stale_conversion_feedback_deliveries(

      p_organization_id,

      greatest(
        p_limit * 4,
        100
      )

    );


  update public.conversion_feedback_deliveries d

  set

    status =
      'permanent_failed',

    next_retry_at =
      null,

    lease_token =
      null,

    lease_expires_at =
      null,

    failed_at =
      coalesce(
        d.failed_at,
        now()
      ),

    last_error_code =
      coalesce(
        d.last_error_code,
        'max_attempts_reached'
      ),

    last_error_message =
      coalesce(
        d.last_error_message,
        'Maximum conversion feedback attempts reached.'
      ),

    updated_at =
      now()

  where d.organization_id =
        p_organization_id

    and d.status in (
      'queued',
      'retryable_failed'
    )

    and d.attempt_count >=
        d.max_attempts;


  return query

  with candidates as (

    select
      d.id

    from public.conversion_feedback_deliveries d

    join public.conversion_feedback_routes r
      on r.id =
         d.route_id

     and r.organization_id =
         d.organization_id

    join public.integration_connections ic
      on ic.id =
         r.connection_id

     and ic.organization_id =
         r.organization_id

    join public.integration_assets ia
      on ia.id =
         r.integration_asset_id

     and ia.organization_id =
         r.organization_id

     and ia.connection_id =
         r.connection_id

    where d.organization_id =
          p_organization_id

      and r.status =
          'active'

      and ic.status =
          'connected'

      and ia.is_selected =
          true

      and ia.status <>
          'unavailable'

      and d.attempt_count <
          d.max_attempts

      and (

        d.status =
          'queued'

        or

        (
          d.status =
            'retryable_failed'

          and (

            d.next_retry_at
              is null

            or d.next_retry_at <=
               now()

          )

        )

      )

    order by

      case d.status

        when 'retryable_failed'
          then 0

        else 1

      end,

      coalesce(
        d.next_retry_at,
        d.queued_at
      ),

      d.queued_at,

      d.id

    for update of d
    skip locked

    limit p_limit

  ),


  claimed as (

    update public.conversion_feedback_deliveries d

    set

      status =
        'processing',

      last_attempt_at =
        now(),

      next_retry_at =
        null,

      lease_token =
        gen_random_uuid(),

      lease_expires_at =
        now()
        +
        make_interval(
          secs =>
            p_lease_seconds
        ),

      failed_at =
        null,

      skipped_at =
        null,

      skip_reason =
        null,

      last_error_code =
        null,

      last_error_message =
        null,

      updated_at =
        now()

    from candidates c

    where d.id =
          c.id

      and d.organization_id =
          p_organization_id

    returning

      d.id,

      d.lease_token,

      d.attempt_count,

      d.organization_id,

      d.route_id,

      d.lead_id,

      d.conversion_fact_key,

      d.conversion_type,

      d.authority_level,

      d.source_table,

      d.source_id,

      d.conversion_at,

      d.amount,

      d.currency,

      d.payment_kind,

      d.provider_config_snapshot

  )

  select

    c.id
      as delivery_id,

    c.lease_token,

    c.attempt_count + 1
      as attempt_number,

    c.organization_id,

    c.route_id,

    c.lead_id,

    c.conversion_fact_key,

    c.conversion_type,

    c.authority_level,

    c.source_table,

    c.source_id,

    c.conversion_at,

    c.amount,

    c.currency,

    c.payment_kind,

    r.connection_id,

    r.integration_asset_id,

    ic.provider,

    r.destination_kind,

    r.destination_external_id,

    r.destination_event_name,

    c.provider_config_snapshot

  from claimed c

  join public.conversion_feedback_routes r
    on r.id =
       c.route_id

   and r.organization_id =
       c.organization_id

  join public.integration_connections ic
    on ic.id =
       r.connection_id

   and ic.organization_id =
       c.organization_id

  order by
    c.conversion_at,
    c.id;

end;

$function$;


-- ============================================================
-- 4. COMPLETE SUCCESSFUL DELIVERY
-- ============================================================

create or replace function
public.complete_conversion_feedback_delivery(

  p_organization_id uuid,

  p_delivery_id uuid,

  p_lease_token uuid,

  p_provider_event_id text
    default null,

  p_http_status integer
    default null,

  p_provider_request_id text
    default null,

  p_provider_response_code text
    default null,

  p_request_metadata jsonb
    default '{}'::jsonb,

  p_response_metadata jsonb
    default '{}'::jsonb,

  p_duration_ms integer
    default null

)
returns jsonb

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

declare

  v_delivery
    public.conversion_feedback_deliveries%rowtype;

  v_attempt_number integer;

begin

  if p_organization_id is null
     or p_delivery_id is null
     or p_lease_token is null then

    raise exception
      'organization_id, delivery_id and lease_token are required';

  end if;


  if p_http_status is not null
     and (
       p_http_status < 100
       or p_http_status > 599
     ) then

    raise exception
      'http_status must be between 100 and 599';

  end if;


  if p_duration_ms is not null
     and p_duration_ms < 0 then

    raise exception
      'duration_ms must be >= 0';

  end if;


  if jsonb_typeof(
       coalesce(
         p_request_metadata,
         '{}'::jsonb
       )
     ) <>
     'object' then

    raise exception
      'request_metadata must be a JSON object';

  end if;


  if jsonb_typeof(
       coalesce(
         p_response_metadata,
         '{}'::jsonb
       )
     ) <>
     'object' then

    raise exception
      'response_metadata must be a JSON object';

  end if;


  select d.*

  into v_delivery

  from public.conversion_feedback_deliveries d

  where d.organization_id =
        p_organization_id

    and d.id =
        p_delivery_id

    and d.status =
        'processing'

    and d.lease_token =
        p_lease_token

    and d.lease_expires_at >
        now()

  for update;


  if not found then

    return jsonb_build_object(

      'ok',
        false,

      'updated',
        false,

      'reason',
        'lease_not_owned_or_expired'

    );

  end if;


  v_attempt_number :=
    v_delivery.attempt_count + 1;


  insert into public.conversion_feedback_attempts (

    organization_id,

    delivery_id,

    attempt_number,

    outcome,

    attempted_at,

    completed_at,

    duration_ms,

    http_status,

    provider_request_id,

    provider_response_code,

    request_metadata,

    response_metadata

  )
  values (

    p_organization_id,

    p_delivery_id,

    v_attempt_number,

    'delivered',

    coalesce(
      v_delivery.last_attempt_at,
      now()
    ),

    now(),

    p_duration_ms,

    p_http_status,

    nullif(
      btrim(
        coalesce(
          p_provider_request_id,
          ''
        )
      ),
      ''
    ),

    nullif(
      btrim(
        coalesce(
          p_provider_response_code,
          ''
        )
      ),
      ''
    ),

    coalesce(
      p_request_metadata,
      '{}'::jsonb
    ),

    coalesce(
      p_response_metadata,
      '{}'::jsonb
    )

  );


  update public.conversion_feedback_deliveries d

  set

    status =
      'delivered',

    attempt_count =
      v_attempt_number,

    next_retry_at =
      null,

    lease_token =
      null,

    lease_expires_at =
      null,

    delivered_at =
      now(),

    failed_at =
      null,

    skipped_at =
      null,

    provider_event_id =
      nullif(
        btrim(
          coalesce(
            p_provider_event_id,
            ''
          )
        ),
        ''
      ),

    last_error_code =
      null,

    last_error_message =
      null,

    skip_reason =
      null,

    updated_at =
      now()

  where d.organization_id =
        p_organization_id

    and d.id =
        p_delivery_id;


  return jsonb_build_object(

    'ok',
      true,

    'updated',
      true,

    'status',
      'delivered',

    'delivery_id',
      p_delivery_id,

    'attempt_number',
      v_attempt_number

  );

end;

$function$;


-- ============================================================
-- 5. FAIL DELIVERY
-- ============================================================

create or replace function
public.fail_conversion_feedback_delivery(

  p_organization_id uuid,

  p_delivery_id uuid,

  p_lease_token uuid,

  p_error_message text,

  p_retryable boolean
    default true,

  p_error_code text
    default null,

  p_retry_after_seconds integer
    default null,

  p_http_status integer
    default null,

  p_provider_request_id text
    default null,

  p_provider_response_code text
    default null,

  p_request_metadata jsonb
    default '{}'::jsonb,

  p_response_metadata jsonb
    default '{}'::jsonb,

  p_duration_ms integer
    default null

)
returns jsonb

language plpgsql
security definer

set search_path =
  'public',
  'pg_temp'

as $function$

declare

  v_delivery
    public.conversion_feedback_deliveries%rowtype;

  v_attempt_number integer;

  v_outcome text;

  v_retry_seconds integer;

  v_next_retry_at timestamptz;

begin

  if p_organization_id is null
     or p_delivery_id is null
     or p_lease_token is null then

    raise exception
      'organization_id, delivery_id and lease_token are required';

  end if;


  if nullif(
       btrim(
         coalesce(
           p_error_message,
           ''
         )
       ),
       ''
     ) is null then

    raise exception
      'error_message is required';

  end if;


  if p_retry_after_seconds is not null
     and (
       p_retry_after_seconds < 0
       or p_retry_after_seconds > 604800
     ) then

    raise exception
      'retry_after_seconds must be between 0 and 604800';

  end if;


  if p_http_status is not null
     and (
       p_http_status < 100
       or p_http_status > 599
     ) then

    raise exception
      'http_status must be between 100 and 599';

  end if;


  if p_duration_ms is not null
     and p_duration_ms < 0 then

    raise exception
      'duration_ms must be >= 0';

  end if;


  if jsonb_typeof(
       coalesce(
         p_request_metadata,
         '{}'::jsonb
       )
     ) <>
     'object' then

    raise exception
      'request_metadata must be a JSON object';

  end if;


  if jsonb_typeof(
       coalesce(
         p_response_metadata,
         '{}'::jsonb
       )
     ) <>
     'object' then

    raise exception
      'response_metadata must be a JSON object';

  end if;


  select d.*

  into v_delivery

  from public.conversion_feedback_deliveries d

  where d.organization_id =
        p_organization_id

    and d.id =
        p_delivery_id

    and d.status =
        'processing'

    and d.lease_token =
        p_lease_token

    and d.lease_expires_at >
        now()

  for update;


  if not found then

    return jsonb_build_object(

      'ok',
        false,

      'updated',
        false,

      'reason',
        'lease_not_owned_or_expired'

    );

  end if;


  v_attempt_number :=
    v_delivery.attempt_count + 1;


  if coalesce(
       p_retryable,
       true
     )
     and v_attempt_number <
         v_delivery.max_attempts then


    v_outcome :=
      'retryable_failed';


    if p_retry_after_seconds
       is not null then

      v_retry_seconds :=
        least(
          v_delivery.max_retry_seconds,
          p_retry_after_seconds
        );

    else

      v_retry_seconds :=
        least(

          v_delivery.max_retry_seconds::numeric,

          v_delivery.base_retry_seconds::numeric
          *
          power(
            2::numeric,
            greatest(
              v_attempt_number - 1,
              0
            )
          )

        )::integer;

    end if;


    v_next_retry_at :=
      now()
      +
      make_interval(
        secs =>
          v_retry_seconds
      );


  else


    v_outcome :=
      'permanent_failed';

    v_retry_seconds :=
      null;

    v_next_retry_at :=
      null;


  end if;


  insert into public.conversion_feedback_attempts (

    organization_id,

    delivery_id,

    attempt_number,

    outcome,

    attempted_at,

    completed_at,

    duration_ms,

    http_status,

    provider_request_id,

    provider_response_code,

    error_code,

    error_message,

    request_metadata,

    response_metadata

  )
  values (

    p_organization_id,

    p_delivery_id,

    v_attempt_number,

    v_outcome,

    coalesce(
      v_delivery.last_attempt_at,
      now()
    ),

    now(),

    p_duration_ms,

    p_http_status,

    nullif(
      btrim(
        coalesce(
          p_provider_request_id,
          ''
        )
      ),
      ''
    ),

    nullif(
      btrim(
        coalesce(
          p_provider_response_code,
          ''
        )
      ),
      ''
    ),

    nullif(
      btrim(
        coalesce(
          p_error_code,
          ''
        )
      ),
      ''
    ),

    btrim(
      p_error_message
    ),

    coalesce(
      p_request_metadata,
      '{}'::jsonb
    ),

    coalesce(
      p_response_metadata,
      '{}'::jsonb
    )

  );


  update public.conversion_feedback_deliveries d

  set

    status =
      v_outcome,

    attempt_count =
      v_attempt_number,

    next_retry_at =
      v_next_retry_at,

    lease_token =
      null,

    lease_expires_at =
      null,

    failed_at =
      case

        when v_outcome =
             'permanent_failed'

          then now()

        else null

      end,

    last_error_code =
      nullif(
        btrim(
          coalesce(
            p_error_code,
            ''
          )
        ),
        ''
      ),

    last_error_message =
      btrim(
        p_error_message
      ),

    delivery_metadata =
      coalesce(
        d.delivery_metadata,
        '{}'::jsonb
      )
      ||
      jsonb_build_object(

        'last_retry_seconds',
          v_retry_seconds,

        'last_failure_at',
          now()

      ),

    updated_at =
      now()

  where d.organization_id =
        p_organization_id

    and d.id =
        p_delivery_id;


  return jsonb_build_object(

    'ok',
      true,

    'updated',
      true,

    'status',
      v_outcome,

    'delivery_id',
      p_delivery_id,

    'attempt_number',
      v_attempt_number,

    'retry_seconds',
      v_retry_seconds,

    'next_retry_at',
      v_next_retry_at

  );

end;

$function$;


-- ============================================================
-- 6. SKIP WITHOUT PROVIDER REQUEST
-- ============================================================

create or replace function
public.skip_conversion_feedback_delivery(

  p_organization_id uuid,

  p_delivery_id uuid,

  p_lease_token uuid,

  p_reason text,

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

  v_found boolean := false;

begin

  if p_organization_id is null
     or p_delivery_id is null
     or p_lease_token is null then

    raise exception
      'organization_id, delivery_id and lease_token are required';

  end if;


  if nullif(
       btrim(
         coalesce(
           p_reason,
           ''
         )
       ),
       ''
     ) is null then

    raise exception
      'skip reason is required';

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


  update public.conversion_feedback_deliveries d

  set

    status =
      'skipped',

    next_retry_at =
      null,

    lease_token =
      null,

    lease_expires_at =
      null,

    skipped_at =
      now(),

    failed_at =
      null,

    last_error_code =
      null,

    last_error_message =
      null,

    skip_reason =
      btrim(
        p_reason
      ),

    delivery_metadata =
      coalesce(
        d.delivery_metadata,
        '{}'::jsonb
      )
      ||
      coalesce(
        p_metadata,
        '{}'::jsonb
      )
      ||
      jsonb_build_object(
        'skipped_at',
        now()
      ),

    updated_at =
      now()

  where d.organization_id =
        p_organization_id

    and d.id =
        p_delivery_id

    and d.status =
        'processing'

    and d.lease_token =
        p_lease_token

    and d.lease_expires_at >
        now()

  returning true
  into v_found;


  if coalesce(
       v_found,
       false
     ) is not true then

    return jsonb_build_object(

      'ok',
        false,

      'updated',
        false,

      'reason',
        'lease_not_owned_or_expired'

    );

  end if;


  return jsonb_build_object(

    'ok',
      true,

    'updated',
      true,

    'status',
      'skipped',

    'delivery_id',
      p_delivery_id

  );

end;

$function$;


-- ============================================================
-- 7. HARDEN MIGRATION 032 TRIGGER FUNCTIONS
-- ============================================================

revoke all
on function
  public.validate_conversion_feedback_route()
from public, anon, authenticated;


revoke all
on function
  public.validate_conversion_feedback_delivery()
from public, anon, authenticated;


revoke all
on function
  public.scope_conversion_feedback_attempt()
from public, anon, authenticated;


revoke all
on function
  public.prevent_conversion_feedback_attempt_mutation()
from public, anon, authenticated;


grant execute
on function
  public.validate_conversion_feedback_route()
to service_role;


grant execute
on function
  public.validate_conversion_feedback_delivery()
to service_role;


grant execute
on function
  public.scope_conversion_feedback_attempt()
to service_role;


grant execute
on function
  public.prevent_conversion_feedback_attempt_mutation()
to service_role;


-- ============================================================
-- 8. WORKER RPC PRIVILEGES
-- ============================================================

revoke all
on function
  public.enqueue_conversion_feedback(
    uuid,
    text,
    integer
  )
from public, anon, authenticated;


revoke all
on function
  public.recover_stale_conversion_feedback_deliveries(
    uuid,
    integer
  )
from public, anon, authenticated;


revoke all
on function
  public.claim_conversion_feedback_deliveries(
    uuid,
    integer,
    integer
  )
from public, anon, authenticated;


revoke all
on function
  public.complete_conversion_feedback_delivery(
    uuid,
    uuid,
    uuid,
    text,
    integer,
    text,
    text,
    jsonb,
    jsonb,
    integer
  )
from public, anon, authenticated;


revoke all
on function
  public.fail_conversion_feedback_delivery(
    uuid,
    uuid,
    uuid,
    text,
    boolean,
    text,
    integer,
    integer,
    text,
    text,
    jsonb,
    jsonb,
    integer
  )
from public, anon, authenticated;


revoke all
on function
  public.skip_conversion_feedback_delivery(
    uuid,
    uuid,
    uuid,
    text,
    jsonb
  )
from public, anon, authenticated;


grant execute
on function
  public.enqueue_conversion_feedback(
    uuid,
    text,
    integer
  )
to service_role;


grant execute
on function
  public.recover_stale_conversion_feedback_deliveries(
    uuid,
    integer
  )
to service_role;


grant execute
on function
  public.claim_conversion_feedback_deliveries(
    uuid,
    integer,
    integer
  )
to service_role;


grant execute
on function
  public.complete_conversion_feedback_delivery(
    uuid,
    uuid,
    uuid,
    text,
    integer,
    text,
    text,
    jsonb,
    jsonb,
    integer
  )
to service_role;


grant execute
on function
  public.fail_conversion_feedback_delivery(
    uuid,
    uuid,
    uuid,
    text,
    boolean,
    text,
    integer,
    integer,
    text,
    text,
    jsonb,
    jsonb,
    integer
  )
to service_role;


grant execute
on function
  public.skip_conversion_feedback_delivery(
    uuid,
    uuid,
    uuid,
    text,
    jsonb
  )
to service_role;


commit;
