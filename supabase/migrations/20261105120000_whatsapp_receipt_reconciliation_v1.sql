-- Phase B — read-only tenant-scoped WhatsApp provider receipt reconciliation.
-- This function is metadata-only. It never returns message bodies, provider
-- message IDs, phone numbers, errors, contact identities or event payloads.
--
-- Execution: service_role only, after application owner/admin authorization.
-- SECURITY INVOKER deliberately does not bypass caller privileges or RLS.
-- No webhook replay, message insertion, delivery update or data repair.
create or replace function public.get_whatsapp_receipt_reconciliation_v1(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  with receipts as (
    select
      w.organization_id,
      w.external_message_id,
      w.processing_status,
      w.received_at
    from public.whatsapp_webhook_events w
    where w.organization_id = p_organization_id
      and w.event_type like 'message:%'
      and w.processing_status in ('failed', 'processed')
  ),
  evidence as (
    select r.processing_status, r.received_at,
      exists (
        select 1 from public.messages m
        where m.organization_id = r.organization_id
          and m.external_message_id = r.external_message_id
          and r.external_message_id is not null
      ) as has_exact_message,
      exists (
        select 1 from public.whatsapp_crm_message_links l
        where l.organization_id = r.organization_id
          and l.external_message_id = r.external_message_id
          and r.external_message_id is not null
      ) as has_exact_link,
      exists (
        select 1 from public.raw_events re
        where re.organization_id = r.organization_id
          and re.source_system = 'whatsapp'
          and re.external_message_id = r.external_message_id
          and r.external_message_id is not null
      ) as has_raw_evidence
    from receipts r
  ),
  totals as (
    select
      count(*) filter (where processing_status='processed')::bigint as processed_receipts,
      count(*) filter (where processing_status='processed' and has_exact_message)::bigint as processed_with_message,
      count(*) filter (where processing_status='processed' and not has_exact_message)::bigint as processed_without_message,
      count(*) filter (where processing_status='processed' and has_exact_link)::bigint as processed_with_link,
      count(*) filter (where processing_status='failed')::bigint as failed_receipts,
      count(*) filter (where processing_status='failed' and has_raw_evidence)::bigint as failed_with_raw_evidence,
      count(*) filter (where processing_status='failed' and has_exact_message)::bigint as failed_with_message,
      count(*) filter (where processing_status='failed' and not has_exact_message)::bigint as failed_without_message,
      count(*) filter (where processing_status='failed' and has_exact_link)::bigint as failed_with_link,
      min(received_at) filter (where processing_status='processed' and not has_exact_message) as oldest_processed_unmatched_at,
      min(received_at) filter (where processing_status='failed' and not has_exact_message) as oldest_failed_unmatched_at
    from evidence
  )
  select jsonb_build_object(
    'processedReceipts', processed_receipts,
    'processedWithMessage', processed_with_message,
    'processedWithoutMessage', processed_without_message,
    'processedWithLink', processed_with_link,
    'failedReceipts', failed_receipts,
    'failedWithRawEvidence', failed_with_raw_evidence,
    'failedWithMessage', failed_with_message,
    'failedWithoutMessage', failed_without_message,
    'failedWithLink', failed_with_link,
    'oldestProcessedUnmatchedAt', oldest_processed_unmatched_at,
    'oldestFailedUnmatchedAt', oldest_failed_unmatched_at,
    'checkedAt', now()
  )
  from totals;
$function$;

revoke all on function public.get_whatsapp_receipt_reconciliation_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_whatsapp_receipt_reconciliation_v1(uuid)
  to service_role;

comment on function public.get_whatsapp_receipt_reconciliation_v1(uuid) is
  'Service-role-only, read-only WhatsApp receipt-to-CRM exact provider-ID reconciliation. Unmatched is not proof of lost messages or safe replay.';
