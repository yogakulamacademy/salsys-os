begin;

-- =============================================================================
-- 014_raw_event_immutability.sql
--
-- Phase 2E5 security hardening.
--
-- raw_events is append-only source evidence.
--
-- service_role may:
--   - SELECT raw evidence
--   - INSERT new raw evidence
--
-- service_role may NOT:
--   - UPDATE existing raw evidence
--   - DELETE raw evidence
--   - TRUNCATE the table
--   - use REFERENCES / TRIGGER table privileges
--
-- Canonical ingestion through ingest_raw_event(...) remains available.
-- The table owner (postgres) retains owner privileges for migrations and
-- controlled administrative maintenance.
-- =============================================================================


-- =============================================================================
-- 1. RESET SERVICE-ROLE TABLE PRIVILEGES TO THE APPEND-ONLY CONTRACT
-- =============================================================================

revoke all privileges
on table public.raw_events
from service_role;


grant select, insert
on table public.raw_events
to service_role;


-- =============================================================================
-- 2. FINAL ASSERTIONS
-- =============================================================================

do $$
declare
  v_ingest regprocedure;
begin
  v_ingest := to_regprocedure(
    'public.ingest_raw_event(uuid,text,text,text,text,timestamptz,text,text,text,text,text,text,jsonb,jsonb,jsonb,integer)'
  );

  if v_ingest is null then
    raise exception
      '014 abort: ingest_raw_event(...) is missing';
  end if;

  if not has_function_privilege(
    'service_role',
    v_ingest,
    'EXECUTE'
  ) then
    raise exception
      '014 abort: service_role lost EXECUTE on ingest_raw_event(...)';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.raw_events',
    'SELECT'
  ) then
    raise exception
      '014 abort: service_role must retain SELECT on raw_events';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.raw_events',
    'INSERT'
  ) then
    raise exception
      '014 abort: service_role must retain INSERT on raw_events';
  end if;

  if has_table_privilege(
    'service_role',
    'public.raw_events',
    'UPDATE'
  ) then
    raise exception
      '014 abort: service_role still has UPDATE on raw_events';
  end if;

  if has_table_privilege(
    'service_role',
    'public.raw_events',
    'DELETE'
  ) then
    raise exception
      '014 abort: service_role still has DELETE on raw_events';
  end if;

  if has_table_privilege(
    'service_role',
    'public.raw_events',
    'TRUNCATE'
  ) then
    raise exception
      '014 abort: service_role still has TRUNCATE on raw_events';
  end if;

  if has_table_privilege(
    'service_role',
    'public.raw_events',
    'REFERENCES'
  ) then
    raise exception
      '014 abort: service_role still has REFERENCES on raw_events';
  end if;

  if has_table_privilege(
    'service_role',
    'public.raw_events',
    'TRIGGER'
  ) then
    raise exception
      '014 abort: service_role still has TRIGGER on raw_events';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.raw_events'::regclass
  ) then
    raise exception
      '014 abort: raw_events RLS is not enabled';
  end if;
end
$$;


commit;
