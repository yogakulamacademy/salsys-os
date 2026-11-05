-- Phase B: strengthen service-only WhatsApp receipt reconciliation identity
-- and surface aggregate-only historical account-mapping review evidence.
-- Every lookup is tenant-bound. No message bodies, provider IDs, phone numbers,
-- webhook payloads, error strings or contact values are returned.
--
-- This migration replaces only a STABLE SECURITY INVOKER SELECT function.
-- It never modifies a customer record or retries an event.
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
      w.received_at,
      w.phone_number_id,
      regexp_replace(coalesce(w.contact_wa_id, ''), '[^0-9]', '', 'g') as sender_digits
    from public.whatsapp_webhook_events w
    where w.organization_id = p_organization_id
      and w.event_type like 'message:%'
      and w.processing_status in ('failed', 'processed')
  ),
  evidence as (
    select r.processing_status, r.received_at,
      -- An exact MID alone is insufficient evidence of a correctly threaded
      -- inbound WhatsApp message. Require channel, direction, provider account
      -- and sender conversation to agree with the webhook receipt.
      exists (
        select 1
        from public.messages m
        join public.conversations c
          on c.organization_id = m.organization_id
         and c.id = m.conversation_id
        where m.organization_id = r.organization_id
          and m.external_message_id = r.external_message_id
          and r.external_message_id is not null
          and c.channel::text = 'whatsapp'
          and m.direction::text = 'inbound'
          and r.phone_number_id is not null
          and btrim(r.phone_number_id) <> ''
          and c.external_account_id = r.phone_number_id
          and length(r.sender_digits) >= 8
          and c.external_conversation_id = r.sender_digits
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
      ) as has_raw_evidence,
      exists (
        select 1 from public.raw_events re
        join public.raw_event_processing rp
          on rp.organization_id = re.organization_id
         and rp.raw_event_id = re.id
        where re.organization_id = r.organization_id
          and re.source_system = 'whatsapp'
          and re.external_message_id = r.external_message_id
          and r.external_message_id is not null
          and rp.status = 'processed'
      ) as has_raw_processed,
      exists (
        select 1 from public.conversations c
        where c.organization_id = r.organization_id
          and c.channel::text = 'whatsapp'
          and length(r.sender_digits) >= 8
          and c.external_conversation_id = r.sender_digits
          and r.phone_number_id is not null
          and btrim(r.phone_number_id) <> ''
          and c.external_account_id = r.phone_number_id
      ) as has_same_account_sender_thread,
      exists (
        select 1 from public.conversations c
        where c.organization_id = r.organization_id
          and c.channel::text = 'whatsapp'
          and length(r.sender_digits) >= 8
          and c.external_conversation_id = r.sender_digits
          and (r.phone_number_id is null
            or btrim(r.phone_number_id) = ''
            or c.external_account_id is distinct from r.phone_number_id)
      ) as has_other_or_unmapped_account_sender_thread
    from receipts r
  ),
  totals as (
    select
      count(*) filter (where processing_status='processed')::bigint as processed_receipts,
      count(*) filter (where processing_status='processed' and has_exact_message)::bigint as processed_with_message,
      count(*) filter (where processing_status='processed' and not has_exact_message)::bigint as processed_without_message,
      count(*) filter (where processing_status='processed' and has_exact_link)::bigint as processed_with_link,
      count(*) filter (where processing_status='processed' and not has_exact_message and has_raw_processed)::bigint as processed_unmatched_raw_processed,
      count(*) filter (where processing_status='processed' and not has_exact_message
        and has_same_account_sender_thread and not has_other_or_unmapped_account_sender_thread)::bigint
        as processed_unmatched_same_account_thread,
      count(*) filter (where processing_status='processed' and not has_exact_message
        and not has_same_account_sender_thread and has_other_or_unmapped_account_sender_thread)::bigint
        as processed_unmatched_other_account_thread,
      count(*) filter (where processing_status='processed' and not has_exact_message
        and has_same_account_sender_thread and has_other_or_unmapped_account_sender_thread)::bigint
        as processed_unmatched_multiple_account_threads,
      count(*) filter (where processing_status='processed' and not has_exact_message
        and not has_same_account_sender_thread and not has_other_or_unmapped_account_sender_thread)::bigint
        as processed_unmatched_no_sender_thread,
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
    'processedUnmatchedRawProcessed', processed_unmatched_raw_processed,
    'processedUnmatchedSameAccountThread', processed_unmatched_same_account_thread,
    'processedUnmatchedOtherAccountThread', processed_unmatched_other_account_thread,
    'processedUnmatchedMultipleAccountThreads', processed_unmatched_multiple_account_threads,
    'processedUnmatchedNoSenderThread', processed_unmatched_no_sender_thread,
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
  'Service-only read-only tenant WhatsApp receipt-to-correct-account-and-sender reconciliation. Alternate-account conversation counts are investigation hints, not safe replay evidence.';
