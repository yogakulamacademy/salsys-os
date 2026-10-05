begin;

-- =============================================================================
-- 013_whatsapp_raw_event_historical_backfill.sql
--
-- Phase 2E4: historical WhatsApp raw-event backfill.
--
-- Goals:
-- - preserve legacy whatsapp_webhook_events as canonical raw_events evidence;
-- - keep tenant + provider identifiers intact;
-- - preserve original provider payload and historical timestamps;
-- - mirror successful legacy terminal states;
-- - terminalize unresolved historical "received" rows as dead_letter so they
--   are NOT automatically claimed/reprocessed;
-- - make unresolved rows manually replayable through Phase 2E3 controls;
-- - remain insert-only/idempotent for canonical raw evidence.
--
-- IMPORTANT:
-- This migration does NOT call the WhatsApp CRM processor.
-- It backfills evidence/state only.
-- =============================================================================


-- =============================================================================
-- 1. FREEZE THE HISTORICAL TARGET SET
--
-- Exclude very recent rows so an in-flight live webhook cannot be mistaken for
-- historical backlog while the current dual-write adapter is processing it.
-- =============================================================================

create temporary table phase2e4_whatsapp_backfill_targets
on commit drop
as
select
  w.*
from public.whatsapp_webhook_events w
where w.received_at
        < transaction_timestamp() - interval '10 minutes'
  and not exists (
    select 1
    from public.raw_events re
    where re.organization_id = w.organization_id
      and re.source_system = 'whatsapp'
      and re.source_event_id = w.event_key
  );


-- =============================================================================
-- 2. PRECONDITION ASSERTIONS
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from phase2e4_whatsapp_backfill_targets w
    where w.organization_id is null
       or w.event_key is null
       or btrim(w.event_key) = ''
       or w.event_type is null
       or btrim(w.event_type) = ''
  ) then
    raise exception
      '013 abort: invalid historical WhatsApp row detected';
  end if;

  if exists (
    select 1
    from phase2e4_whatsapp_backfill_targets w
    where lower(w.processing_status)
          not in ('processed', 'ignored', 'received')
  ) then
    raise exception
      '013 abort: unsupported historical WhatsApp processing status detected';
  end if;

  if exists (
    select 1
    from (
      select
        organization_id,
        event_key
      from phase2e4_whatsapp_backfill_targets
      group by
        organization_id,
        event_key
      having count(*) > 1
    ) d
  ) then
    raise exception
      '013 abort: duplicate tenant-scoped WhatsApp event keys detected';
  end if;
end
$$;


-- =============================================================================
-- 3. BACKFILL CANONICAL RAW EVIDENCE
--
-- received_at / created_at preserve the legacy webhook receipt time.
-- occurred_at remains NULL because the provider timestamp is already preserved
-- inside payload and we do not fabricate/guess a normalized event time.
-- =============================================================================

insert into public.raw_events (
  organization_id,
  source_system,
  source_event_id,
  source_event_type,
  ingestion_method,
  occurred_at,
  received_at,
  source_account_id,
  source_subject_id,
  anonymous_visitor_id,
  session_key,
  external_message_id,
  site,
  payload,
  context,
  metadata,
  schema_version,
  created_at
)
select
  w.organization_id,
  'whatsapp',
  w.event_key,
  w.event_type,
  'whatsapp_historical_backfill',
  null,
  w.received_at,
  w.phone_number_id,
  w.contact_wa_id,
  null,
  null,
  w.external_message_id,
  null,
  w.payload,
  jsonb_strip_nulls(
    jsonb_build_object(
      'object_type',
        w.object_type,
      'entry_id',
        w.entry_id,
      'field_name',
        w.field_name,
      'phone_number_id',
        w.phone_number_id,
      'display_phone_number',
        w.display_phone_number,
      'contact_wa_id',
        w.contact_wa_id,
      'signature_valid',
        w.signature_valid
    )
  ),
  jsonb_strip_nulls(
    jsonb_build_object(
      'adapter',
        'historical_backfill:whatsapp_webhook_events',
      'historical_backfill',
        true,
      'historical_backfill_migration',
        '013_whatsapp_raw_event_historical_backfill',
      'legacy_webhook_event_id',
        w.id,
      'legacy_processing_status',
        w.processing_status,
      'legacy_processed_at',
        w.processed_at,
      'legacy_processing_error',
        w.processing_error
    )
  ),
  1,
  w.received_at
from phase2e4_whatsapp_backfill_targets w
on conflict (
  organization_id,
  source_system,
  source_event_id
)
do nothing;


-- =============================================================================
-- 4. BACKFILL CANONICAL PROCESSING STATE
--
-- Legacy mapping:
--
-- processed -> processed
-- ignored   -> ignored
-- received  -> dead_letter
--
-- "received" is deliberately NOT copied as "received". These are historical
-- unresolved rows, and leaving them claimable would cause Phase 2E2 workers to
-- process old WhatsApp events automatically. dead_letter preserves the fact
-- that processing never reached a successful terminal outcome while allowing
-- an explicit audited replay later through Phase 2E3.
-- =============================================================================

