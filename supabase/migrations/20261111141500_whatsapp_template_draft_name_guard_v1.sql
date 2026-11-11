-- Follow-up to the WhatsApp draft storage foundation.
-- PostgreSQL's regex engine rejects a {1,512} repetition range, even though
-- the original table migration passed DDL replay. Separate character
-- whitelisting from the bounded length check.
-- This migration is additive to the previously approved fail-closed table.
begin;
alter table public.whatsapp_template_drafts
  drop constraint if exists whatsapp_template_drafts_name_check;
alter table public.whatsapp_template_drafts
  add constraint whatsapp_template_drafts_name_check
  check (
    length(template_name) between 1 and 512
    and template_name ~ '^[a-z0-9_]+$'
  );
commit;
