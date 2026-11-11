-- R13-P0 full commercial foundation smoke test.
-- Runs only in GitHub's disposable LOCAL Supabase migration replay.
-- Synthetic rows are rolled back; NEVER run against production.
\set ON_ERROR_STOP on
\echo 'R13-P0: local commercial state + privilege + audit assertions'
BEGIN;
DO $r13_precheck$
DECLARE
  seeded bigint;
  public_access boolean;
  rls_count int;
BEGIN
  SELECT (SELECT count(*) FROM public.saas_plans)
       + (SELECT count(*) FROM public.saas_plan_entitlements)
       + (SELECT count(*) FROM public.saas_organization_subscriptions)
       + (SELECT count(*) FROM public.saas_subscription_events)
  INTO seeded;
  IF seeded <> 0 THEN
    RAISE EXCEPTION 'R13-P0: migration must not auto-seed commercial rows';
  END IF;
  SELECT count(*) INTO rls_count FROM pg_class
  WHERE oid IN (
    'public.saas_plans'::regclass,
    'public.saas_plan_entitlements'::regclass,
    'public.saas_organization_subscriptions'::regclass,
    'public.saas_subscription_events'::regclass
  ) AND relrowsecurity = true;
  IF rls_count<>4 THEN
    RAISE EXCEPTION 'R13-P0: all commercial tables require RLS';
  END IF;
  public_access :=
    has_table_privilege('anon','public.saas_plans','SELECT')
    OR has_table_privilege('authenticated','public.saas_plans','SELECT')
    OR has_table_privilege('anon','public.saas_organization_subscriptions','SELECT')
    OR has_table_privilege('authenticated','public.saas_organization_subscriptions','SELECT')
    OR has_table_privilege('anon','public.saas_subscription_events','INSERT')
    OR has_table_privilege('authenticated','public.saas_subscription_events','INSERT')
    OR has_table_privilege('authenticated','public.saas_commercial_readiness_v1','SELECT');
  IF public_access THEN
    RAISE EXCEPTION 'R13-P0: commercial state unexpectedly client-readable/writable';
  END IF;

  -- Exhaustive relation/role/command matrix: checks all four tables, not only
  -- a sampled SELECT or INSERT. TRUNCATE and REFERENCES are outside RLS.
  SELECT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public.saas_plans'::regclass),
        ('public.saas_plan_entitlements'::regclass),
        ('public.saas_organization_subscriptions'::regclass),
        ('public.saas_subscription_events'::regclass)
    ) AS commercial_tables(relation_oid)
    CROSS JOIN (
      VALUES ('anon'::text), ('authenticated'::text)
    ) AS client_roles(role_name)
    CROSS JOIN (
      VALUES ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text),
             ('DELETE'::text), ('TRUNCATE'::text), ('REFERENCES'::text),
             ('TRIGGER'::text)
    ) AS operations(privilege_name)
    WHERE has_table_privilege(
      client_roles.role_name,
      commercial_tables.relation_oid,
      operations.privilege_name
    )
  ) INTO public_access;
  IF public_access THEN
    RAISE EXCEPTION 'R13-P0: a client role can access at least one commercial table';
  END IF;

  -- No client-facing readiness view or direct EXECUTE on internal functions.
  IF has_table_privilege('anon','public.saas_commercial_readiness_v1','SELECT')
     OR has_table_privilege('authenticated','public.saas_commercial_readiness_v1','SELECT')
     OR has_function_privilege('anon','public.saas_subscription_audit_v1()','EXECUTE')
     OR has_function_privilege('authenticated','public.saas_subscription_audit_v1()','EXECUTE')
     OR has_function_privilege('anon','public.saas_subscription_event_immutable_v1()','EXECUTE')
     OR has_function_privilege('authenticated','public.saas_subscription_event_immutable_v1()','EXECUTE')
  THEN
    RAISE EXCEPTION 'R13-P0: readiness view or internal trigger function exposed';
  END IF;
  IF NOT has_table_privilege('service_role','public.saas_plans','SELECT')
     OR NOT has_table_privilege('service_role','public.saas_commercial_readiness_v1','SELECT') THEN
    RAISE EXCEPTION 'R13-P0: service-role operator diagnostic privileges missing';
  END IF;
END
$r13_precheck$;

INSERT INTO public.organizations(id,name,slug,status) VALUES
 ('00000000-0000-4000-8000-00000000c131'::uuid,
  'R13 Local A','r13-local-commercial-a','active'),
 ('00000000-0000-4000-8000-00000000c132'::uuid,
  'R13 Local B','r13-local-commercial-b','active');

DO $r13_fixture$
DECLARE
  org_a uuid := '00000000-0000-4000-8000-00000000c131';
  org_b uuid := '00000000-0000-4000-8000-00000000c132';
  p uuid;
  sub uuid;
  out_status text;
  drift text[];
  n int;
  denied boolean;
  original_org_status text;
