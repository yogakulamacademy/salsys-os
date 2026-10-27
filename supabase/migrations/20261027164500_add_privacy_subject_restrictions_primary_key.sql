begin;

-- PH-0 schema hardening: privacy_subject_restrictions supports multiple
-- subject identity shapes, so use a surrogate UUID as the stable row identity.
alter table public.privacy_subject_restrictions
  add column id uuid not null default gen_random_uuid();

alter table public.privacy_subject_restrictions
  add constraint privacy_subject_restrictions_pkey primary key (id);

commit;
