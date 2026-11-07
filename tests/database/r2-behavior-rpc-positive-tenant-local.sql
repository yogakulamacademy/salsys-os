-- R2-P2: real migrated PostgreSQL RPC positive/negative tenant isolation.
-- CI disposable local Supabase only; never execute against production.
-- Every synthetic auth, profile, tenant, source and event row rolls back.
\set ON_ERROR_STOP on
\echo 'R2-P2: local positive bound-session + cross-tenant isolation rehearsal'
BEGIN;

-- Match the explicitly enabled production tenant-binding policy in the
-- disposable replay database. This transaction is rolled back at the end.
UPDATE public.tenant_security_config SET enforce_session_tenant = true
WHERE singleton = true;
DO $assert$
BEGIN
  IF NOT public.tenant_session_enforcement_enabled() THEN
    RAISE EXCEPTION 'R2-P2: tenant-session isolation not enabled in local test';
  END IF;
END
$assert$;

-- Every ID, email, domain and path below is synthetic. No real person or site.
-- The real tenant security trigger permits ONE active org per normal user.
INSERT INTO auth.users (id,instance_id,aud,role,email)
VALUES
  ('00000000-0000-4000-8000-0000000000c3'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid,
   'authenticated','authenticated','r2-p2-local-owner@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c4'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid,
   'authenticated','authenticated','r2-p2-local-admin@example.invalid');
INSERT INTO public.profiles (id,role,active)
VALUES
 ('00000000-0000-4000-8000-0000000000c3'::uuid,'admin',true),
 ('00000000-0000-4000-8000-0000000000c4'::uuid,'admin',true)
ON CONFLICT (id) DO UPDATE SET active=true, role='admin';

INSERT INTO public.organizations (id,name,slug,status) VALUES
 ('00000000-0000-4000-8000-0000000000a1'::uuid,'R2 CI Synthetic A','r2-ci-positive-a','active'),
 ('00000000-0000-4000-8000-0000000000b2'::uuid,'R2 CI Synthetic B','r2-ci-positive-b','active');

-- Two distinct synthetic CRM accounts each have a single active membership.
-- CI must exercise both valid owner/admin access and foreign-tenant denial.
INSERT INTO public.organization_members
  (organization_id,user_id,role,active)
VALUES
 ('00000000-0000-4000-8000-0000000000a1'::uuid,
  '00000000-0000-4000-8000-0000000000c3'::uuid,'owner',true),
 ('00000000-0000-4000-8000-0000000000b2'::uuid,
  '00000000-0000-4000-8000-0000000000c4'::uuid,'admin',true);

-- Also exercise the actual database guard: a second ACTIVE membership for
-- user A must be rejected; the rejected write rolls back in this DO subblock.
DO $test$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.organization_members
      (organization_id,user_id,role,active)
    VALUES
      ('00000000-0000-4000-8000-0000000000b2'::uuid,
       '00000000-0000-4000-8000-0000000000c3'::uuid,'viewer',true);
  EXCEPTION WHEN SQLSTATE '23514' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R2-P2: second active membership unexpectedly allowed';
  END IF;
END
$test$;

INSERT INTO public.tracking_sources
  (id,organization_id,name,source_type,source_system,auth_mode,status)
VALUES
 ('00000000-0000-4000-8000-0000000000f6'::uuid,
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  'R2 Local A','system','r2-local-fixture','internal','active'),
 ('00000000-0000-4000-8000-0000000000f7'::uuid,
  '00000000-0000-4000-8000-0000000000b2'::uuid,
  'R2 Local B','system','r2-local-fixture','internal','active');

