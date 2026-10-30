-- =============================================================================
-- PH-5.2B.1l COLD-RECOVERY COMPATIBILITY BASELINE
-- Migration 039 prerequisite: legacy lead landing-page field
--
-- This file is NOT part of the normal production migration ledger.
-- It exists only to reconstruct a historical column that migration 039 assumes
-- already exists during an isolated cold rebuild.
--
-- Never run it against current production.
-- No production lead data is copied or rewritten.
-- =============================================================================

begin;

alter table public.leads
  add column if not exists landing_page text;

commit;
