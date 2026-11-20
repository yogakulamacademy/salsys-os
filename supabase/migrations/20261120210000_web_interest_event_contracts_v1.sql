-- Interest tracking (owner-approved, 20 Nov 2026): two more observational web
-- events, same rules as R2-P1 (20261105140000): no PII, no free text, browser
-- source authorization, privacy gates and consent unchanged.
--   web.media_interacted : video play / progress / complete, gallery and photo opens
--   web.engaged_time     : seconds a visitor actually spent reading a page
insert into public.tracking_event_contracts (
  organization_id, event_name, schema_version, family_key, status,
  required_fields, pii_policy, processing_config, metadata
)
select
  null::uuid, names.event_name, 1, 'web', 'active',
  array['anonymousVisitorId','sessionKey']::text[],
  '{"client_pii":"forbidden","form_values":"forbidden","free_text":"forbidden"}'::jsonb,
  '{"canonical_processor":"process_website_raw_event"}'::jsonb,
  '{"system_contract":true,"collection_mode":"explicit_opt_in","authority":"observed_browser_activity","r2_phase":"interest_v1"}'::jsonb
from unnest(array['web.media_interacted','web.engaged_time']::text[]) as names(event_name)
where not exists (
  select 1 from public.tracking_event_contracts existing
  where existing.organization_id is null and existing.event_name = names.event_name and existing.schema_version = 1
)
on conflict do nothing;
