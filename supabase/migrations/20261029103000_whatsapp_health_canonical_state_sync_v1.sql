-- PH-3 reliability/observability:
-- Keep legacy WhatsApp webhook lifecycle aligned with canonical raw-event terminal state.
-- System Health reads whatsapp_webhook_events, while raw_event_processing is the canonical
-- lifecycle. Historical dead-letter rows could otherwise remain "received" forever and
-- create a false persistent critical incident.

create or replace function public.sync_whatsapp_webhook_terminal_state_from_raw_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_webhook_id uuid;
  v_legacy_status text;
  v_terminal_at timestamptz;
begin
  -- Only terminal canonical states should flow back to the legacy webhook receipt.
  -- "failed" is intentionally excluded because it remains retryable until promoted
  -- to dead_letter by the canonical lifecycle.
  if new.status not in ('processed', 'ignored', 'dead_letter') then
    return new;
  end if;

  select nullif(r.metadata->>'legacy_webhook_event_id', '')::uuid
    into v_webhook_id
  from public.raw_events r
  where r.id = new.raw_event_id
    and r.organization_id = new.organization_id
    and r.source_system = 'whatsapp'
  limit 1;

  if v_webhook_id is null then
    return new;
  end if;

  -- Legacy health views understand failed/error as failure states. Preserve the
  -- richer canonical dead_letter state in raw_event_processing while mapping it
  -- to legacy failure semantics for monitoring.
  v_legacy_status := case
    when new.status = 'dead_letter' then 'failed'
    else new.status
  end;

  -- processed_at is authoritative when present. For canonical dead letters that
  -- do not set processed_at, last_attempt_at / the terminal row update timestamp
  -- captures the actual lifecycle transition. The trigger deliberately does not
  -- fire for unrelated future updated_at changes, so old incidents stay old.
  v_terminal_at := coalesce(
    new.processed_at,
    new.last_attempt_at,
    new.updated_at,
    now()
  );

  update public.whatsapp_webhook_events w
  set processing_status = v_legacy_status,
      processed_at = v_terminal_at,
      processing_error = new.processing_error
  where w.id = v_webhook_id
    and w.organization_id = new.organization_id
    and (
      w.processing_status is distinct from v_legacy_status
      or w.processed_at is distinct from v_terminal_at
      or w.processing_error is distinct from new.processing_error
    );

  return new;
end;
$function$;

revoke all on function public.sync_whatsapp_webhook_terminal_state_from_raw_v1()
  from public, anon, authenticated;

-- Recreate idempotently so future canonical terminal transitions cannot drift.
drop trigger if exists trg_sync_whatsapp_webhook_terminal_state_from_raw_v1
  on public.raw_event_processing;

create trigger trg_sync_whatsapp_webhook_terminal_state_from_raw_v1
after insert or update of status, processed_at
on public.raw_event_processing
for each row
when (new.status in ('processed', 'ignored', 'dead_letter'))
execute function public.sync_whatsapp_webhook_terminal_state_from_raw_v1();

-- Reconcile existing canonical terminal states once. At the time this migration
-- was prepared, production evidence showed exactly three drifted historical
-- WhatsApp rows, all canonical dead_letter + legacy received.
update public.whatsapp_webhook_events w
set processing_status = case
      when p.status = 'dead_letter' then 'failed'
      else p.status
    end,
    processed_at = coalesce(
      p.processed_at,
      p.last_attempt_at,
      p.updated_at,
      w.received_at
    ),
    processing_error = p.processing_error
from public.raw_events r
join public.raw_event_processing p
  on p.raw_event_id = r.id
 and p.organization_id = r.organization_id
where r.organization_id = w.organization_id
  and r.source_system = 'whatsapp'
  and nullif(r.metadata->>'legacy_webhook_event_id', '')::uuid = w.id
  and p.status in ('processed', 'ignored', 'dead_letter')
  and (
    w.processing_status is distinct from case
      when p.status = 'dead_letter' then 'failed'
      else p.status
    end
    or w.processed_at is null
    or w.processing_error is distinct from p.processing_error
  );

comment on function public.sync_whatsapp_webhook_terminal_state_from_raw_v1() is
  'PH-3 canonical-to-legacy WhatsApp lifecycle reconciliation. Propagates only processed, ignored, or dead_letter raw-event states to the linked legacy webhook receipt so System Health reflects canonical terminal state without weakening genuine pending-event alerts.';