-- Recent A has page/form-start/form-submit counts of 4/2/1, B 5/3/2.
-- Additional historical cohorts are inserted below for 14/30-day tests.
-- All identifiers are synthetic.
WITH sources(organization_id,source_id,source_label,views,starts,submits) AS (
  VALUES
   ('00000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000000f6'::uuid,'a',4,2,1),
   ('00000000-0000-4000-8000-0000000000b2'::uuid,
    '00000000-0000-4000-8000-0000000000f7'::uuid,'b',5,3,2)
), rows AS (
  SELECT s.organization_id,s.source_id,s.source_label,i.session_number,
         step.event_name,step.step_number
  FROM sources s
  CROSS JOIN LATERAL generate_series(1,s.views) i(session_number)
  CROSS JOIN (VALUES
     ('web.page_viewed',0),
     ('web.form_started',1),
     ('web.form_submitted',2)
  ) step(event_name,step_number)
  WHERE step.step_number=0
     OR (step.step_number=1 AND i.session_number<=s.starts)
     OR (step.step_number=2 AND i.session_number<=s.submits)
)
INSERT INTO public.raw_events (
  organization_id,tracking_source_id,source_system,source_event_id,
  source_event_type,event_family,contract_version,occurred_at,received_at,
  anonymous_visitor_id,session_key,payload
)
SELECT organization_id,source_id,'r2-local-fixture',
  'r2-local-'||source_label||'-'||session_number||'-'||event_name,
  event_name,'web',1,
  now()-interval '70 minutes'+make_interval(mins=>step_number),now(),
  'synthetic-visitor-'||source_label||'-'||session_number,
  'synthetic-session-'||source_label||'-'||session_number,
  '{"pagePath":"/courses/r2-fixture.php"}'::jsonb
FROM rows;

-- Two older, separately scoped synthetic cohorts exercise UTC 14/30-day
-- calendar inclusions and the independent SQL-to-RPC aggregate comparison.
-- A: +2/1/0 at 10d and +1/0/0 at 22d. B: +1/1/1 and +2/1/0.
-- Therefore 7d A=4/2/1, B=5/3/2; 14d A=6/3/1, B=6/4/3;
-- 30d A=7/3/1, B=8/5/3. All records vanish with the final ROLLBACK.
WITH cohorts(organization_id,source_id,source_label,age_days,views,starts,submits) AS (
  VALUES
   ('00000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000000f6'::uuid,'a',10,2,1,0),
   ('00000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000000f6'::uuid,'a',22,1,0,0),
   ('00000000-0000-4000-8000-0000000000b2'::uuid,
    '00000000-0000-4000-8000-0000000000f7'::uuid,'b',10,1,1,1),
   ('00000000-0000-4000-8000-0000000000b2'::uuid,
    '00000000-0000-4000-8000-0000000000f7'::uuid,'b',22,2,1,0)
), rows AS (
  SELECT c.organization_id,c.source_id,c.source_label,c.age_days,
         i.session_number, step.event_name,step.step_number
  FROM cohorts c
  CROSS JOIN LATERAL generate_series(1,c.views) i(session_number)
  CROSS JOIN (VALUES
    ('web.page_viewed',0),('web.form_started',1),('web.form_submitted',2)
  ) step(event_name,step_number)
  WHERE step.step_number=0
     OR (step.step_number=1 AND i.session_number<=c.starts)
     OR (step.step_number=2 AND i.session_number<=c.submits)
)
INSERT INTO public.raw_events (
  organization_id,tracking_source_id,source_system,source_event_id,
  source_event_type,event_family,contract_version,occurred_at,received_at,
  anonymous_visitor_id,session_key,payload
)
SELECT organization_id,source_id,'r2-local-fixture',
  'r2-historical-'||source_label||'-'||age_days||'-'||session_number||'-'||event_name,
  event_name,'web',1,
  now()-make_interval(days=>age_days)+make_interval(mins=>step_number),
  now()-make_interval(days=>age_days)+interval '5 minutes',
  'synthetic-visitor-'||source_label||'-hist-'||age_days||'-'||session_number,
  'synthetic-session-'||source_label||'-hist-'||age_days||'-'||session_number,
  '{"pagePath":"/courses/r2-fixture.php"}'::jsonb
FROM rows;

-- Independent, operator-style SQL ground truth: exact UTC calendar windows
-- and receipt floor, not the Behavior RPC implementation or its funnel helper.
-- No identifiers or payloads leave this disposable DB. Grant only SELECT to
-- the temporary authenticated test role; the table disappears on ROLLBACK.
CREATE TEMP TABLE r2_p2_expected_utc_aggregates ON COMMIT DROP AS
WITH windows(days) AS (VALUES (7),(14),(30))
SELECT e.organization_id,w.days,e.source_event_type AS event_name,
  count(*)::bigint AS events,
  count(distinct (e.tracking_source_id,e.anonymous_visitor_id,e.session_key))
    filter (where e.tracking_source_id is not null
      and nullif(e.anonymous_visitor_id,'') is not null
      and nullif(e.session_key,'') is not null)::bigint AS sessions
