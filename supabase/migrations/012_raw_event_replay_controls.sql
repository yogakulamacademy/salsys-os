begin;

-- =============================================================================
-- 012_raw_event_replay_controls.sql
--
-- Phase 2E3: safe manual replay + dead-letter requeue controls.
--
-- Goals:
-- - tenant-scoped requeue of failed/dead-letter raw events;
-- - immutable replay audit trail;
-- - reset attempt/lease state for a new replay cycle;
-- - prevent replay of actively processing or successfully terminal events;
-- - preserve raw_events as immutable source evidence.
-- =============================================================================


-- =============================================================================
-- 1. REPLAY TRACKING FIELDS
-- =============================================================================

alter table public.raw_event_processing
  add column if not exists replay_count integer not null default 0,
  add column if not exists last_replayed_at timestamptz;

alter table public.raw_event_processing
  drop constraint if exists raw_event_processing_replay_count_check;

alter table public.raw_event_processing
  add constraint raw_event_processing_replay_count_check
  check (replay_count >= 0);


-- =============================================================================
-- 2. IMMUTABLE REPLAY AUDIT LOG
-- =============================================================================

create table if not exists public.raw_event_replay_audit (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,
  raw_event_id uuid not null
    references public.raw_events(id)
    on delete cascade,

  replay_sequence integer not null,

  source_system text not null,
  source_event_id text not null,

  previous_status text not null,
  previous_attempt_count integer not null,
  previous_processor_name text,
  previous_processor_version text,
  previous_processing_error text,
  previous_next_retry_at timestamptz,
  previous_processed_at timestamptz,

  reason text not null,
  requested_by text not null,
  metadata jsonb not null default '{}'::jsonb,

  requested_at timestamptz not null default now(),

  constraint raw_event_replay_audit_sequence_check
    check (replay_sequence > 0),

  constraint raw_event_replay_audit_previous_status_check
    check (
      previous_status in (
        'failed',
        'dead_letter'
      )
    ),

  constraint raw_event_replay_audit_unique_sequence
    unique (
      raw_event_id,
      replay_sequence
    )
);


create index if not exists idx_raw_event_replay_audit_org_requested
  on public.raw_event_replay_audit (
    organization_id,
    requested_at desc
  );


create index if not exists idx_raw_event_replay_audit_event
  on public.raw_event_replay_audit (
    raw_event_id,
    replay_sequence desc
  );


alter table public.raw_event_replay_audit
  enable row level security;


revoke all
on table public.raw_event_replay_audit
from public, anon, authenticated;


grant select, insert
on table public.raw_event_replay_audit
to service_role;


-- =============================================================================
-- 3. TENANT-SAFE MANUAL REQUEUE
--
-- Only failed/dead_letter states may be replayed.
--
-- We intentionally do NOT replay:
-- - received: already pending;
-- - processing: currently owned by a worker lease;
-- - processed/ignored: successful terminal outcomes.
--
-- This avoids accidental duplicate downstream effects.
-- =============================================================================

