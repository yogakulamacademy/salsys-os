-- R2-P2 clean-local-database negative authorization acceptance.
-- Runs ONLY after the CI Supabase migration replay on an empty local database.
-- No production credentials, tenant data, inserts, identity forging in production,
-- lead/event writes, tracking, or role grants.
--
-- Testing intentionally non-existent local UUIDs is NOT a substitute for
-- authenticated real owner/admin or cross-tenant acceptance (Issue #523).
\set ON_ERROR_STOP on
\echo 'R2-P2: anonymous role must not execute any Behavior report RPC'
BEGIN;
SET LOCAL ROLE anon;

DO $test$
DECLARE
  probe integer;
  rejected boolean;
BEGIN
  FOR probe IN 1..3 LOOP
    rejected := false;
    BEGIN
      IF probe = 1 THEN
        PERFORM public.get_native_behavior_workspace_v1(
          '00000000-0000-4000-8000-000000000099'::uuid,
          7, ARRAY['web.page_viewed','web.form_started']::text[]);
      ELSIF probe = 2 THEN
        PERFORM public.get_native_behavior_event_trends_v1(
          '00000000-0000-4000-8000-000000000099'::uuid,
          7, ARRAY['web.page_viewed']::text[]);
      ELSE
        PERFORM public.get_native_behavior_page_breakdown_v1(
          '00000000-0000-4000-8000-000000000099'::uuid,
          7, 'web.page_viewed');
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'R2-P2: anonymous Behavior report % unexpectedly executable', probe;
    END IF;
  END LOOP;
END
$test$;
ROLLBACK;

\echo 'R2-P2: unbound synthetic authenticated claims must not access either nonexistent tenant'
BEGIN;
SET LOCAL ROLE authenticated;
-- Only transaction-local synthetic JWT metadata in CI, NOT an actual signed token.
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000098',true);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000098","aud":"authenticated"}',
  true
);

DO $test$
DECLARE
  tenant uuid;
  probe integer;
  rejected boolean;
BEGIN
  FOREACH tenant IN ARRAY ARRAY[
    '00000000-0000-4000-8000-000000000099'::uuid,
    '00000000-0000-4000-8000-000000000097'::uuid
  ] LOOP
    FOR probe IN 1..3 LOOP
      rejected := false;
      BEGIN
        IF probe = 1 THEN
          PERFORM public.get_native_behavior_workspace_v1(
            tenant, 14,
            ARRAY['web.page_viewed','web.form_started','web.form_submitted']::text[]);
        ELSIF probe = 2 THEN
          PERFORM public.get_native_behavior_event_trends_v1(
            tenant, 14, ARRAY['web.page_viewed']::text[]);
        ELSE
          PERFORM public.get_native_behavior_page_breakdown_v1(
            tenant, 14, 'web.page_viewed');
        END IF;
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        rejected := true;
      END;
      IF NOT rejected THEN
        RAISE EXCEPTION
          'R2-P2: unbound synthetic claims unexpectedly accessed report %',
          probe;
      END IF;
    END LOOP;
  END LOOP;
END
$test$;
ROLLBACK;
\echo 'R2-P2: local Postgres anonymous/unbound-session report denial PASSED'
