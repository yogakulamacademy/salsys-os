begin;

-- =============================================================================
-- Salsys Universal Tracking Platform V1
-- Publishable untrusted-client source contract for mobile apps and sandboxed
-- client adapters (for example Shopify storefront pixels).
--
-- Publishable keys are identifiers, not secrets. This source mode is deliberately
-- limited to non-authoritative telemetry and remains privacy-gated before raw
-- event persistence. Trusted business facts continue to use secret-authenticated
-- /api/events/v1 sources.
-- =============================================================================

alter table public.tracking_sources
  drop constraint if exists tracking_sources_source_type_check;

alter table public.tracking_sources
  add constraint tracking_sources_source_type_check
  check (source_type = any (array[
    'website'::text,
    'client'::text,
    'api'::text,
    'webhook'::text,
    'system'::text
  ]));

alter table public.tracking_sources
  drop constraint if exists tracking_sources_auth_mode_check;

alter table public.tracking_sources
  add constraint tracking_sources_auth_mode_check
  check (auth_mode = any (array[
    'origin'::text,
    'publishable'::text,
    'secret'::text,
    'hmac'::text,
    'internal'::text
  ]));

alter table public.tracking_sources
  drop constraint if exists tracking_sources_check;

alter table public.tracking_sources
  add constraint tracking_sources_check
  check (
    (auth_mode = 'origin' and hostname is not null and secret_hash is null)
    or (auth_mode = 'publishable' and secret_hash is null)
    or (auth_mode = any (array['secret'::text, 'hmac'::text]) and secret_hash is not null)
    or auth_mode = 'internal'
  );

insert into public.tracking_event_families (
  family_key,
  event_prefix,
  processor_name,
  default_schema_version,
  allow_browser,
  allow_server,
  active,
  metadata
)
values (
  'app',
  'app.',
  'app_event_processor',
  1,
  false,
  true,
  true,
  jsonb_build_object(
    'authority', 'non_authoritative_client_telemetry',
    'publishable_client_safe', true,
    'platforms', jsonb_build_array('android', 'ios')
  )
)
on conflict (family_key) do update set
  event_prefix = excluded.event_prefix,
  processor_name = excluded.processor_name,
  default_schema_version = excluded.default_schema_version,
  allow_browser = excluded.allow_browser,
  allow_server = excluded.allow_server,
  active = true,
  metadata = coalesce(public.tracking_event_families.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

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
values
  (null, 'app.session_started', 1, 'app', 'active', array[]::text[],
    '{"client_pii":"forbidden"}'::jsonb,
    '{"automatic_processor":false}'::jsonb,
    '{"client_safe":true,"authority":"telemetry"}'::jsonb),
  (null, 'app.screen_viewed', 1, 'app', 'active', array[]::text[],
    '{"client_pii":"forbidden"}'::jsonb,
    '{"automatic_processor":false}'::jsonb,
    '{"client_safe":true,"authority":"telemetry"}'::jsonb),
  (null, 'app.cta_clicked', 1, 'app', 'active', array[]::text[],
    '{"client_pii":"forbidden"}'::jsonb,
    '{"automatic_processor":false}'::jsonb,
    '{"client_safe":true,"authority":"telemetry"}'::jsonb),
  (null, 'app.form_started', 1, 'app', 'active', array[]::text[],
    '{"client_pii":"forbidden"}'::jsonb,
    '{"automatic_processor":false}'::jsonb,
    '{"client_safe":true,"authority":"telemetry"}'::jsonb),
  (null, 'app.form_submitted', 1, 'app', 'active', array[]::text[],
    '{"client_pii":"forbidden"}'::jsonb,
    '{"automatic_processor":false}'::jsonb,
    '{"client_safe":true,"authority":"telemetry"}'::jsonb),
  (null, 'app.deep_link_opened', 1, 'app', 'active', array[]::text[],
    '{"client_pii":"forbidden"}'::jsonb,
    '{"automatic_processor":false}'::jsonb,
    '{"client_safe":true,"authority":"telemetry"}'::jsonb)
on conflict (event_name, schema_version) where organization_id is null
do update set
  family_key = excluded.family_key,
  status = excluded.status,
  required_fields = excluded.required_fields,
  pii_policy = excluded.pii_policy,
  processing_config = excluded.processing_config,
  metadata = excluded.metadata,
  updated_at = now();

create or replace function public.privacy_purpose_for_event_v1(p_event_name text)
returns text
language sql
immutable
as $$
select case
  when lower(coalesce(p_event_name,'')) in (
    'page_view','form_start','cta_click','instagram_click','whatsapp_click','enrollment_cta_click'
  ) then 'analytics'
  when lower(coalesce(p_event_name,'')) like 'web.%'
    and lower(p_event_name) not in ('web.form_submitted','web.lead_submitted') then 'analytics'
  when lower(coalesce(p_event_name,'')) like 'app.%' then 'analytics'
  when lower(coalesce(p_event_name,'')) like 'marketing.%' then 'marketing'
  when lower(coalesce(p_event_name,'')) like 'ad.%' then 'advertising'
  when lower(coalesce(p_event_name,'')) like 'lead.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'message.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'conversation.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'booking.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'payment.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) like 'enrollment.%' then 'service_delivery'
  when lower(coalesce(p_event_name,'')) in (
    'lead_form_submit','form_submit','meta_lead_created','instagram_dm_started','whatsapp_started'
  ) then 'service_delivery'
  else 'service_delivery'
end
$$;

comment on function public.privacy_purpose_for_event_v1(text) is
  'Maps canonical Salsys event names to privacy purposes. app.* telemetry is optional analytics and must pass privacy permission checks.';

commit;
