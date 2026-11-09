-- R2-P3 independent post-remediation catalog verification (READ ONLY).
-- Derived from PR #682 reviewed, explicit function signatures and policy.
-- This is a narrow role-parity gate. It does NOT prove tenant isolation,
-- external consent, backup/restore or authorization to deploy/merge.
-- Safe for staging and production: catalog SELECT only, no customer data.
WITH expected_function(name, identity_args, anon_execute, authenticated_execute, service_execute) AS (
  VALUES
    ('attach_whatsapp_outbound_message_id', 'p_lead_id uuid, p_conversation_id uuid, p_body text, p_external_message_id text', false, true, true),
    ('auto_disarm_whatsapp_provider_pilot_v1', '', false, false, true),
    ('can_manage_lead_assignments', '', false, false, true),
    ('enforce_admissions_auto_task_event_org', '', false, false, true),
    ('enforce_automation_tenant_alignment_v1', '', false, false, true),
    ('enforce_task_organization', '', false, false, true),
    ('evaluate_identity_for_lead_v1', 'p_lead_id uuid, p_source_system text', false, false, true),
    ('finalize_course_catalog_sync', 'p_run_id uuid, p_source_system text, p_organization_id uuid', false, false, true),
    ('guard_organization_site_alias_claim_v1', '', false, false, true),
    ('guard_organization_site_primary_claim_v1', '', false, false, true),
    ('ingest_tracking_event_v1', 'p_organization_id uuid, p_tracking_source_id uuid, p_source_event_id text, p_event_name text, p_ingestion_method text, p_occurred_at timestamp with time zone, p_anonymous_visitor_id text, p_session_key text, p_external_message_id text, p_site text, p_payload jsonb, p_context jsonb, p_metadata jsonb, p_schema_version integer, p_is_browser boolean', false, false, true),
    ('reconcile_whatsapp_canonical_message_approval_v1', '', false, false, true),
    ('release_physical_room_with_accommodation', '', false, false, true),
    ('resolve_whatsapp_channel_policy_v3', 'p_organization_id uuid, p_lead_id uuid, p_workflow_id uuid, p_template_name text, p_template_language text, p_whatsapp_account_id uuid, p_approval_request_id uuid, p_now timestamp with time zone', false, false, true),
    ('run_admissions_auto_tasks', 'p_organization_id uuid, p_dry_run boolean', false, false, true),
    ('search_enqueue_row_trigger_v1', '', false, false, true),
    ('search_privacy_tombstone_trigger_v1', '', false, false, true),
    ('set_course_batch_admin_event_organization', '', false, false, true),
    ('sync_batch_changes_to_leads', '', false, false, true),
    ('sync_lead_from_preferred_batch', '', false, false, true),
    ('update_crm_pipeline_aging_rule', 'p_stage text, p_warning_hours numeric, p_stuck_hours numeric', false, false, true),
    ('update_crm_stage_probability', 'p_stage text, p_probability numeric', false, false, true),
    ('prepare_failed_whatsapp_provider_retry_v1', 'p_organization_id uuid, p_failed_audit_id uuid, p_now timestamp with time zone', false, false, true),
    ('approve_sales_asset_v1', 'p_organization_id uuid, p_asset_id uuid, p_auto_send_allowed boolean', false, true, true)
),
observed AS (
  SELECT e.*, p.oid, p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
    CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') END AS current_anon,
    CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') END AS current_authenticated,
    CASE WHEN p.oid IS NULL THEN NULL ELSE pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') END AS current_service
  FROM expected_function e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid
    AND p.proname=e.name
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)=e.identity_args
),
function_totals AS (
  SELECT count(*)::integer AS expected_functions,
    count(*) FILTER (WHERE oid IS NOT NULL AND prosecdef AND owner_name='postgres')::integer AS structurally_valid_functions,
    count(*) FILTER (WHERE oid IS NULL OR NOT coalesce(prosecdef,false) OR owner_name IS DISTINCT FROM 'postgres')::integer AS structural_mismatches,
    count(*) FILTER (WHERE oid IS NULL OR current_anon IS DISTINCT FROM anon_execute
      OR current_authenticated IS DISTINCT FROM authenticated_execute
      OR current_service IS DISTINCT FROM service_execute)::integer AS role_mismatched_functions,
    count(*) FILTER (WHERE oid IS NOT NULL AND current_anon IS DISTINCT FROM anon_execute)::integer AS anon_role_differences,
    count(*) FILTER (WHERE oid IS NOT NULL AND current_authenticated IS DISTINCT FROM authenticated_execute)::integer AS authenticated_role_differences,
    count(*) FILTER (WHERE oid IS NOT NULL AND current_service IS DISTINCT FROM service_execute)::integer AS service_role_differences
  FROM observed
),
expected_paths(name, identity_args, required_path) AS (
  VALUES
    ('log_new_lead_stage', '', 'search_path=public, pg_temp'),
    ('normalize_event_intelligence_url_v1', 'p_value text', 'search_path=public, pg_temp'),
    ('privacy_purpose_for_event_v1', 'p_event_name text', 'search_path=public, pg_temp'),
    ('set_updated_at', '', 'search_path=public, pg_temp')
),
path_totals AS (
  SELECT count(*)::integer AS expected_paths,
    count(*) FILTER (WHERE p.oid IS NOT NULL AND NOT p.prosecdef
      AND p.proconfig @> ARRAY[e.required_path]::text[])::integer AS valid_paths
  FROM expected_paths e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid
    AND p.proname=e.name
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)=e.identity_args
)
SELECT jsonb_build_object(
  'status',CASE WHEN f.expected_functions=24
      AND f.structural_mismatches=0
      AND f.role_mismatched_functions=0
      AND p.expected_paths=4
      AND p.valid_paths=4
    THEN 'FUNCTION_PARITY_CATALOG_PASS_NOT_TENANT_ACCEPTANCE'
    ELSE 'FUNCTION_PARITY_REVIEW_REQUIRED' END,
  'expected_functions',f.expected_functions,
  'structurally_valid_functions',f.structurally_valid_functions,
  'structural_mismatches',f.structural_mismatches,
  'role_mismatched_functions',f.role_mismatched_functions,
  'anon_role_differences',f.anon_role_differences,
  'authenticated_role_differences',f.authenticated_role_differences,
  'service_role_differences',f.service_role_differences,
  'expected_fixed_search_paths',p.expected_paths,
  'verified_fixed_search_paths',p.valid_paths,
  'scope','24 exact function signatures; 4 exact invoker search paths; catalog only',
  'tenant_acceptance_verified',false,
  'release_authorized',false
) AS r2_function_permission_gate
FROM function_totals f CROSS JOIN path_totals p;