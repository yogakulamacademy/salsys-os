-- Privacy restriction metadata fix
-- Required by identity-promotion audit evidence.

alter table public.privacy_subject_restrictions
  add column if not exists metadata jsonb not null default '{}'::jsonb;