BEGIN
  SELECT readiness INTO out_status
  FROM public.saas_commercial_readiness_v1
  WHERE organization_id=org_a;
  IF out_status IS DISTINCT FROM 'unmanaged_legacy' THEN
    RAISE EXCEPTION 'R13-P0: unsubscribed org is not unmanaged_legacy';
  END IF;

  INSERT INTO public.saas_plans(code,display_name,status)
  VALUES ('r13_fixture','Synthetic R13 plan','inactive')
  RETURNING id INTO p;

  -- Ensure commercial entitlement FKs point to the actual R11 catalog.
  IF NOT EXISTS (SELECT 1 FROM public.capability_catalog WHERE code='education_core') THEN
    RAISE EXCEPTION 'R13-P0: expected R11 education_core capability is missing';
  END IF;
  INSERT INTO public.saas_plan_entitlements(plan_id,capability_code,allowed)
  VALUES (p,'education_core',true);
  INSERT INTO public.saas_organization_subscriptions(
    organization_id,plan_id,status,source
  ) VALUES (org_a,p,'active','manual')
  RETURNING id INTO sub;

  -- One real INSERT transaction writes exactly one immutable event.
  SELECT count(*) INTO n FROM public.saas_subscription_events
  WHERE organization_id=org_a AND subscription_id=sub
    AND event_type='subscription_created' AND previous_status IS NULL
    AND new_status='active';
  IF n<>1 THEN RAISE EXCEPTION 'R13-P0: creation audit missing'; END IF;

  SELECT readiness,entitled_but_disabled INTO out_status,drift
  FROM public.saas_commercial_readiness_v1
  WHERE organization_id=org_a;
  IF out_status IS DISTINCT FROM 'managed_attention'
     OR drift IS DISTINCT FROM ARRAY['education_core']::text[] THEN
    RAISE EXCEPTION 'R13-P0: entitled/disabled capability drift not visible';
  END IF;

  -- Commercial plan changes are diagnostics only; never change R11 runtime.
  UPDATE public.saas_plan_entitlements SET allowed=false WHERE plan_id=p;
  SELECT readiness INTO out_status
  FROM public.saas_commercial_readiness_v1 WHERE organization_id=org_a;
  IF out_status IS DISTINCT FROM 'managed_healthy' THEN
    RAISE EXCEPTION 'R13-P0: entitlement diagnostic did not update';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_capabilities
    WHERE organization_id=org_a
  ) THEN
    RAISE EXCEPTION 'R13-P0: new commercial state changed runtime capabilities';
  END IF;

  -- past_due is COMMERCIAL attention, never implicit organization suspension.
  UPDATE public.saas_organization_subscriptions
  SET status='past_due' WHERE id=sub;
  SELECT readiness INTO out_status
  FROM public.saas_commercial_readiness_v1 WHERE organization_id=org_a;
  IF out_status IS DISTINCT FROM 'managed_attention' THEN
    RAISE EXCEPTION 'R13-P0: past_due not reported as attention';
  END IF;
  SELECT status INTO original_org_status
  FROM public.organizations WHERE id=org_a;
  IF original_org_status <> 'active' THEN
    RAISE EXCEPTION 'R13-P0: commercial status suspended organization';
  END IF;
  SELECT count(*) INTO n FROM public.saas_subscription_events
    WHERE subscription_id=sub AND event_type='subscription_status_changed'
      AND previous_status='active' AND new_status='past_due';
  IF n<>1 THEN
    RAISE EXCEPTION 'R13-P0: status transition not audited';
  END IF;

  -- At most one commercial subscription per tenant (including canceled).
  denied := false;
  BEGIN
    INSERT INTO public.saas_organization_subscriptions(organization_id,plan_id,status)
    VALUES (org_a,p,'trialing');
  EXCEPTION WHEN unique_violation THEN
    denied:=true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R13-P0: accepted second canonical tenant subscription';
  END IF;

  -- Events cannot reference a subscription from a different organization.
  denied:=false;
  BEGIN
    INSERT INTO public.saas_subscription_events(
      organization_id,subscription_id,event_type,source
    ) VALUES (org_b,sub,'cross_tenant_attempt','manual');
  EXCEPTION WHEN foreign_key_violation THEN
    denied:=true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R13-P0: cross-tenant event accepted';
  END IF;

  -- Even the privileged fixture cannot silently rewrite/delete/clear history.
  denied:=false;
  BEGIN
    UPDATE public.saas_subscription_events
    SET event_type='tampered' WHERE subscription_id=sub;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    denied:=true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R13-P0: subscription event could be modified';
  END IF;

  denied:=false;
  BEGIN
    DELETE FROM public.saas_subscription_events WHERE subscription_id=sub;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    denied:=true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R13-P0: subscription event could be deleted';
  END IF;

  denied:=false;
  BEGIN
    EXECUTE 'TRUNCATE public.saas_subscription_events';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    denied:=true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'R13-P0: subscription event could be truncated';
  END IF;

  -- No plan price, provider ref, invoice/payment, fake customer or trial row.
  SELECT count(*) INTO n FROM public.saas_subscription_events
  WHERE subscription_id=sub;
  IF n<>2 THEN
    RAISE EXCEPTION 'R13-P0: wrong event ledger count after failures';
  END IF;
END
$r13_fixture$;
ROLLBACK;
\echo 'R13-P0: actual local foundation, authorization, drift, and immutable-audit checks PASSED; ROLLBACK complete'
