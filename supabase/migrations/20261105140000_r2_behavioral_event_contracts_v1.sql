-- R2-P1: Optional behavioral browser analytics event contracts (no activation).
-- These events are observational and never authoritative for a Lead, booking,
-- payment, revenue, experiment outcome or confirmed document download.
-- They use existing browser source authorization, privacy gates, and ingestion.
insert into public.tracking_event_contracts (
  organization_id,
  event_name,
  schema_version,
  family_key,
  status,
  required_fields,
  pii_policy,
  processing_config,
  metadata
)
select
  null::uuid,
  names.event_name,
  1,
  'web',
  'active',
  array['anonymousVisitorId','sessionKey']::text[],
  '{"client_pii":"forbidden","form_values":"forbidden","free_text":"forbidden"}'::jsonb,
  '{"canonical_processor":"process_website_raw_event"}'::jsonb,
  '{"system_contract":true,"collection_mode":"explicit_opt_in","authority":"observed_browser_activity","r2_phase":"P1"}'::jsonb
from unnest(array[
  'web.scroll_depth_reached',
  'web.cta_viewed',
  'web.pricing_viewed',
  'web.faq_expanded',
  'web.brochure_clicked',
  'web.form_validation_failed',
  'web.form_acknowledged'
]::text[]) as names(event_name)
where not exists (
  select 1
  from public.tracking_event_contracts existing
  where existing.organization_id is null
    and existing.event_name = names.event_name
    and existing.schema_version = 1
)
on conflict do nothing;
