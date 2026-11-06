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
INSERT INTO auth.users (id,instance_id,aud,role,email)
VALUES (
  '00000000-0000-4000-8000-0000000000c3'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated','authenticated','r2-p2-local-only@example.invalid'
);
INSERT INTO public.profiles (id,role,active)
VALUES ('00000000-0000-4000-8000-0000000000c3'::uuid,'admin',true)
ON CONFLICT (id) DO UPDATE SET active=true, role='admin';

INSERT INTO public.organizations (id,name,slug,status) VALUES
 ('00000000-0000-4000-8000-0000000000a1'::uuid,'R2 CI Synthetic A','r2-ci-positive-a','active'),
 ('00000000-0000-4000-8000-0000000000b2'::uuid,'R2 CI Synthetic B','r2-ci-positive-b','active');

-- The SAME synthetic CRM user belongs to BOTH tenants: a membership check
-- alone must NEVER allow one bound session to read the other organization's data.
INSERT INTO public.organization_members
  (organization_id,user_id,role,active)
VALUES
 ('00000000-0000-4000-8000-0000000000a1'::uuid,
  '00000000-0000-4000-8000-0000000000c3'::uuid,'owner',true),
 ('00000000-0000-4000-8000-0000000000b2'::uuid,
  '00000000-0000-4000-8000-0000000000c3'::uuid,'admin',true);

INSERT INTO public.tracking_sources
  (id,organization_id,name,source_type,source_system,auth_mode,status)
VALUES
 ('00000000-0000-4000-8000-0000000000f6'::uuid,
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  'R2 Local A','system','r2-local-fixture','internal','active'),
 ('00000000-0000-4000-8000-0000000000f7'::uuid,
  '00000000-0000-4000-8000-0000000000b2'::uuid,
  'R2 Local B','system','r2-local-fixture','internal','active');

-- A has page/form-start/form-submit counts of 4/2/1; B has 5/3/2.
-- All times stay within the last hour and all identifiers are synthetic.
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

  -- User belongs to B too, but the A session MUST reject B across all RPCs.
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

-- A separate synthetic session from the SAME member can bind B safely.
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000000c3","aud":"authenticated","session_id":"00000000-0000-4000-8000-0000000000e5"}',true);

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

-- The entire fixture including raw_events, users and tenant bindings disappears.
ROLLBACK;
\echo 'R2-P2: local positive owner/admin tenant-bound RPC isolation PASSED'
