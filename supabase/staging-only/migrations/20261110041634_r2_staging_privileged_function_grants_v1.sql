-- R2 review-only proposal: staged function access hardening, with explicit human-only approval policy.
-- No migration runner should execute this docs/sql file automatically.
-- Source: production/staging pg_catalog READ comparison on 2026-11-09.
-- All 22 signatures exist in both, are postgres-owned SECURITY DEFINER functions;
-- Production anon EXECUTE=FALSE for all, authenticated TRUE only for
-- attach_whatsapp_outbound_message_id, service_role TRUE for all.
-- One additional service-only WhatsApp retry function loses authenticated EXECUTE;
-- Sales Asset approval is intentionally HUMAN-ONLY per checked-in 20261103195300 guard.
-- Production is missing that migration and its broader service_role grant is NOT copied.
-- Three additional SECURITY INVOKER wrappers lose PUBLIC/anon EXECUTE, preserving authenticated/service access.
-- The 4 search_path changes mirror existing production function_config.
-- Stage-only proposal. Sales Asset preflight denies service_role and validates human guard.
-- Do not run against Production or claim universal function-body parity.
-- Preflight checks the function identity; transactional postflight checks ACL parity.
-- Requires independent review, approved versioned migration and staging-only apply.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $r2_preflight$
DECLARE v_count integer;
BEGIN
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname in (
    'attach_whatsapp_outbound_message_id',
    'auto_disarm_whatsapp_provider_pilot_v1',
    'can_manage_lead_assignments',
    'enforce_admissions_auto_task_event_org',
    'enforce_automation_tenant_alignment_v1',
    'enforce_task_organization',
    'evaluate_identity_for_lead_v1',
    'finalize_course_catalog_sync',
    'guard_organization_site_alias_claim_v1',
    'guard_organization_site_primary_claim_v1',
    'ingest_tracking_event_v1',
    'reconcile_whatsapp_canonical_message_approval_v1',
    'release_physical_room_with_accommodation',
    'resolve_whatsapp_channel_policy_v3',
    'run_admissions_auto_tasks',
    'search_enqueue_row_trigger_v1',
    'search_privacy_tombstone_trigger_v1',
    'set_course_batch_admin_event_organization',
    'sync_batch_changes_to_leads',
    'sync_lead_from_preferred_batch',
    'update_crm_pipeline_aging_rule',
    'update_crm_stage_probability'
  )
    AND p.prosecdef
    AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  IF v_count <> 22 THEN
    RAISE EXCEPTION 'BLOCKED_R2_FUNCTION_CATALOG_OR_SERVICE_ROLE_MISMATCH';
  END IF;
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('log_new_lead_stage','normalize_event_intelligence_url_v1','privacy_purpose_for_event_v1','set_updated_at')
    AND NOT p.prosecdef;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'BLOCKED_R2_SEARCH_PATH_FUNCTION_CONTRACT_MISMATCH';
  END IF;

  -- Three ordinary (SECURITY INVOKER) compatibility wrappers also inherited
  -- PUBLIC EXECUTE in staging, whereas Production denies anon on all three.
  -- Preserve the existing authenticated and service_role callable contracts.
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('get_pipeline_snapshot','get_reengaged_workspace_v2','get_tracking_workspace')
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
    AND NOT p.prosecdef
    AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PUBLIC_INVOKER_FUNCTION_CONTRACT_MISMATCH';
  END IF;
  -- Separately verified matched definer-role drift outside the 22 anon findings.
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='prepare_failed_whatsapp_provider_retry_v1'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)
      ='p_organization_id uuid, p_failed_audit_id uuid, p_now timestamp with time zone'
    AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_R2_EXTRA_AUTHENTICATED_FUNCTION_CONTRACT_MISMATCH';
  END IF;
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='approve_sales_asset_v1'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)
      ='p_organization_id uuid, p_asset_id uuid, p_auto_send_allowed boolean'
    AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    AND position('auth.role() <> ''authenticated''' in pg_catalog.pg_get_functiondef(p.oid))>0
    AND position('v_actor is null' in pg_catalog.pg_get_functiondef(p.oid))>0
    AND position('not public.can_manage_organization(p_organization_id)' in pg_catalog.pg_get_functiondef(p.oid))>0;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_PREFLIGHT_FAILED';
  END IF;
END;
$r2_preflight$;

-- Revoke inherited PUBLIC + direct anon access to 22 privileged functions.
-- Revoke authenticated on the 21 service-only/trigger functions. The remaining
-- function retains its explicit authenticated grant, as in Production.
-- attach_whatsapp_outbound_message_id(p_lead_id uuid, p_conversation_id uuid, p_body text, p_external_message_id text)
REVOKE EXECUTE ON FUNCTION public.attach_whatsapp_outbound_message_id(p_lead_id uuid, p_conversation_id uuid, p_body text, p_external_message_id text) FROM PUBLIC, anon;

