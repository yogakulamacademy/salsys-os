-- Cold-recovery compatibility only.
--
-- The legacy update_course_batch_admin RPC already referenced these residential
-- commercial fields before 20261014054200, but their base-schema creator was
-- never captured in source-controlled migration history or the production
-- migration ledger. Production confirms the live column types and checks below.
--
-- This reconstructs only the missing course_batches contract for ephemeral
-- clean replay. It copies no production data and must never be run in production.

begin;

alter table public.course_batches
  add column if not exists accommodation_capacity integer,
  add column if not exists accommodation_remaining integer,
  add column if not exists accommodation_note text;

do $recovery$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.course_batches'::regclass
      and conname = 'course_batches_accommodation_capacity_check'
  ) then
    alter table public.course_batches
      add constraint course_batches_accommodation_capacity_check
      check (accommodation_capacity is null or accommodation_capacity >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.course_batches'::regclass
      and conname = 'course_batches_accommodation_remaining_check'
  ) then
    alter table public.course_batches
      add constraint course_batches_accommodation_remaining_check
      check (accommodation_remaining is null or accommodation_remaining >= 0);
  end if;
end;
$recovery$;

commit;
