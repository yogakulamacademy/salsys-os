-- PH-5.2B.1j — cold-recovery compatibility only.
--
-- Purpose:
--   The pre-030 paid-media/read-model contract reads lead-level geo fields that
--   exist in production but are not created by the recorded migration chain
--   before migration 030.
--
-- Production shape verified 2026-10-30:
--   geo_country text NULL, no default
--   geo_region  text NULL, no default
--   geo_city    text NULL, no default
--
-- This file is NOT part of the normal production migration ledger.
-- Never run it against current production.

alter table public.leads
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text;
