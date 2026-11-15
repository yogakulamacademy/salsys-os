-- Home V1: rollback-only authorization and semantic tests on CI LOCAL Supabase.
-- Never run this against staging or production. No real identities or data.
\set ON_ERROR_STOP on
\echo 'Home V1: local auth and source/pipeline metric verification'
BEGIN;
UPDATE public.tenant_security_config
SET enforce_session_tenant = true WHERE singleton = true;

DO $check$
BEGIN
  IF NOT public.tenant_session_enforcement_enabled() THEN
    RAISE EXCEPTION 'Home V1 local tenant enforcement must be enabled';
  END IF;
END $check$;

-- Four users across two distinct organizations; all synthetic .invalid emails.
INSERT INTO auth.users(id,instance_id,aud,role,email) VALUES
 ('00000000-0000-4000-8000-00000000a101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','home-owner@example.invalid'),
 ('00000000-0000-4000-8000-00000000a102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','home-manager@example.invalid'),
 ('00000000-0000-4000-8000-00000000a103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','home-admissions@example.invalid'),
 ('00000000-0000-4000-8000-00000000b101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','home-admin-b@example.invalid');

INSERT INTO public.profiles(id,role,active) VALUES
 ('00000000-0000-4000-8000-00000000a101','admin',true),
 ('00000000-0000-4000-8000-00000000a102','admin',true),
 ('00000000-0000-4000-8000-00000000a103','admin',true),
 ('00000000-0000-4000-8000-00000000b101','admin',true)
ON CONFLICT (id) DO UPDATE SET role = 'admin',active = true;

INSERT INTO public.organizations(id,name,slug,status) VALUES
 ('00000000-0000-4000-8000-00000000a001','Home CI A','home-v1-synthetic-a','active'),
 ('00000000-0000-4000-8000-00000000b001','Home CI B','home-v1-synthetic-b','active');

INSERT INTO public.organization_members(organization_id,user_id,role,active) VALUES
 ('00000000-0000-4000-8000-00000000a001','00000000-0000-4000-8000-00000000a101','owner',true),
 ('00000000-0000-4000-8000-00000000a001','00000000-0000-4000-8000-00000000a102','manager',true),
 ('00000000-0000-4000-8000-00000000a001','00000000-0000-4000-8000-00000000a103','admissions',true),
 ('00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000b101','admin',true);

-- The owner-A cohort contains seven leads: two qualified BY cutoff.
-- One lead progresses AFTER cutoff, so must not be counted historically.
-- Pipeline A has five eligible leads: two valued, two without value, and
-- one with a positive amount but missing currency. Ineligible leads are
-- lost or nurture, even when their potential_value is positive.
INSERT INTO public.leads
 (id,organization_id,first_name,first_touch_source,current_stage,status,created_at,potential_value,potential_currency)
VALUES
 ('00000000-0000-4000-8000-00000000a201','00000000-0000-4000-8000-00000000a001','Alpha','ig','qualified','open','2026-11-02T10:00:00Z',1250,'INR'),
 ('00000000-0000-4000-8000-00000000a202','00000000-0000-4000-8000-00000000a001','Beta','instagram','qualified','open','2026-11-03T10:00:00Z',null,null),
 ('00000000-0000-4000-8000-00000000a203','00000000-0000-4000-8000-00000000a001','Gamma','l.instagram.com','payment_pending','open','2026-11-04T10:00:00Z',500,'USD'),
 ('00000000-0000-4000-8000-00000000a204','00000000-0000-4000-8000-00000000a001','Delta','google','lost','lost','2026-11-04T11:00:00Z',2400,'INR'),
 ('00000000-0000-4000-8000-00000000a205','00000000-0000-4000-8000-00000000a001','Epsilon','www.google.com','engaged','open','2026-11-05T10:00:00Z',300,''),
 ('00000000-0000-4000-8000-00000000a206','00000000-0000-4000-8000-00000000a001','Zeta','direct','new','open','2026-11-05T11:00:00Z',0,'INR'),
 ('00000000-0000-4000-8000-00000000a207','00000000-0000-4000-8000-00000000a001','Eta','mystery-referrer','nurture','open','2026-11-05T12:00:00Z',150,'INR'),
 ('00000000-0000-4000-8000-00000000b201','00000000-0000-4000-8000-00000000b001','TenantB','instagram','qualified','open','2026-11-02T10:00:00Z',9999,'INR');

