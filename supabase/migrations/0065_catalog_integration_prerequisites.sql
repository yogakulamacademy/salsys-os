-- Historical replay repair.
--
-- Production already had these catalog integration columns before migration 007,
-- but migrations 001-006 never versioned their creation. Migration 007 then
-- created tenant-scoped indexes that assumed the columns existed.
--
-- Keep this migration schema-only and idempotent so a clean database can
-- reproduce the pre-007 production prerequisite without changing business data.

begin;

alter table public.courses
  add column if not exists source_system text,
  add column if not exists external_course_id text;

alter table public.course_batches
  add column if not exists source_system text,
  add column if not exists external_batch_id text;

commit;