insert into public.raw_event_processing (
  raw_event_id,
  organization_id,
  status,
  attempt_count,
  last_attempt_at,
  next_retry_at,
  processed_at,
  processor_name,
  processor_version,
  processing_error,
  processing_metadata,
  created_at,
  updated_at,
  lease_token,
  lease_expires_at,
  replay_count,
  last_replayed_at
)
select
  re.id,
  w.organization_id,

  case lower(w.processing_status)
    when 'processed' then 'processed'
    when 'ignored' then 'ignored'
    when 'received' then 'dead_letter'
  end,

  0,

  case lower(w.processing_status)
    when 'processed' then
      coalesce(w.processed_at, w.received_at)
    when 'ignored' then
      coalesce(w.processed_at, w.received_at)
    when 'received' then
      w.received_at
  end,

  null,

  case lower(w.processing_status)
    when 'processed' then
      coalesce(w.processed_at, w.received_at)
    when 'ignored' then
      coalesce(w.processed_at, w.received_at)
    when 'received' then
      null
  end,

  'whatsapp_historical_backfill',
  'phase2e4',

  case lower(w.processing_status)
    when 'received' then
      coalesce(
        nullif(btrim(w.processing_error), ''),
        'Historical WhatsApp event remained received; backfilled as dead_letter to prevent automatic reprocessing.'
      )
    else
      w.processing_error
  end,

  jsonb_strip_nulls(
    jsonb_build_object(
      'historical_backfill',
        true,
      'historical_backfill_migration',
        '013_whatsapp_raw_event_historical_backfill',
      'legacy_webhook_event_id',
        w.id,
      'legacy_processing_status',
        w.processing_status,
      'legacy_received_at',
        w.received_at,
      'legacy_processed_at',
        w.processed_at,
      'legacy_processing_error',
        w.processing_error,
      'historical_terminalization',
        case
          when lower(w.processing_status) = 'received'
          then 'dead_letter'
          else null
        end,
      'historical_terminalization_reason',
        case
          when lower(w.processing_status) = 'received'
          then 'prevent_automatic_historical_reprocessing'
          else null
        end
    )
  ),

  w.received_at,
  now(),
  null,
  null,
  0,
  null

from phase2e4_whatsapp_backfill_targets w
join public.raw_events re
  on re.organization_id = w.organization_id
 and re.source_system = 'whatsapp'
 and re.source_event_id = w.event_key

on conflict (raw_event_id)
do nothing;


-- =============================================================================
-- 5. FINAL ASSERTIONS
-- =============================================================================

do $$
declare
  v_target_count bigint;
  v_raw_count bigint;
  v_processing_count bigint;
begin
  select count(*)
  into v_target_count
  from phase2e4_whatsapp_backfill_targets;

  select count(*)
  into v_raw_count
  from phase2e4_whatsapp_backfill_targets w
  join public.raw_events re
    on re.organization_id = w.organization_id
   and re.source_system = 'whatsapp'
   and re.source_event_id = w.event_key;

  if v_raw_count <> v_target_count then
    raise exception
      '013 abort: expected % canonical WhatsApp raw rows, found %',
      v_target_count,
      v_raw_count;
  end if;

  select count(*)
  into v_processing_count
  from phase2e4_whatsapp_backfill_targets w
  join public.raw_events re
    on re.organization_id = w.organization_id
   and re.source_system = 'whatsapp'
   and re.source_event_id = w.event_key
  join public.raw_event_processing rp
    on rp.raw_event_id = re.id
   and rp.organization_id = re.organization_id;

  if v_processing_count <> v_target_count then
    raise exception
      '013 abort: expected % canonical processing rows, found %',
      v_target_count,
      v_processing_count;
  end if;

  if exists (
    select 1
    from phase2e4_whatsapp_backfill_targets w
    join public.raw_events re
      on re.organization_id = w.organization_id
     and re.source_system = 'whatsapp'
     and re.source_event_id = w.event_key
    join public.raw_event_processing rp
      on rp.raw_event_id = re.id
     and rp.organization_id = re.organization_id
    where
      (
        lower(w.processing_status) = 'processed'
        and rp.status <> 'processed'
      )
      or
      (
        lower(w.processing_status) = 'ignored'
        and rp.status <> 'ignored'
      )
      or
      (
        lower(w.processing_status) = 'received'
        and rp.status <> 'dead_letter'
      )
  ) then
    raise exception
      '013 abort: historical WhatsApp processing-state mapping mismatch';
  end if;

  if exists (
    select 1
    from phase2e4_whatsapp_backfill_targets w
    join public.raw_events re
      on re.organization_id = w.organization_id
     and re.source_system = 'whatsapp'
     and re.source_event_id = w.event_key
    join public.raw_event_processing rp
      on rp.raw_event_id = re.id
     and rp.organization_id = re.organization_id
    where rp.status in (
      'received',
      'processing',
      'failed'
    )
  ) then
    raise exception
      '013 abort: historical WhatsApp event remains automatically claimable';
  end if;

  if exists (
    select 1
    from phase2e4_whatsapp_backfill_targets w
    join public.raw_events re
      on re.organization_id = w.organization_id
     and re.source_system = 'whatsapp'
     and re.source_event_id = w.event_key
    join public.raw_event_processing rp
      on rp.raw_event_id = re.id
     and rp.organization_id = re.organization_id
    where rp.lease_token is not null
       or rp.lease_expires_at is not null
       or rp.next_retry_at is not null
  ) then
    raise exception
      '013 abort: historical WhatsApp event has active worker/retry state';
  end if;
end
$$;


commit;
