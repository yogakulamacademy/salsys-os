begin;

-- =============================================================================
-- 011_raw_event_claim_and_retry.sql
--
-- Phase 2E2: safe claim + retry primitives for the canonical raw-event queue.
--
-- Goals:
-- - atomic multi-worker claiming with FOR UPDATE SKIP LOCKED;
-- - lease-token ownership so stale workers cannot overwrite newer work;
-- - attempt counting;
-- - retry scheduling;
-- - stale lease recovery;
-- - max-attempt dead-letter protection;
-- - no replay worker or scheduler yet.
-- =============================================================================


-- =============================================================================
-- 1. LEASE FIELDS
-- =============================================================================

alter table public.raw_event_processing
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;


create index if not exists idx_raw_event_processing_claim
  on public.raw_event_processing (
    organization_id,
    status,
    next_retry_at,
    attempt_count,
    updated_at
  )
  where status in ('received', 'failed');


create index if not exists idx_raw_event_processing_expired_lease
  on public.raw_event_processing (
    organization_id,
    lease_expires_at
  )
  where status = 'processing'
    and lease_expires_at is not null;


-- =============================================================================
-- 2. ROLLING-DEPLOYMENT RECONCILIATION
--
-- During the Phase 2E1 deployment window some website events were normalized
-- into touchpoints by an older app instance before lifecycle synchronization
-- became active. A tenant-scoped matching touchpoint proves normalization
-- already succeeded, so those raw events must never be claimed/replayed.
--
-- This does NOT create raw events from historical touchpoints.
-- =============================================================================

update public.raw_event_processing rp
set
  status = 'processed',
  processor_name = coalesce(
    rp.processor_name,
    'tracking_collect'
  ),
  processor_version = coalesce(
    rp.processor_version,
    'phase2e2-reconcile'
  ),
  processing_error = null,
  processing_metadata =
    coalesce(rp.processing_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'reconciled_from', 'touchpoints',
      'migration', '011_raw_event_claim_and_retry'
    ),
  processed_at = coalesce(
    rp.processed_at,
    tp.created_at,
    re.received_at
  ),
  last_attempt_at = coalesce(
    rp.last_attempt_at,
    tp.created_at,
    re.received_at
  ),
  next_retry_at = null,
  lease_token = null,
  lease_expires_at = null,
  updated_at = now()
from public.raw_events re
join public.touchpoints tp
  on tp.organization_id = re.organization_id
 and tp.event_id = re.source_event_id
where rp.raw_event_id = re.id
  and rp.organization_id = re.organization_id
  and re.source_system = 'website'
  and rp.status in ('received', 'failed');


-- =============================================================================
-- 3. STALE LEASE RECOVERY
-- =============================================================================

