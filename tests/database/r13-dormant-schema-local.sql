-- Disposable CI only. Assert no commercial activation after legacy regression fixtures.
\set ON_ERROR_STOP on
DO $check$
BEGIN
  IF public.signup_trial_available_v1()
    OR EXISTS (SELECT 1 FROM public.signup_trial_policy)
    OR EXISTS (SELECT 1 FROM public.signup_registration_intents)
    OR EXISTS (SELECT 1 FROM public.signup_usage_counters)
    OR EXISTS (SELECT 1 FROM public.saas_organization_subscriptions)
    OR EXISTS (SELECT 1 FROM saas_governance.operators)
    OR EXISTS (SELECT 1 FROM saas_governance.published_plan_versions)
    OR EXISTS (SELECT 1 FROM saas_governance.manual_subscription_contracts)
  THEN RAISE EXCEPTION 'Dormant commercial schema unexpectedly activated or seeded'; END IF;
END
$check$;
\echo 'R13 dormant schema: legacy fixtures rerun and no commercial activation verified'