create or replace function public.requeue_raw_event_for_replay(
  p_organization_id uuid,
  p_raw_event_id uuid,
  p_reason text,
  p_requested_by text default 'service_role',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_raw_event public.raw_events%rowtype;
  v_processing public.raw_event_processing%rowtype;
  v_replay_sequence integer;
  v_audit_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if p_raw_event_id is null then
    raise exception 'raw_event_id is required';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'reason is required';
  end if;

  if nullif(btrim(p_requested_by), '') is null then
    raise exception 'requested_by is required';
  end if;

  /*
   * Lock the processing row first. This serializes replay requests against
   * other replay requests and against worker state changes.
   */
  select rp.*
  into v_processing
  from public.raw_event_processing rp
  where rp.organization_id = p_organization_id
    and rp.raw_event_id = p_raw_event_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'not_found'
    );
  end if;

  select re.*
  into v_raw_event
  from public.raw_events re
  where re.id = p_raw_event_id
    and re.organization_id = p_organization_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'tenant_mismatch_or_raw_event_missing'
    );
  end if;

  if v_processing.status = 'received' then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'already_pending',
      'status', v_processing.status
    );
  end if;

  if v_processing.status = 'processing' then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'actively_processing',
      'status', v_processing.status
    );
  end if;

  if v_processing.status in ('processed', 'ignored') then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'successful_terminal_event_not_replayable',
      'status', v_processing.status
    );
  end if;

  if v_processing.status not in ('failed', 'dead_letter') then
    return jsonb_build_object(
      'ok', false,
      'updated', false,
      'reason', 'status_not_replayable',
      'status', v_processing.status
    );
  end if;

  v_replay_sequence :=
    v_processing.replay_count + 1;

  insert into public.raw_event_replay_audit (
    organization_id,
    raw_event_id,
    replay_sequence,
    source_system,
    source_event_id,
    previous_status,
    previous_attempt_count,
    previous_processor_name,
    previous_processor_version,
    previous_processing_error,
    previous_next_retry_at,
    previous_processed_at,
    reason,
    requested_by,
    metadata
  )
  values (
    p_organization_id,
    p_raw_event_id,
    v_replay_sequence,
    v_raw_event.source_system,
    v_raw_event.source_event_id,
    v_processing.status,
    v_processing.attempt_count,
    v_processing.processor_name,
    v_processing.processor_version,
    v_processing.processing_error,
    v_processing.next_retry_at,
    v_processing.processed_at,
    btrim(p_reason),
    btrim(p_requested_by),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id
  into v_audit_id;

  update public.raw_event_processing rp
  set
    status = 'received',
    attempt_count = 0,
    last_attempt_at = null,
    next_retry_at = null,
    processed_at = null,
    processor_name = null,
    processor_version = null,
    processing_error = null,
    processing_metadata =
      coalesce(rp.processing_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'last_replay_audit_id',
        v_audit_id,
        'last_replay_sequence',
        v_replay_sequence,
        'last_replay_reason',
        btrim(p_reason),
        'last_replayed_by',
        btrim(p_requested_by)
      ),
    lease_token = null,
    lease_expires_at = null,
    replay_count = v_replay_sequence,
    last_replayed_at = now(),
    updated_at = now()
  where rp.organization_id = p_organization_id
    and rp.raw_event_id = p_raw_event_id;

  return jsonb_build_object(
    'ok', true,
    'updated', true,
    'status', 'received',
    'raw_event_id', p_raw_event_id,
    'replay_sequence', v_replay_sequence,
    'audit_id', v_audit_id
  );
end;
$function$;


revoke all
on function public.requeue_raw_event_for_replay(
  uuid,
  uuid,
  text,
  text,
  jsonb
)
from public, anon, authenticated;


grant execute
on function public.requeue_raw_event_for_replay(
  uuid,
  uuid,
  text,
  text,
  jsonb
)
to service_role;


-- =============================================================================
-- 4. REPLAY CANDIDATE VIEW
--
-- Operational read model for future admin tooling. This exposes only events
-- that are eligible for manual replay.
-- =============================================================================

create or replace view public.raw_event_replay_candidates
with (security_invoker = true)
as
select
  re.id as raw_event_id,
  re.organization_id,
  re.source_system,
  re.source_event_id,
  re.source_event_type,
  re.received_at,
  rp.status,
  rp.attempt_count,
  rp.replay_count,
  rp.last_attempt_at,
  rp.next_retry_at,
  rp.processor_name,
  rp.processor_version,
  rp.processing_error,
  rp.last_replayed_at,
  rp.updated_at
from public.raw_events re
join public.raw_event_processing rp
  on rp.raw_event_id = re.id
 and rp.organization_id = re.organization_id
where rp.status in (
  'failed',
  'dead_letter'
);


revoke all
on table public.raw_event_replay_candidates
from public, anon, authenticated;


grant select
on table public.raw_event_replay_candidates
to service_role;


-- =============================================================================
-- 5. FINAL ASSERTIONS
-- =============================================================================

do $$
begin
  if to_regclass(
    'public.raw_event_replay_audit'
  ) is null then
    raise exception
      '012 abort: raw_event_replay_audit is missing';
  end if;

  if to_regclass(
    'public.raw_event_replay_candidates'
  ) is null then
    raise exception
      '012 abort: raw_event_replay_candidates is missing';
  end if;

  if to_regprocedure(
    'public.requeue_raw_event_for_replay(uuid,uuid,text,text,jsonb)'
  ) is null then
    raise exception
      '012 abort: requeue_raw_event_for_replay(...) is missing';
  end if;

  if exists (
    select 1
    from public.raw_event_processing rp
    where rp.replay_count < 0
  ) then
    raise exception
      '012 abort: negative replay_count detected';
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
      '012 abort: non-processing row retains a lease';
  end if;
end
$$;

commit;