create or replace function public.recover_stale_raw_event_processing(
  p_organization_id uuid,
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_recovered integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000';
  end if;

  with stale as (
    select rp.raw_event_id
    from public.raw_event_processing rp
    where rp.organization_id = p_organization_id
      and rp.status = 'processing'
      and rp.lease_expires_at is not null
      and rp.lease_expires_at <= now()
    order by rp.lease_expires_at asc
    for update skip locked
    limit p_limit
  ),
  recovered as (
    update public.raw_event_processing rp
    set
      status = 'failed',
      next_retry_at = now(),
      lease_token = null,
      lease_expires_at = null,
      processing_error = coalesce(
        rp.processing_error,
        'Processing lease expired before completion.'
      ),
      processing_metadata =
        coalesce(rp.processing_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'stale_lease_recovered_at',
          now()
        ),
      updated_at = now()
    from stale s
    where rp.raw_event_id = s.raw_event_id
      and rp.organization_id = p_organization_id
    returning rp.raw_event_id
  )
  select count(*)
  into v_recovered
  from recovered;

  return v_recovered;
end;
$function$;


revoke all
on function public.recover_stale_raw_event_processing(
  uuid,
  integer
)
from public, anon, authenticated;

grant execute
on function public.recover_stale_raw_event_processing(
  uuid,
  integer
)
to service_role;


-- =============================================================================
-- 4. ATOMIC CLAIM
-- =============================================================================

create or replace function public.claim_raw_events(
  p_organization_id uuid,
  p_processor_name text,
  p_processor_version text default null,
  p_source_system text default null,
  p_limit integer default 25,
  p_lease_seconds integer default 300,
  p_max_attempts integer default 5
)
returns table (
  raw_event_id uuid,
  lease_token uuid,
  organization_id uuid,
  source_system text,
  source_event_id text,
  source_event_type text,
  occurred_at timestamptz,
  received_at timestamptz,
  payload jsonb,
  context jsonb,
  metadata jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if nullif(btrim(p_processor_name), '') is null then
    raise exception 'processor_name is required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'p_lease_seconds must be between 30 and 3600';
  end if;

  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception 'p_max_attempts must be between 1 and 100';
  end if;

  /*
   * Recover expired leases first. This makes stale work eligible for a new
   * atomic claim without requiring a separate scheduler.
   */
  perform public.recover_stale_raw_event_processing(
    p_organization_id,
    greatest(p_limit * 4, 100)
  );

  /*
   * Events already at the configured max-attempt threshold are terminal.
   * They are never handed to another worker.
   */
  update public.raw_event_processing rp
  set
    status = 'dead_letter',
    next_retry_at = null,
    lease_token = null,
    lease_expires_at = null,
    processed_at = null,
    processing_error = coalesce(
      rp.processing_error,
      'Maximum processing attempts reached.'
    ),
    processing_metadata =
      coalesce(rp.processing_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'dead_lettered_at',
        now(),
        'max_attempts',
        p_max_attempts
      ),
    updated_at = now()
  where rp.organization_id = p_organization_id
    and rp.status in ('received', 'failed')
    and rp.attempt_count >= p_max_attempts
    and (
      p_source_system is null
      or exists (
        select 1
        from public.raw_events re_dead
        where re_dead.id = rp.raw_event_id
          and re_dead.organization_id = rp.organization_id
          and re_dead.source_system = btrim(p_source_system)
      )
    );

  return query
  with candidates as (
    select
      rp.raw_event_id
    from public.raw_event_processing rp
    join public.raw_events re
      on re.id = rp.raw_event_id
     and re.organization_id = rp.organization_id
    where rp.organization_id = p_organization_id
      and (
        p_source_system is null
        or re.source_system = btrim(p_source_system)
      )
      and rp.attempt_count < p_max_attempts
      and (
        rp.status = 'received'
        or (
          rp.status = 'failed'
          and (
            rp.next_retry_at is null
            or rp.next_retry_at <= now()
          )
        )
      )
    order by
      case rp.status
        when 'failed' then 0
        else 1
      end,
      coalesce(rp.next_retry_at, re.received_at),
      re.received_at,
      rp.raw_event_id
    for update of rp skip locked
    limit p_limit
  ),
  claimed as (
    update public.raw_event_processing rp
    set
      status = 'processing',
      attempt_count = rp.attempt_count + 1,
      last_attempt_at = now(),
      next_retry_at = null,
      processor_name = btrim(p_processor_name),
      processor_version = nullif(
        btrim(p_processor_version),
        ''
      ),
      processing_error = null,
      lease_token = gen_random_uuid(),
      lease_expires_at =
        now()
        + make_interval(
            secs => p_lease_seconds
          ),
      updated_at = now()
    from candidates c
    where rp.raw_event_id = c.raw_event_id
      and rp.organization_id = p_organization_id
    returning
      rp.raw_event_id,
      rp.lease_token,
      rp.organization_id,
      rp.attempt_count
  )
  select
    c.raw_event_id,
    c.lease_token,
    c.organization_id,
    re.source_system,
    re.source_event_id,
    re.source_event_type,
    re.occurred_at,
    re.received_at,
    re.payload,
    re.context,
    re.metadata,
    c.attempt_count
  from claimed c
  join public.raw_events re
    on re.id = c.raw_event_id
   and re.organization_id = c.organization_id
  order by re.received_at, c.raw_event_id;
end;
$function$;


revoke all
on function public.claim_raw_events(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function public.claim_raw_events(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer
)
to service_role;


-- =============================================================================
-- 5. LEASE-OWNED COMPLETION
-- =============================================================================

create or replace function public.complete_raw_event_processing(
  p_organization_id uuid,
  p_raw_event_id uuid,
  p_lease_token uuid,
  p_status text default 'processed',
  p_processing_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_status text;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if p_raw_event_id is null then
    raise exception 'raw_event_id is required';
  end if;

  if p_lease_token is null then
    raise exception 'lease_token is required';
  end if;

  if p_status not in ('processed', 'ignored') then
    raise exception 'completion status must be processed or ignored';
  end if;

  update public.raw_event_processing rp
  set
    status = p_status,
    processed_at = now(),
    next_retry_at = null,
    lease_token = null,
    lease_expires_at = null,
    processing_error = null,
    processing_metadata =
      coalesce(rp.processing_metadata, '{}'::jsonb)
      || coalesce(p_processing_metadata, '{}'::jsonb),
    updated_at = now()
  where rp.organization_id = p_organization_id
    and rp.raw_event_id = p_raw_event_id
    and rp.status = 'processing'
    and rp.lease_token = p_lease_token
    and rp.lease_expires_at > now()
  returning rp.status
  into v_status;

  if v_status is null then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'lease_not_owned_or_expired'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'updated', true,
    'status', v_status
  );
end;
$function$;


revoke all
on function public.complete_raw_event_processing(
  uuid,
  uuid,
  uuid,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.complete_raw_event_processing(
  uuid,
  uuid,
  uuid,
  text,
  jsonb
)
to service_role;


-- =============================================================================
-- 6. LEASE-OWNED FAILURE / RETRY SCHEDULING
-- =============================================================================

create or replace function public.fail_raw_event_processing(
  p_organization_id uuid,
  p_raw_event_id uuid,
  p_lease_token uuid,
  p_processing_error text,
  p_retry_after_seconds integer default 60,
  p_max_attempts integer default 5,
  p_processing_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_attempt_count integer;
  v_status text;
  v_next_retry_at timestamptz;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if p_raw_event_id is null then
    raise exception 'raw_event_id is required';
  end if;

  if p_lease_token is null then
    raise exception 'lease_token is required';
  end if;

  if nullif(btrim(p_processing_error), '') is null then
    raise exception 'processing_error is required';
  end if;

  if p_retry_after_seconds is null
     or p_retry_after_seconds < 0
     or p_retry_after_seconds > 86400 then
    raise exception 'p_retry_after_seconds must be between 0 and 86400';
  end if;

  if p_max_attempts is null
     or p_max_attempts < 1
     or p_max_attempts > 100 then
    raise exception 'p_max_attempts must be between 1 and 100';
  end if;

  select rp.attempt_count
  into v_attempt_count
  from public.raw_event_processing rp
  where rp.organization_id = p_organization_id
    and rp.raw_event_id = p_raw_event_id
    and rp.status = 'processing'
    and rp.lease_token = p_lease_token
    and rp.lease_expires_at > now()
  for update;

  if v_attempt_count is null then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'lease_not_owned_or_expired'
    );
  end if;

  if v_attempt_count >= p_max_attempts then
    v_status := 'dead_letter';
    v_next_retry_at := null;
  else
    v_status := 'failed';
    v_next_retry_at :=
      now()
      + make_interval(
          secs => p_retry_after_seconds
        );
  end if;

  update public.raw_event_processing rp
  set
    status = v_status,
    next_retry_at = v_next_retry_at,
    lease_token = null,
    lease_expires_at = null,
    processed_at = null,
    processing_error = btrim(p_processing_error),
    processing_metadata =
      coalesce(rp.processing_metadata, '{}'::jsonb)
      || coalesce(p_processing_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'failed_at',
        now(),
        'max_attempts',
        p_max_attempts
      ),
    updated_at = now()
  where rp.organization_id = p_organization_id
    and rp.raw_event_id = p_raw_event_id;

  return jsonb_build_object(
    'ok', true,
    'updated', true,
    'status', v_status,
    'attempt_count', v_attempt_count,
    'next_retry_at', v_next_retry_at
  );
end;
$function$;


revoke all
on function public.fail_raw_event_processing(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.fail_raw_event_processing(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer,
  jsonb
)
to service_role;


-- =============================================================================
-- 7. FINAL ASSERTIONS
-- =============================================================================

do $$
begin
  if to_regprocedure(
    'public.recover_stale_raw_event_processing(uuid,integer)'
  ) is null then
    raise exception
      '011 abort: recover_stale_raw_event_processing(...) is missing';
  end if;

  if to_regprocedure(
    'public.claim_raw_events(uuid,text,text,text,integer,integer,integer)'
  ) is null then
    raise exception
      '011 abort: claim_raw_events(...) is missing';
  end if;

  if to_regprocedure(
    'public.complete_raw_event_processing(uuid,uuid,uuid,text,jsonb)'
  ) is null then
    raise exception
      '011 abort: complete_raw_event_processing(...) is missing';
  end if;

  if to_regprocedure(
    'public.fail_raw_event_processing(uuid,uuid,uuid,text,integer,integer,jsonb)'
  ) is null then
    raise exception
      '011 abort: fail_raw_event_processing(...) is missing';
  end if;

  if exists (
    select 1
    from public.raw_event_processing rp
    join public.raw_events re
      on re.id = rp.raw_event_id
     and re.organization_id = rp.organization_id
    join public.touchpoints tp
      on tp.organization_id = re.organization_id
     and tp.event_id = re.source_event_id
    where re.source_system = 'website'
      and rp.status in ('received', 'failed')
  ) then
    raise exception
      '011 abort: normalized website events remain claimable';
  end if;

  if exists (
    select 1
    from public.raw_event_processing rp
    where rp.status <> 'processing'
      and (
        rp.lease_token is not null
        or rp.lease_expires_at is not null
      )
  ) then
    raise exception
      '011 abort: non-processing row retains a processing lease';
  end if;
end
$$;

commit;
