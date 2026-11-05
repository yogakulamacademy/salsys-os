-- Phase B: read-only historical WhatsApp provider-ID reconciliation.
-- Run only in an authorized database operations session.
-- No customer text, phone numbers, tenant IDs, provider IDs, payloads, or
-- processing-error strings are projected. This file NEVER updates records.
-- Results are historical evidence, NOT a safe-to-replay determination.

-- 1. Failed inbound receipts, raw evidence, CRM/provider linkage and
--    current exact contact/conversation identity. Internal joins use
--    provider IDs but emit only aggregate counts.
with failed_inbound as (
  select w.organization_id,w.contact_wa_id,w.phone_number_id,
         w.external_message_id,w.processing_error
  from public.whatsapp_webhook_events w
  where w.processing_status='failed'
    and w.event_type like 'message:%'
)
select
  count(*) as failed_inbound,
  count(*) filter(where exists(
    select 1 from public.raw_events r
    where r.organization_id=f.organization_id
      and r.source_system='whatsapp'
      and r.external_message_id=f.external_message_id
  )) as canonical_raw_evidence,
  count(*) filter(where exists(
    select 1 from public.whatsapp_crm_message_links l
    where l.organization_id=f.organization_id
      and l.external_message_id=f.external_message_id
  )) as canonical_message_links,
  count(*) filter(where exists(
    select 1 from public.messages m
    where m.organization_id=f.organization_id
      and m.external_message_id=f.external_message_id
  )) as exact_crm_message_ids,
  count(*) filter(where exists(
    select 1 from public.lead_contacts lc
    where lc.organization_id=f.organization_id
      and lc.contact_type in ('whatsapp','phone')
      and regexp_replace(coalesce(lc.normalized_value,''),'[^0-9]','','g')
        = regexp_replace(coalesce(f.contact_wa_id,''),'[^0-9]','','g')
      and coalesce(f.contact_wa_id,'')<>''
  )) as currently_matching_contacts,
  count(*) filter(where exists(
    select 1 from public.conversations c
    where c.organization_id=f.organization_id
      and c.channel::text='whatsapp'
      and c.external_conversation_id
        = regexp_replace(coalesce(f.contact_wa_id,''),'[^0-9]','','g')
      and c.external_account_id is not distinct from f.phone_number_id
      and coalesce(f.contact_wa_id,'')<>''
  )) as currently_matching_conversations,
  count(*) filter(where f.processing_error ~*
    'null value in column "organization_id" of relation "lead_attribution"'
  ) as historical_attribution_tenant_errors
from failed_inbound f;

-- 2. Provider receipts marked processed versus actual exact provider MID.
--    A processed receipt is not proof of a CRM message. Do not replay a
--    mismatched receipt without manually reviewing identity and provenance.
with processed_inbound as (
  select w.organization_id,w.external_message_id,w.received_at,w.event_type
  from public.whatsapp_webhook_events w
  where w.processing_status='processed'
    and w.event_type like 'message:%'
)
select
  count(*) as processed_inbound_receipts,
  count(*) filter(where exists(
    select 1 from public.whatsapp_crm_message_links l
    where l.organization_id=p.organization_id
      and l.external_message_id=p.external_message_id
  )) as exact_link_matches,
  count(*) filter(where exists(
    select 1 from public.messages m
    where m.organization_id=p.organization_id
      and m.external_message_id=p.external_message_id
  )) as exact_message_matches,
  count(*) filter(where not exists(
    select 1 from public.messages m
    where m.organization_id=p.organization_id
      and m.external_message_id=p.external_message_id
  )) as processed_without_exact_message,
  min(received_at)::date as oldest_receipt_day,
  max(received_at)::date as latest_receipt_day
from processed_inbound p;

-- 3. Current hardening installed. These checks inspect metadata and source
--    definitions only; they never call the tenant trigger or create a lead.
select
 (select count(*) from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    where c.relname='lead_attribution'
      and t.tgname='trg_lead_attribution_enforce_organization_v1'
      and t.tgenabled='O') as active_attribution_guard_triggers,
 (select position('new.organization_id := v_lead_organization_id;' in
    pg_get_functiondef(
      'public.enforce_lead_attribution_organization_v1()'::regprocedure
    ))>0) as attribution_trigger_fills_tenant,
 (select position('lead_id,organization_id,first_touchpoint_id' in lower(
    pg_get_functiondef(
      'public.create_crm_lead(uuid,text,text,text,text,uuid,uuid,text,date,text,text,text,contact_channel,contact_channel,text,text,text,text)'::regprocedure
    )))>0) as lead_creator_writes_explicit_tenant,
 (select count(*) from public.whatsapp_webhook_events w
    where w.event_type like 'message:%'
      and w.processing_status='failed'
      and w.received_at >= '2026-10-27'::timestamptz) as inbound_failures_since_attribution_fix,
 (select count(*) from public.whatsapp_webhook_events w
    where w.event_type like 'message:%'
      and w.processing_status='processed'
      and w.received_at >= '2026-10-27'::timestamptz) as inbound_processed_since_attribution_fix;