INSERT INTO public.lead_stage_history (lead_id,from_stage,to_stage,changed_at) VALUES
 ('00000000-0000-4000-8000-00000000a201',null,'new','2026-11-02T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a201','new','qualified','2026-11-05T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a202',null,'new','2026-11-03T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a202','new','qualified','2026-11-12T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a203',null,'new','2026-11-04T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a203','new','qualified','2026-11-06T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a203','qualified','payment_pending','2026-11-08T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a204',null,'new','2026-11-04T11:00:00Z'),
 ('00000000-0000-4000-8000-00000000a204','new','lost','2026-11-07T11:00:00Z'),
 ('00000000-0000-4000-8000-00000000a205',null,'engaged','2026-11-05T10:00:00Z'),
 ('00000000-0000-4000-8000-00000000a206',null,'new','2026-11-05T11:00:00Z'),
 ('00000000-0000-4000-8000-00000000a207',null,'nurture','2026-11-05T12:00:00Z'),
 ('00000000-0000-4000-8000-00000000b201',null,'qualified','2026-11-02T10:00:00Z');

-- The anonymous role must have no EXECUTE grants on any dashboard RPC.
SET LOCAL ROLE anon;
DO $negative$
DECLARE
  i integer;
  denied boolean;
  a uuid := '00000000-0000-4000-8000-00000000a001';
BEGIN
  FOR i IN 1..3 LOOP
    denied := false;
    BEGIN
      IF i=1 THEN PERFORM public.get_dashboard_snapshot(a);
      ELSIF i=2 THEN PERFORM public.get_home_v1_qualification_snapshot(
        a,'2026-11-01T00:00:00Z','2026-11-10T00:00:00Z');
      ELSE PERFORM public.get_home_v1_pipeline_snapshot(a);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'Home V1 anonymous RPC % unexpectedly executable',i;
    END IF;
  END LOOP;
END $negative$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a101',true);
SELECT set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a101","aud":"authenticated","session_id":"00000000-0000-4000-8000-00000000a901"}',true);

-- Owner is a legitimate member but must not read before tenant binding.
DO $auth_diagnostic$
DECLARE
  a uuid := '00000000-0000-4000-8000-00000000a001';
BEGIN
  RAISE NOTICE 'Home test diagnostics: auth.role=%, auth.uid=%, bound_org=%, session_enforced=%, has_role=%, bound_to_org=%',
    auth.role(), auth.uid(), public.current_tenant_organization_id(),
    public.tenant_session_enforcement_enabled(),
    public.has_organization_role(a, array['owner','admin','manager']::text[]),
    public.session_is_bound_to_organization(a);
END $auth_diagnostic$;
DO $unbound$
DECLARE
  i integer;
  denied boolean;
  a uuid := '00000000-0000-4000-8000-00000000a001';
BEGIN
  FOR i IN 1..3 LOOP
    denied := false;
    BEGIN
      IF i=1 THEN PERFORM public.get_dashboard_snapshot(a);
      ELSIF i=2 THEN PERFORM public.get_home_v1_qualification_snapshot(
        a,'2026-11-01T00:00:00Z','2026-11-10T00:00:00Z');
      ELSE PERFORM public.get_home_v1_pipeline_snapshot(a);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'Home V1 unbound owner RPC % not denied',i;
    END IF;
  END LOOP;
END $unbound$;

DO $owner$
DECLARE
  a uuid := '00000000-0000-4000-8000-00000000a001';
  b uuid := '00000000-0000-4000-8000-00000000b001';
  qualification jsonb;
  pipeline jsonb;
  snapshot jsonb;
  source_instagram jsonb;
  source_google jsonb;
  i integer;
  denied boolean;
