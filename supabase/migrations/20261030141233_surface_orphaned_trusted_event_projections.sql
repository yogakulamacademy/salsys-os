create or replace view public.v_system_recent_failures as
select 'ga4'::text as system_key,
       'Google Analytics 4'::text as system_name,
       ga4_sync_runs.id::text as source_id,
       coalesce(ga4_sync_runs.completed_at, ga4_sync_runs.started_at, ga4_sync_runs.created_at) as occurred_at,
       ga4_sync_runs.status,
       ga4_sync_runs.error_message,
       null::text as event_type,
       ga4_sync_runs.organization_id
from public.ga4_sync_runs
where lower(ga4_sync_runs.status) = any (array['failed'::text, 'error'::text])
union all
select 'gsc'::text,
       'Google Search Console'::text,
       gsc_sync_runs.id::text,
       coalesce(gsc_sync_runs.completed_at, gsc_sync_runs.started_at),
       gsc_sync_runs.status,
       gsc_sync_runs.error_message,
       null::text,
       gsc_sync_runs.organization_id
from public.gsc_sync_runs
where lower(gsc_sync_runs.status) = any (array['failed'::text, 'error'::text])
union all
select 'google_ads'::text,
       'Google Ads'::text,
       google_ads_sync_runs.id::text,
       coalesce(google_ads_sync_runs.completed_at, google_ads_sync_runs.started_at),
       google_ads_sync_runs.status,
       google_ads_sync_runs.error_message,
       null::text,
       google_ads_sync_runs.organization_id
from public.google_ads_sync_runs
where lower(google_ads_sync_runs.status) = any (array['failed'::text, 'error'::text])
union all
select 'meta_ads'::text,
       'Meta Ads'::text,
       meta_ads_sync_runs.id::text,
       coalesce(meta_ads_sync_runs.completed_at, meta_ads_sync_runs.started_at),
       meta_ads_sync_runs.status,
       meta_ads_sync_runs.error_message,
       null::text,
       meta_ads_sync_runs.organization_id
from public.meta_ads_sync_runs
where lower(meta_ads_sync_runs.status) = any (array['failed'::text, 'error'::text])
union all
select 'admissions'::text,
       'Admissions Automation'::text,
       admissions_auto_task_runs.id::text,
       coalesce(admissions_auto_task_runs.completed_at, admissions_auto_task_runs.started_at),
       admissions_auto_task_runs.status,
       admissions_auto_task_runs.error_message,
       null::text,
       admissions_auto_task_runs.organization_id
from public.admissions_auto_task_runs
where lower(admissions_auto_task_runs.status) = any (array['failed'::text, 'error'::text])
union all
select 'whatsapp'::text,
       'WhatsApp'::text,
       whatsapp_webhook_events.id::text,
       whatsapp_webhook_events.received_at,
       whatsapp_webhook_events.processing_status,
       whatsapp_webhook_events.processing_error,
       whatsapp_webhook_events.event_type,
       whatsapp_webhook_events.organization_id
from public.whatsapp_webhook_events
where lower(whatsapp_webhook_events.processing_status) = any (array['failed'::text, 'error'::text])
   or (lower(whatsapp_webhook_events.processing_status) = any (array['received'::text, 'pending'::text, 'processing'::text])
       and whatsapp_webhook_events.processed_at is null
       and whatsapp_webhook_events.received_at < now() - interval '15 minutes')
union all
select 'lead_capture'::text,
       'Website Lead Capture'::text,
       lead_ingest_events.id::text,
       lead_ingest_events.received_at,
       lead_ingest_events.status,
       coalesce(lead_ingest_events.metadata ->> 'error', lead_ingest_events.metadata ->> 'error_message', lead_ingest_events.metadata ->> 'message'),
       lead_ingest_events.form_name,
       lead_ingest_events.organization_id
from public.lead_ingest_events
where lower(lead_ingest_events.status) = any (array['failed'::text, 'error'::text])
   or (lower(lead_ingest_events.status) = any (array['received'::text, 'pending'::text, 'processing'::text])
       and lead_ingest_events.received_at < now() - interval '15 minutes')
union all
select 'trusted_events'::text,
       'Trusted Business Events'::text,
       rp.raw_event_id::text,
       coalesce(rp.last_attempt_at, re.received_at),
       rp.status,
       rp.processing_error,
       re.source_event_type,
       rp.organization_id
from public.raw_event_processing rp
join public.raw_events re
  on re.id = rp.raw_event_id
 and re.organization_id = rp.organization_id
where lower(rp.status) = any (array['failed'::text, 'dead_letter'::text])
   or (lower(rp.status) = any (array['received'::text, 'pending'::text, 'processing'::text])
       and rp.processed_at is null
       and coalesce(rp.last_attempt_at, re.received_at) < now() - interval '15 minutes')
union all
select 'trusted_events'::text,
       'Trusted Business Events'::text,
       rp.raw_event_id::text,
       coalesce(rp.processed_at, rp.last_attempt_at, re.received_at),
       'orphaned'::text,
       'Processed event references a Lead that no longer exists.'::text,
       re.source_event_type,
       rp.organization_id
from public.raw_event_processing rp
join public.raw_events re
  on re.id = rp.raw_event_id
 and re.organization_id = rp.organization_id
left join public.leads l
  on l.organization_id = rp.organization_id
 and l.id::text = nullif(rp.processing_metadata #>> '{result,lead_id}', '')
where lower(rp.status) = 'processed'
  and nullif(rp.processing_metadata #>> '{result,lead_id}', '') is not null
  and l.id is null;
