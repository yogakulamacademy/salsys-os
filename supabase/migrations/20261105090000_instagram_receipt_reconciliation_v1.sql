-- Phase B: distinguish projected Instagram messages from intentionally ignored
-- non-message envelopes and native contact-share duplicates. This is an
-- operator-only, SELECT-only, metadata-only reconciliation report.
--
-- The service caller must first authorize the active owner/admin workspace.
-- Neither a processed status nor an ignore tag alone establishes delivery.
create or replace function public.get_instagram_receipt_reconciliation_v1(
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
      re.organization_id,
      re.external_message_id,
      re.source_account_id,
      re.source_subject_id,
      rp.status as processing_status,
      coalesce(rp.processing_metadata ->> 'reason', '') as processing_reason,
      coalesce(rp.processing_metadata ->> 'ignored' = 'true', false) as marked_ignored
    from public.raw_events re
    left join public.raw_event_processing rp
      on rp.raw_event_id = re.id
     and rp.organization_id = re.organization_id
    where re.organization_id = p_organization_id
      and re.source_system = 'instagram'
      and re.ingestion_method = 'instagram_webhook'
      and re.source_event_type like 'message:%'
  ),
  evidence as (
    select
      r.processing_status,
      r.processing_reason,
      r.marked_ignored,
      exists (
        select 1 from public.messages m
        join public.conversations c
          on c.organization_id = m.organization_id
         and c.id = m.conversation_id
        where m.organization_id = r.organization_id
          and r.external_message_id is not null
          and m.external_message_id = r.external_message_id
          and m.direction::text = 'inbound'
          and c.channel::text = 'instagram'
          and c.external_account_id = r.source_account_id
          and c.external_conversation_id =
            r.source_account_id || ':' || r.source_subject_id
      ) as exact_inbound_match
    from receipts r
  ),
  totals as (
    select
      count(*)::bigint as total_receipts,
      count(*) filter (where processing_status = 'processed')::bigint
        as processed_receipts,
      count(*) filter (where processing_status = 'processed'
        and exact_inbound_match)::bigint as exact_inbound_matches,
      count(*) filter (where processing_status = 'processed'
        and not exact_inbound_match and marked_ignored
        and processing_reason = 'non_message_messaging_envelope')::bigint
        as ignored_non_message_envelopes,
      count(*) filter (where processing_status = 'processed'
        and not exact_inbound_match and marked_ignored
        and processing_reason = 'instagram_native_contact_share_duplicate')::bigint
        as ignored_contact_share_duplicates,
      count(*) filter (where processing_status = 'processed'
        and not exact_inbound_match
        and not (marked_ignored and processing_reason in (
          'non_message_messaging_envelope',
          'instagram_native_contact_share_duplicate'
        )))::bigint as processed_without_exact_match_review,
      count(*) filter (where processing_status = 'processed'
        and exact_inbound_match and marked_ignored
        and processing_reason in (
          'non_message_messaging_envelope',
          'instagram_native_contact_share_duplicate'
        ))::bigint as ignored_already_matched,
      count(*) filter (where processing_status is distinct from 'processed')::bigint
        as unprocessed_or_missing_status
    from evidence
  )
  select jsonb_build_object(
    'totalReceipts', total_receipts,
    'processedReceipts', processed_receipts,
    'exactInboundMatches', exact_inbound_matches,
    'ignoredNonMessageEnvelopes', ignored_non_message_envelopes,
    'ignoredContactShareDuplicates', ignored_contact_share_duplicates,
    'processedWithoutExactMatchReview', processed_without_exact_match_review,
    'ignoredAlreadyMatched', ignored_already_matched,
    'unprocessedOrMissingStatus', unprocessed_or_missing_status,
    'checkedAt', now()
  )
  from totals;
$function$;

revoke all on function public.get_instagram_receipt_reconciliation_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_instagram_receipt_reconciliation_v1(uuid)
  to service_role;

comment on function public.get_instagram_receipt_reconciliation_v1(uuid) is
  'Service-only, SELECT-only tenant aggregate: Instagram raw receipts versus exact existing inbound CRM messages and two documented ignore categories. No sends, retries, source identifiers or payloads.';