-- auto_disarm_whatsapp_provider_pilot_v1()
REVOKE EXECUTE ON FUNCTION public.auto_disarm_whatsapp_provider_pilot_v1() FROM PUBLIC, anon, authenticated;

-- can_manage_lead_assignments()
REVOKE EXECUTE ON FUNCTION public.can_manage_lead_assignments() FROM PUBLIC, anon, authenticated;

-- enforce_admissions_auto_task_event_org()
REVOKE EXECUTE ON FUNCTION public.enforce_admissions_auto_task_event_org() FROM PUBLIC, anon, authenticated;

-- enforce_automation_tenant_alignment_v1()
REVOKE EXECUTE ON FUNCTION public.enforce_automation_tenant_alignment_v1() FROM PUBLIC, anon, authenticated;

-- enforce_task_organization()
REVOKE EXECUTE ON FUNCTION public.enforce_task_organization() FROM PUBLIC, anon, authenticated;

-- evaluate_identity_for_lead_v1(p_lead_id uuid, p_source_system text)
REVOKE EXECUTE ON FUNCTION public.evaluate_identity_for_lead_v1(p_lead_id uuid, p_source_system text) FROM PUBLIC, anon, authenticated;

-- finalize_course_catalog_sync(p_run_id uuid, p_source_system text, p_organization_id uuid)
REVOKE EXECUTE ON FUNCTION public.finalize_course_catalog_sync(p_run_id uuid, p_source_system text, p_organization_id uuid) FROM PUBLIC, anon, authenticated;

-- guard_organization_site_alias_claim_v1()
REVOKE EXECUTE ON FUNCTION public.guard_organization_site_alias_claim_v1() FROM PUBLIC, anon, authenticated;

-- guard_organization_site_primary_claim_v1()
REVOKE EXECUTE ON FUNCTION public.guard_organization_site_primary_claim_v1() FROM PUBLIC, anon, authenticated;

-- ingest_tracking_event_v1(p_organization_id uuid, p_tracking_source_id uuid, p_source_event_id text, p_event_name text, p_ingestion_method text, p_occurred_at timestamp with time zone, p_anonymous_visitor_id text, p_session_key text, p_external_message_id text, p_site text, p_payload jsonb, p_context jsonb, p_metadata jsonb, p_schema_version integer, p_is_browser boolean)
REVOKE EXECUTE ON FUNCTION public.ingest_tracking_event_v1(p_organization_id uuid, p_tracking_source_id uuid, p_source_event_id text, p_event_name text, p_ingestion_method text, p_occurred_at timestamp with time zone, p_anonymous_visitor_id text, p_session_key text, p_external_message_id text, p_site text, p_payload jsonb, p_context jsonb, p_metadata jsonb, p_schema_version integer, p_is_browser boolean) FROM PUBLIC, anon, authenticated;

-- reconcile_whatsapp_canonical_message_approval_v1()
REVOKE EXECUTE ON FUNCTION public.reconcile_whatsapp_canonical_message_approval_v1() FROM PUBLIC, anon, authenticated;

-- release_physical_room_with_accommodation()
REVOKE EXECUTE ON FUNCTION public.release_physical_room_with_accommodation() FROM PUBLIC, anon, authenticated;

-- resolve_whatsapp_channel_policy_v3(p_organization_id uuid, p_lead_id uuid, p_workflow_id uuid, p_template_name text, p_template_language text, p_whatsapp_account_id uuid, p_approval_request_id uuid, p_now timestamp with time zone)
REVOKE EXECUTE ON FUNCTION public.resolve_whatsapp_channel_policy_v3(p_organization_id uuid, p_lead_id uuid, p_workflow_id uuid, p_template_name text, p_template_language text, p_whatsapp_account_id uuid, p_approval_request_id uuid, p_now timestamp with time zone) FROM PUBLIC, anon, authenticated;

-- run_admissions_auto_tasks(p_organization_id uuid, p_dry_run boolean)
REVOKE EXECUTE ON FUNCTION public.run_admissions_auto_tasks(p_organization_id uuid, p_dry_run boolean) FROM PUBLIC, anon, authenticated;

-- search_enqueue_row_trigger_v1()
REVOKE EXECUTE ON FUNCTION public.search_enqueue_row_trigger_v1() FROM PUBLIC, anon, authenticated;

-- search_privacy_tombstone_trigger_v1()
REVOKE EXECUTE ON FUNCTION public.search_privacy_tombstone_trigger_v1() FROM PUBLIC, anon, authenticated;

-- set_course_batch_admin_event_organization()
REVOKE EXECUTE ON FUNCTION public.set_course_batch_admin_event_organization() FROM PUBLIC, anon, authenticated;

-- sync_batch_changes_to_leads()
REVOKE EXECUTE ON FUNCTION public.sync_batch_changes_to_leads() FROM PUBLIC, anon, authenticated;

