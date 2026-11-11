-- R2 post-install public schema function exposure gate, SELECT-ONLY.
-- Zero anonymous-callable public functions is existing Production parity.
-- This extends #675 (which counts only SECURITY DEFINER functions).
-- No customer data, function invocation, grants, changes or release approval.
WITH all_public_functions AS (
  SELECT p.oid,p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
    p.prosecdef,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
),
overall AS (
  SELECT count(*)::integer AS total_public_functions,
    count(*) FILTER (WHERE anon_execute)::integer AS anon_callable_functions,
    count(*) FILTER (WHERE anon_execute AND prosecdef)::integer AS anon_callable_definers,
    count(*) FILTER (WHERE anon_execute AND NOT prosecdef)::integer AS anon_callable_invokers
  FROM all_public_functions
),
expected_invokers(name) AS (
  VALUES ('get_pipeline_snapshot'),
    ('get_reengaged_workspace_v2'),
    ('get_tracking_workspace')
),
expected AS (
  SELECT e.name,p.oid,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
    p.prosecdef,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    CASE WHEN p.oid IS NULL THEN NULL
      ELSE pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute,
    CASE WHEN p.oid IS NULL THEN NULL
      ELSE pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute,
    CASE WHEN p.oid IS NULL THEN NULL
      ELSE pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') END AS service_execute
  FROM expected_invokers e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name
),
invoker_checks AS (
  SELECT count(*)::integer AS expected_invokers,
    count(*) FILTER (WHERE oid IS NOT NULL AND args=''
      AND NOT prosecdef AND owner='postgres'
      AND authenticated_execute AND service_execute)::integer AS structurally_valid_invokers,
    count(*) FILTER (WHERE anon_execute IS TRUE)::integer AS anon_executable_expected_invokers
  FROM expected
)
SELECT jsonb_build_object(
  'status',CASE WHEN o.anon_callable_functions=0
      AND i.expected_invokers=3
      AND i.structurally_valid_invokers=3
      AND i.anon_executable_expected_invokers=0
    THEN 'PUBLIC_FUNCTION_EXECUTE_CATALOG_PASS_NOT_E2E'
    ELSE 'PUBLIC_FUNCTION_EXECUTE_REVIEW_REQUIRED'
    END,
  'total_public_functions',o.total_public_functions,
  'anon_callable_functions',o.anon_callable_functions,
  'anon_callable_definers',o.anon_callable_definers,
  'anon_callable_invokers',o.anon_callable_invokers,
  'expected_invoker_functions',i.expected_invokers,
  'structurally_valid_expected_invokers',i.structurally_valid_invokers,
  'anon_executable_expected_invokers',i.anon_executable_expected_invokers,
  'tenant_e2e_verified',false,
  'authorized_to_release',false
) AS public_function_execute_gate
FROM overall o CROSS JOIN invoker_checks i;