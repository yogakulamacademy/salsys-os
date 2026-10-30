-- PH-5.2B.1g/1h — cold-recovery compatibility only.
-- Reconstructs historical source columns consumed by migration 018_person_journey
-- and migration 020_attribution_workspace_tenant_scope.
--
-- Current production defines these columns as nullable text with no defaults.
-- This file is NOT part of the normal production migration ledger.

alter table public.touchpoints
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text;

alter table public.web_sessions
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text,
  add column if not exists geo_timezone text;

alter table public.leads
  add column if not exists lead_origin text,
  add column if not exists first_touch_source text,
  add column if not exists first_touch_medium text,
  add column if not exists first_touch_campaign text,
  add column if not exists last_touch_source text,
  add column if not exists last_touch_medium text,
  add column if not exists last_touch_campaign text;