BEGIN
  PERFORM public.bind_current_tenant_session(a);
  IF public.current_tenant_organization_id() IS DISTINCT FROM a THEN
    RAISE EXCEPTION 'Home V1 owner did not bind to A';
  END IF;

  snapshot := public.get_dashboard_snapshot(a);
  IF snapshot IS NULL OR jsonb_typeof(snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Home V1 owner dashboard snapshot unavailable';
  END IF;

  qualification := public.get_home_v1_qualification_snapshot(
    a,'2026-11-01T00:00:00Z','2026-11-10T00:00:00Z');
  IF (qualification->>'cohort_leads')::integer IS DISTINCT FROM 7
    OR (qualification->>'qualified_leads')::integer IS DISTINCT FROM 2
    OR (qualification->>'history_covered')::integer IS DISTINCT FROM 7
    OR qualification->>'basis' <> 'reached_qualification_milestone_by_period_end'
  THEN
    RAISE EXCEPTION 'Home V1 historical cohort mismatch: %',qualification;
  END IF;

  SELECT source.value INTO source_instagram
    FROM jsonb_array_elements(qualification->'sources') source(value)
    WHERE source.value->>'source' = 'Instagram';
  SELECT source.value INTO source_google
    FROM jsonb_array_elements(qualification->'sources') source(value)
    WHERE source.value->>'source' = 'Google';
  IF (source_instagram->>'leads')::integer IS DISTINCT FROM 3
     OR (source_instagram->>'qualified')::integer IS DISTINCT FROM 2
     OR (source_google->>'leads')::integer IS DISTINCT FROM 2
     OR (source_google->>'qualified')::integer IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Home V1 source alias grouping or qualification mismatch: %',qualification;
  END IF;

  pipeline := public.get_home_v1_pipeline_snapshot(a);
  IF (pipeline->>'eligible_count')::integer IS DISTINCT FROM 5
     OR (pipeline->>'valued_count')::integer IS DISTINCT FROM 2
     OR (pipeline->>'missing_value_count')::integer IS DISTINCT FROM 2
     OR (pipeline->>'missing_currency_count')::integer IS DISTINCT FROM 1
     OR jsonb_array_length(pipeline->'currencies') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Home V1 pipeline coverage mismatch: %',pipeline;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(pipeline->'currencies') c(value)
    WHERE c.value->>'currency'='INR' AND (c.value->>'amount')::numeric=1250
  ) OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(pipeline->'currencies') c(value)
    WHERE c.value->>'currency'='USD' AND (c.value->>'amount')::numeric=500
  ) THEN
    RAISE EXCEPTION 'Home V1 must not sum INR and USD into one value';
  END IF;

  FOR i IN 1..3 LOOP
    denied := false;
    BEGIN
      IF i=1 THEN PERFORM public.get_dashboard_snapshot(b);
      ELSIF i=2 THEN PERFORM public.get_home_v1_qualification_snapshot(
        b,'2026-11-01T00:00:00Z','2026-11-10T00:00:00Z');
      ELSE PERFORM public.get_home_v1_pipeline_snapshot(b);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'Home V1 cross-tenant RPC % not denied',i;
    END IF;
  END LOOP;
END $owner$;

-- A manager can read only their bound organization.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a102',true);
SELECT set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a102","aud":"authenticated","session_id":"00000000-0000-4000-8000-00000000a902"}',true);
DO $manager$
DECLARE
 a uuid := '00000000-0000-4000-8000-00000000a001';
 r jsonb;
BEGIN
  PERFORM public.bind_current_tenant_session(a);
  r := public.get_home_v1_pipeline_snapshot(a);
  IF (r->>'eligible_count')::integer IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'Home V1 manager A denied/misread own organization';
  END IF;
END $manager$;

-- An admissions member may bind to the same tenant but cannot view executive RPCs.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a103',true);
SELECT set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a103","aud":"authenticated","session_id":"00000000-0000-4000-8000-00000000a903"}',true);
DO $admissions$
DECLARE
 a uuid := '00000000-0000-4000-8000-00000000a001';
 i integer;
 denied boolean;
BEGIN
  PERFORM public.bind_current_tenant_session(a);
  FOR i IN 1..3 LOOP
    denied := false;
    BEGIN
      IF i=1 THEN PERFORM public.get_dashboard_snapshot(a);
      ELSIF i=2 THEN PERFORM public.get_home_v1_qualification_snapshot(
        a,'2026-11-01T00:00:00Z','2026-11-10T00:00:00Z');
      ELSE PERFORM public.get_home_v1_pipeline_snapshot(a);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'Home V1 admissions role saw privileged RPC %',i;
    END IF;
  END LOOP;
END $admissions$;

-- An admin B reads only their own tenant. No tenant-A values should leak.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000b101',true);
SELECT set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b101","aud":"authenticated","session_id":"00000000-0000-4000-8000-00000000b901"}',true);
DO $admin$
DECLARE
 a uuid := '00000000-0000-4000-8000-00000000a001';
 b uuid := '00000000-0000-4000-8000-00000000b001';
 r jsonb;
 denied boolean := false;
BEGIN
  PERFORM public.bind_current_tenant_session(b);
  r := public.get_home_v1_pipeline_snapshot(b);
  IF (r->>'eligible_count')::integer IS DISTINCT FROM 1
     OR (r->>'valued_count')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Home V1 admin B own-tenant pipeline wrong';
  END IF;
  BEGIN
    PERFORM public.get_home_v1_pipeline_snapshot(a);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Home V1 admin B read tenant A';
  END IF;
END $admin$;

-- Revocation must take effect for an already bound session.
RESET ROLE;
UPDATE public.organization_members SET active=false
WHERE organization_id='00000000-0000-4000-8000-00000000a001'
 AND user_id='00000000-0000-4000-8000-00000000a101';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a101',true);
SELECT set_config('request.jwt.claims',
 '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a101","aud":"authenticated","session_id":"00000000-0000-4000-8000-00000000a901"}',true);
DO $revoked$
DECLARE
 denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_home_v1_pipeline_snapshot('00000000-0000-4000-8000-00000000a001');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Home V1 revoked owner still read pipeline';
  END IF;
END $revoked$;

ROLLBACK;
\echo 'Home V1: local 3-RPC access matrix and milestone/pipeline data PASSED'