-- sync_lead_from_preferred_batch()
REVOKE EXECUTE ON FUNCTION public.sync_lead_from_preferred_batch() FROM PUBLIC, anon, authenticated;

-- update_crm_pipeline_aging_rule(p_stage text, p_warning_hours numeric, p_stuck_hours numeric)
REVOKE EXECUTE ON FUNCTION public.update_crm_pipeline_aging_rule(p_stage text, p_warning_hours numeric, p_stuck_hours numeric) FROM PUBLIC, anon, authenticated;

-- update_crm_stage_probability(p_stage text, p_probability numeric)
REVOKE EXECUTE ON FUNCTION public.update_crm_stage_probability(p_stage text, p_probability numeric) FROM PUBLIC, anon, authenticated;

-- Exactly one additional authenticated permission difference corrected.
-- Sales Asset approval deliberately remains human-admin-only, NOT production role parity.
-- Production currently lacks the committed sales_asset_human_approval_guard_v1 migration.
REVOKE EXECUTE ON FUNCTION public.prepare_failed_whatsapp_provider_retry_v1(p_organization_id uuid, p_failed_audit_id uuid, p_now timestamp with time zone) FROM authenticated;


-- Three SECURITY INVOKER compatibility wrappers: Production denies all anonymous
-- function EXECUTE (including invokers). Authenticated/service_role stay allowed.
REVOKE EXECUTE ON FUNCTION public.get_pipeline_snapshot() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_reengaged_workspace_v2() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_tracking_workspace() FROM PUBLIC, anon;

-- Four INVOKER functions: mirror the pre-existing production search_path.
ALTER FUNCTION public.log_new_lead_stage() SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_event_intelligence_url_v1(p_value text) SET search_path = public, pg_temp;
ALTER FUNCTION public.privacy_purpose_for_event_v1(p_event_name text) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;

DO $r2_postflight$
DECLARE v_count integer;
BEGIN
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname in (
    'attach_whatsapp_outbound_message_id',
    'auto_disarm_whatsapp_provider_pilot_v1',
    'can_manage_lead_assignments',
    'enforce_admissions_auto_task_event_org',
    'enforce_automation_tenant_alignment_v1',
    'enforce_task_organization',
    'evaluate_identity_for_lead_v1',
    'finalize_course_catalog_sync',
    'guard_organization_site_alias_claim_v1',
    'guard_organization_site_primary_claim_v1',
    'ingest_tracking_event_v1',
    'reconcile_whatsapp_canonical_message_approval_v1',
    'release_physical_room_with_accommodation',
    'resolve_whatsapp_channel_policy_v3',
    'run_admissions_auto_tasks',
    'search_enqueue_row_trigger_v1',
    'search_privacy_tombstone_trigger_v1',
    'set_course_batch_admin_event_organization',
    'sync_batch_changes_to_leads',
    'sync_lead_from_preferred_batch',
    'update_crm_pipeline_aging_rule',
    'update_crm_stage_probability'
  )
    AND p.prosecdef
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')=(p.proname='attach_whatsapp_outbound_message_id');
  IF v_count <> 22 THEN
    RAISE EXCEPTION 'BLOCKED_R2_POSTINSTALL_FUNCTION_GRANTS_PARITY_FAILED';
  END IF;
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('log_new_lead_stage','normalize_event_intelligence_url_v1','privacy_purpose_for_event_v1','set_updated_at')
    AND p.proconfig @> ARRAY['search_path=public, pg_temp']::text[];
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'BLOCKED_R2_POSTINSTALL_SEARCH_PATH_PARITY_FAILED';
  END IF;

  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('get_pipeline_snapshot','get_reengaged_workspace_v2','get_tracking_workspace')
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
    AND NOT p.prosecdef
    AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PUBLIC_INVOKER_POSTFLIGHT_FAILED';
  END IF;
  -- Exact postcondition for the extra authenticated and service-role divergence.
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='prepare_failed_whatsapp_provider_retry_v1'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)
      ='p_organization_id uuid, p_failed_audit_id uuid, p_now timestamp with time zone'
    AND p.prosecdef
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_R2_EXTRA_AUTHENTICATED_POSTFLIGHT_FAILED';
  END IF;
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='approve_sales_asset_v1'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)
      ='p_organization_id uuid, p_asset_id uuid, p_auto_send_allowed boolean'
    AND p.prosecdef
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    AND position('auth.role() <> ''authenticated''' in pg_catalog.pg_get_functiondef(p.oid))>0
    AND position('v_actor is null' in pg_catalog.pg_get_functiondef(p.oid))>0
    AND position('not public.can_manage_organization(p_organization_id)' in pg_catalog.pg_get_functiondef(p.oid))>0;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_POSTFLIGHT_FAILED';
  END IF;
END;
$r2_postflight$;
COMMIT;
