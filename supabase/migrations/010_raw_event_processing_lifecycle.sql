begin;

-- =============================================================================
-- 010_raw_event_processing_lifecycle.sql
--
-- Phase 2E1: synchronize canonical raw-event processing state with the
-- downstream adapters that already normalize website and WhatsApp events.
--
-- This migration:
-- - adds one service-role-only lifecycle status RPC;
-- - preserves terminal statuses unless replay tooling explicitly changes them
--   in a later phase;
-- - reconciles already-normalized website events from received -> processed.
--
-- It does not add replay/claim/dead-letter behavior yet.
-- =============================================================================


-- =============================================================================
-- 1. PROCESSING-STATUS SYNCHRONIZATION RPC
-- =============================================================================

create or replace function public.set_raw_event_processing_status(
  p_organization_id uuid,
  p_source_system text,
  p_source_event_id text,
  p_status text,
  p_processor_name text default null,
  p_processor_version text default null,
  p_processing_error text default null,
  p_processing_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_raw_event_id uuid;
  v_current_status text;
  v_final_status text;
  v_updated boolean := false;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if nullif(btrim(p_source_system), '') is null then
    raise exception 'source_system is required';
  end if;

  if nullif(btrim(p_source_event_id), '') is null then
    raise exception 'source_event_id is required';
  end if;

  if p_status not in (
    'received',
    'processing',
    'processed',
    'ignored',
    'failed',
    'dead_letter'
  ) then
    raise exception 'unsupported raw-event processing status: %', p_status;
  end if;

  select
    re.id,
    rp.status
  into
    v_raw_event_id,
    v_current_status
  from public.raw_events re
  join public.raw_event_processing rp
    on rp.raw_event_id = re.id
   and rp.organization_id = re.organization_id
  where re.organization_id = p_organization_id
    and re.source_system = btrim(p_source_system)
    and re.source_event_id = btrim(p_source_event_id)
  for update of rp;

  if v_raw_event_id is null then
    return jsonb_build_object(
      'ok', false,
      'found', false,
      'updated', false,
      'status', null
    );
  end if;

  /*
   * processed / ignored / dead_letter are terminal for ordinary adapters.
   * Replay/reset controls will be introduced separately in Phase 2E3.
   *
   * Repeating the same terminal status is harmless and keeps idempotency.
   */
  if v_current_status in (
    'processed',
    'ignored',
    'dead_letter'
  ) and p_status <> v_current_status then
    return jsonb_build_object(
      'ok', true,
      'found', true,
      'updated', false,
      'status', v_current_status,
      'terminal_preserved', true
    );
  end if;

  update public.raw_event_processing rp
  set
    status = p_status,

    processor_name = case
      when nullif(btrim(p_processor_name), '') is not null
        then btrim(p_processor_name)
      else rp.processor_name
    end,

    processor_version = case
      when nullif(btrim(p_processor_version), '') is not null
        then btrim(p_processor_version)
      else rp.processor_version
    end,

    processing_error = case
      when p_status in ('processed', 'ignored')
        then null
      else p_processing_error
    end,

    processing_metadata =
      coalesce(rp.processing_metadata, '{}'::jsonb)
      || coalesce(p_processing_metadata, '{}'::jsonb),

    last_attempt_at = case
      when p_status in (
        'processing',
        'processed',
        'ignored',
        'failed',
        'dead_letter'
      )
        then now()
      else rp.last_attempt_at
    end,

    processed_at = case
      when p_status in ('processed', 'ignored')
        then coalesce(rp.processed_at, now())
      when p_status in ('received', 'processing', 'failed')
        then null
      else rp.processed_at
    end,

    updated_at = now()
  where rp.raw_event_id = v_raw_event_id
    and rp.organization_id = p_organization_id
  returning
    rp.status
  into v_final_status;

  v_updated := found;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'updated', v_updated,
    'status', v_final_status
  );
end;
$function$;


revoke all
on function public.set_raw_event_processing_status(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.set_raw_event_processing_status(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
)
to service_role;


-- =============================================================================
-- 2. ONE-TIME WEBSITE RECONCILIATION
--
-- A matching tenant-scoped touchpoint proves that the current website adapter
-- already completed its normalization path successfully.
--
-- We only reconcile raw events that are still "received". We do not create raw
-- events from historical touchpoints because derived data must not be promoted
-- into raw source evidence.
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
    'phase2e1'
  ),
  processing_error = null,
  processing_metadata =
    coalesce(rp.processing_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'reconciled_from', 'touchpoints',
      'migration', '010_raw_event_processing_lifecycle'
    ),
  last_attempt_at = coalesce(
    rp.last_attempt_at,
    tp.created_at,
    re.received_at
  ),
  processed_at = coalesce(
    rp.processed_at,
    tp.created_at,
    re.received_at
  ),
  updated_at = now()
from public.raw_events re
join public.touchpoints tp
  on tp.organization_id = re.organization_id
 and tp.event_id = re.source_event_id
where rp.raw_event_id = re.id
  and rp.organization_id = re.organization_id
  and re.source_system = 'website'
  and rp.status = 'received';


-- =============================================================================
-- 3. STRUCTURAL ASSERTIONS
-- =============================================================================

do $$
begin
  if to_regprocedure(
    'public.set_raw_event_processing_status(uuid,text,text,text,text,text,text,jsonb)'
  ) is null then
    raise exception
      '010 abort: set_raw_event_processing_status(...) was not created';
  end if;

  if exists (
    select 1
    from public.raw_event_processing rp
    left join public.raw_events re
      on re.id = rp.raw_event_id
     and re.organization_id = rp.organization_id
    where re.id is null
  ) then
    raise exception
      '010 abort: raw_event_processing contains an orphan row';
  end if;
end
$$;

commit;