FROM windows w
JOIN public.raw_events e
  ON e.organization_id IN (
     '00000000-0000-4000-8000-0000000000a1'::uuid,
     '00000000-0000-4000-8000-0000000000b2'::uuid)
WHERE e.event_family='web'
  AND e.source_event_type IN (
    'web.page_viewed','web.form_started','web.form_submitted')
  AND e.occurred_at >=
    (((now() AT TIME ZONE 'UTC')::date-(w.days-1))::timestamp AT TIME ZONE 'UTC')
  AND e.occurred_at <
    (((now() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC')
  AND e.received_at >=
    (((now() AT TIME ZONE 'UTC')::date-w.days)::timestamp AT TIME ZONE 'UTC')
GROUP BY e.organization_id,w.days,e.source_event_type;
GRANT SELECT ON TABLE pg_temp.r2_p2_expected_utc_aggregates TO authenticated;

-- Use the actual database's authenticated role and the same session_id
-- claims shape parsed by auth.jwt(). These are NOT signed tokens.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c3',true);
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000c3","aud":"authenticated","session_id":"00000000-0000-4000-8000-0000000000d4"}',true);

DO $test$
DECLARE
  org_a uuid := '00000000-0000-4000-8000-0000000000a1'::uuid;
  org_b uuid := '00000000-0000-4000-8000-0000000000b2'::uuid;
  report jsonb;
  denied boolean;
  n integer;
BEGIN
  PERFORM public.bind_current_tenant_session(org_a);
  IF public.current_tenant_organization_id() IS DISTINCT FROM org_a THEN
    RAISE EXCEPTION 'R2-P2: bound owner session not scoped to tenant A';
  END IF;

  report := public.get_native_behavior_workspace_v1(
     org_a,7,ARRAY['web.page_viewed','web.form_started','web.form_submitted']::text[]);
  IF report #>> '{status,available}' <> 'true'
    OR report #>> '{funnel,0,sessions}' <> '4'
    OR report #>> '{funnel,1,sessions}' <> '2'
    OR report #>> '{funnel,2,sessions}' <> '1'
    OR report ->> 'path_sessions' <> '4' THEN
    RAISE EXCEPTION 'R2-P2: owner A ordered funnel does not reflect only synthetic tenant A events';
  END IF;

  report := public.get_native_behavior_event_trends_v1(
    org_a,7,ARRAY['web.page_viewed','web.form_started','web.form_submitted']::text[]);
  IF report #>> '{status,available}' <> 'true'
    OR report #>> '{series,0,total_events}' <> '4'
    OR report #>> '{series,1,total_events}' <> '2'
    OR report #>> '{series,2,total_events}' <> '1'
    OR report #>> '{series,0,observed_sessions}' <> '4' THEN
    RAISE EXCEPTION 'R2-P2: owner A event trends leak/lose tenant counts';
  END IF;

  report := public.get_native_behavior_page_breakdown_v1(org_a,7,'web.page_viewed');
  IF report #>> '{status,available}' <> 'true'
    OR report #>> '{status,total_events}' <> '4'
    OR report #>> '{status,identified_sessions}' <> '4'
    OR report #>> '{pages,0,path}' <> '/courses/r2-fixture.php' THEN
    RAISE EXCEPTION 'R2-P2: owner A page breakdown differs from local synthetic source';
  END IF;

  -- Owner A does not belong to B; every foreign RPC must still reject.
  FOR n IN 1..3 LOOP
    denied := false;
    BEGIN
      IF n=1 THEN
        PERFORM public.get_native_behavior_workspace_v1(
          org_b,7,ARRAY['web.page_viewed','web.form_started']::text[]);
      ELSIF n=2 THEN
        PERFORM public.get_native_behavior_event_trends_v1(
          org_b,7,ARRAY['web.page_viewed']::text[]);
      ELSE
        PERFORM public.get_native_behavior_page_breakdown_v1(org_b,7,'web.page_viewed');
      END IF;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'R2-P2: owner A session read tenant B report %',n;
    END IF;
  END LOOP;

  -- A session cannot simply be rebound to the other membership.
  denied := false;
  BEGIN
    PERFORM public.bind_current_tenant_session(org_b);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R2-P2: existing session incorrectly rebound to tenant B';
  END IF;
END
$test$;

-- Independent 7/14/30-day SQL-versus-RPC acceptance for the bound owner-A account.
-- These SQL counts were computed from raw_events before switching roles; only
-- aggregated synthetic totals are exposed through the ephemeral temp table.
DO $r2_window_reconcile$
DECLARE
  tenant_id uuid := '00000000-0000-4000-8000-0000000000a1'::uuid;
  default_events text[] := ARRAY['web.page_viewed','web.form_started','web.form_submitted']::text[];
  w integer;
  idx integer;
  expected_events bigint;
  expected_sessions bigint;
  observed_daily_sum bigint;
  expected_pages bigint;
  funnel_result jsonb;
  trends_result jsonb;
  pages_result jsonb;
BEGIN
  IF public.current_tenant_organization_id() IS DISTINCT FROM tenant_id THEN
    RAISE EXCEPTION 'R2-P2: owner-A lost its authenticated bound tenant';
  END IF;
  FOREACH w IN ARRAY ARRAY[7,14,30] LOOP
    expected_pages := CASE w
      WHEN 7 THEN 4
      WHEN 14 THEN 6
      ELSE 7 END;

    funnel_result := public.get_native_behavior_workspace_v1(tenant_id,w,default_events);
    trends_result := public.get_native_behavior_event_trends_v1(tenant_id,w,default_events);
    pages_result := public.get_native_behavior_page_breakdown_v1(tenant_id,w,'web.page_viewed');

    IF funnel_result #>> '{status,available}' IS DISTINCT FROM 'true'
      OR trends_result #>> '{status,available}' IS DISTINCT FROM 'true'
      OR pages_result #>> '{status,available}' IS DISTINCT FROM 'true'
      OR (funnel_result #>> '{status,window_days}')::integer IS DISTINCT FROM w
      OR (trends_result #>> '{status,window_days}')::integer IS DISTINCT FROM w
      OR (pages_result #>> '{status,window_days}')::integer IS DISTINCT FROM w
      OR (trends_result #>> '{status,first_day_utc}') IS DISTINCT FROM
        to_char((now() at time zone 'UTC')::date-(w-1),'YYYY-MM-DD')
      OR (trends_result #>> '{status,last_day_utc}') IS DISTINCT FROM
        to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD')
    THEN
      RAISE EXCEPTION 'R2-P2: owner-A %-day report availability/date boundary mismatch',w;
    END IF;

    FOR idx IN 0..2 LOOP
      SELECT t.events,t.sessions INTO expected_events,expected_sessions
      FROM pg_temp.r2_p2_expected_utc_aggregates t
      WHERE t.organization_id=tenant_id AND t.days=w AND t.event_name=default_events[idx+1];
      IF NOT FOUND THEN
        RAISE EXCEPTION 'R2-P2: owner-A missing independent SQL event truth';
      END IF;
      IF (trends_result #>> ARRAY['series',idx::text,'event_name'])
          IS DISTINCT FROM default_events[idx+1]
        OR (trends_result #>> ARRAY['series',idx::text,'total_events'])::bigint
          IS DISTINCT FROM expected_events
        OR (trends_result #>> ARRAY['series',idx::text,'observed_sessions'])::bigint
          IS DISTINCT FROM expected_sessions
        OR (funnel_result #>> ARRAY['funnel',idx::text,'sessions'])::bigint
          IS DISTINCT FROM expected_sessions
        OR jsonb_array_length(trends_result #> ARRAY['series',idx::text,'daily'])
          IS DISTINCT FROM w
      THEN
        RAISE EXCEPTION 'R2-P2: owner-A %-day SQL-versus-RPC mismatch at step %',w,idx+1;
      END IF;

      SELECT coalesce(sum((entry.value->>'events')::bigint),0)
      INTO observed_daily_sum
      FROM jsonb_array_elements(trends_result #> ARRAY['series',idx::text,'daily']) entry(value);
      IF observed_daily_sum IS DISTINCT FROM expected_events THEN
        RAISE EXCEPTION 'R2-P2: owner-A %-day daily sum does not equal independent SQL totals',w;
      END IF;
    END LOOP;

    IF (pages_result #>> '{status,total_events}')::bigint IS DISTINCT FROM expected_pages
       OR (pages_result #>> '{status,identified_sessions}')::bigint IS DISTINCT FROM expected_pages
       OR (pages_result #>> '{pages,0,events}')::bigint IS DISTINCT FROM expected_pages
       OR (pages_result #>> '{pages,0,path}') IS DISTINCT FROM '/courses/r2-fixture.php'
       OR (funnel_result ->> 'path_sessions')::bigint IS DISTINCT FROM expected_pages
    THEN
      RAISE EXCEPTION 'R2-P2: owner-A %-day page/path totals differ from synthetic SQL',w;
    END IF;
  END LOOP;
END
$r2_window_reconcile$;

-- Switch to a separate synthetic admin user AND distinct session bound to B.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c4',true);
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000c4","aud":"authenticated","session_id":"00000000-0000-4000-8000-0000000000e5"}',true);

DO $test$
DECLARE
  org_a uuid := '00000000-0000-4000-8000-0000000000a1'::uuid;
  org_b uuid := '00000000-0000-4000-8000-0000000000b2'::uuid;
  report jsonb;
  denied boolean;
  n integer;
BEGIN
  PERFORM public.bind_current_tenant_session(org_b);
  IF public.current_tenant_organization_id() IS DISTINCT FROM org_b THEN
    RAISE EXCEPTION 'R2-P2: admin session B did not bind';
  END IF;

  report := public.get_native_behavior_workspace_v1(
    org_b,7,ARRAY['web.page_viewed','web.form_started','web.form_submitted']::text[]);
  IF report #>> '{status,available}' <> 'true'
    OR report #>> '{funnel,0,sessions}' <> '5'
    OR report #>> '{funnel,1,sessions}' <> '3'
    OR report #>> '{funnel,2,sessions}' <> '2'
    OR report ->> 'path_sessions' <> '5' THEN
    RAISE EXCEPTION 'R2-P2: admin B ordered funnel leak/count mismatch';
  END IF;

  report := public.get_native_behavior_event_trends_v1(
    org_b,7,ARRAY['web.page_viewed','web.form_started','web.form_submitted']::text[]);
  IF report #>> '{status,available}' <> 'true'
    OR report #>> '{series,0,total_events}' <> '5'
    OR report #>> '{series,1,total_events}' <> '3'
    OR report #>> '{series,2,total_events}' <> '2'
    OR report #>> '{series,0,observed_sessions}' <> '5' THEN
    RAISE EXCEPTION 'R2-P2: admin B trends leak/count mismatch';
  END IF;

  report := public.get_native_behavior_page_breakdown_v1(org_b,7,'web.page_viewed');
  IF report #>> '{status,available}' <> 'true'
    OR report #>> '{status,total_events}' <> '5'
    OR report #>> '{status,identified_sessions}' <> '5'
    OR report #>> '{pages,0,path}' <> '/courses/r2-fixture.php' THEN
    RAISE EXCEPTION 'R2-P2: admin B page breakdown leak/count mismatch';
  END IF;

  FOR n IN 1..3 LOOP
    denied := false;
    BEGIN
      IF n=1 THEN
        PERFORM public.get_native_behavior_workspace_v1(
          org_a,7,ARRAY['web.page_viewed','web.form_started']::text[]);
      ELSIF n=2 THEN
        PERFORM public.get_native_behavior_event_trends_v1(
          org_a,7,ARRAY['web.page_viewed']::text[]);
      ELSE
        PERFORM public.get_native_behavior_page_breakdown_v1(org_a,7,'web.page_viewed');
      END IF;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'R2-P2: admin B session read tenant A report %',n;
    END IF;
  END LOOP;
END
$test$;

-- Independent 7/14/30-day SQL-versus-RPC acceptance for the bound admin-B account.
-- These SQL counts were computed from raw_events before switching roles; only
-- aggregated synthetic totals are exposed through the ephemeral temp table.
DO $r2_window_reconcile$
DECLARE
  tenant_id uuid := '00000000-0000-4000-8000-0000000000b2'::uuid;
  default_events text[] := ARRAY['web.page_viewed','web.form_started','web.form_submitted']::text[];
  w integer;
  idx integer;
  expected_events bigint;
  expected_sessions bigint;
  observed_daily_sum bigint;
  expected_pages bigint;
  funnel_result jsonb;
  trends_result jsonb;
  pages_result jsonb;
BEGIN
  IF public.current_tenant_organization_id() IS DISTINCT FROM tenant_id THEN
    RAISE EXCEPTION 'R2-P2: admin-B lost its authenticated bound tenant';
  END IF;
  FOREACH w IN ARRAY ARRAY[7,14,30] LOOP
    expected_pages := CASE w
      WHEN 7 THEN 5
      WHEN 14 THEN 6
      ELSE 8 END;

    funnel_result := public.get_native_behavior_workspace_v1(tenant_id,w,default_events);
    trends_result := public.get_native_behavior_event_trends_v1(tenant_id,w,default_events);
    pages_result := public.get_native_behavior_page_breakdown_v1(tenant_id,w,'web.page_viewed');

    IF funnel_result #>> '{status,available}' IS DISTINCT FROM 'true'
      OR trends_result #>> '{status,available}' IS DISTINCT FROM 'true'
      OR pages_result #>> '{status,available}' IS DISTINCT FROM 'true'
      OR (funnel_result #>> '{status,window_days}')::integer IS DISTINCT FROM w
      OR (trends_result #>> '{status,window_days}')::integer IS DISTINCT FROM w
      OR (pages_result #>> '{status,window_days}')::integer IS DISTINCT FROM w
      OR (trends_result #>> '{status,first_day_utc}') IS DISTINCT FROM
        to_char((now() at time zone 'UTC')::date-(w-1),'YYYY-MM-DD')
      OR (trends_result #>> '{status,last_day_utc}') IS DISTINCT FROM
        to_char((now() at time zone 'UTC')::date,'YYYY-MM-DD')
    THEN
      RAISE EXCEPTION 'R2-P2: admin-B %-day report availability/date boundary mismatch',w;
    END IF;

    FOR idx IN 0..2 LOOP
      SELECT t.events,t.sessions INTO expected_events,expected_sessions
      FROM pg_temp.r2_p2_expected_utc_aggregates t
      WHERE t.organization_id=tenant_id AND t.days=w AND t.event_name=default_events[idx+1];
      IF NOT FOUND THEN
        RAISE EXCEPTION 'R2-P2: admin-B missing independent SQL event truth';
      END IF;
      IF (trends_result #>> ARRAY['series',idx::text,'event_name'])
          IS DISTINCT FROM default_events[idx+1]
        OR (trends_result #>> ARRAY['series',idx::text,'total_events'])::bigint
          IS DISTINCT FROM expected_events
        OR (trends_result #>> ARRAY['series',idx::text,'observed_sessions'])::bigint
          IS DISTINCT FROM expected_sessions
        OR (funnel_result #>> ARRAY['funnel',idx::text,'sessions'])::bigint
          IS DISTINCT FROM expected_sessions
        OR jsonb_array_length(trends_result #> ARRAY['series',idx::text,'daily'])
          IS DISTINCT FROM w
      THEN
        RAISE EXCEPTION 'R2-P2: admin-B %-day SQL-versus-RPC mismatch at step %',w,idx+1;
      END IF;

      SELECT coalesce(sum((entry.value->>'events')::bigint),0)
      INTO observed_daily_sum
      FROM jsonb_array_elements(trends_result #> ARRAY['series',idx::text,'daily']) entry(value);
      IF observed_daily_sum IS DISTINCT FROM expected_events THEN
        RAISE EXCEPTION 'R2-P2: admin-B %-day daily sum does not equal independent SQL totals',w;
      END IF;
    END LOOP;

    IF (pages_result #>> '{status,total_events}')::bigint IS DISTINCT FROM expected_pages
       OR (pages_result #>> '{status,identified_sessions}')::bigint IS DISTINCT FROM expected_pages
       OR (pages_result #>> '{pages,0,events}')::bigint IS DISTINCT FROM expected_pages
       OR (pages_result #>> '{pages,0,path}') IS DISTINCT FROM '/courses/r2-fixture.php'
       OR (funnel_result ->> 'path_sessions')::bigint IS DISTINCT FROM expected_pages
    THEN
      RAISE EXCEPTION 'R2-P2: admin-B %-day page/path totals differ from synthetic SQL',w;
    END IF;
  END LOOP;
END
$r2_window_reconcile$;

-- The entire fixture including raw_events, users and tenant bindings disappears.
ROLLBACK;
\echo 'R2-P2: local positive owner/admin tenant-bound RPC isolation PASSED'
