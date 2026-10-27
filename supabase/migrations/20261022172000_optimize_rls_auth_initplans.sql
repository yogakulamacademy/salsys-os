-- Performance optimization: make auth/current_setting lookups in selected RLS policies
-- eligible for PostgreSQL init-plan evaluation instead of per-row re-evaluation.
--
-- This migration is intentionally semantics-preserving:
--   * policy names, commands, roles and permissive/restrictive mode are unchanged
--   * only USING / WITH CHECK expressions are rewritten
--   * only policies currently flagged by Supabase's auth_rls_initplan advisor are targeted

DO $optimize_rls$
DECLARE
  r record;
  v_qual text;
  v_check text;
  v_sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = ANY (ARRAY[
        'lead_objection_signals_insert_v1',
        'workspace_memberships_self_or_admin_read',
        'Users can update own inbox state',
        'leads_update',
        'activities_insert',
        'course_batch_admin_events_insert',
        'Users can read own inbox state',
        'Users can create own inbox state',
        'privacy_processing_purposes_member_read',
        'privacy_consent_receipts_member_read',
        'privacy_preferences_member_read',
        'privacy_data_subject_requests_member_read',
        'privacy_retention_policies_member_read',
        'privacy_legal_holds_member_read',
        'privacy_subject_restrictions_member_read',
        'privacy_automation_settings_member_read',
        'privacy_retention_actions_member_read',
        'privacy_verification_challenges_member_read',
        'privacy_export_runs_member_read',
        'privacy_erasure_jobs_member_read',
        'privacy_erasure_plan_items_member_read',
        'privacy_search_tombstones_member_read',
        'search_index_settings_member_read',
        'search_index_outbox_member_read',
        'system_intelligence_recommendations_insert',
        'system_intelligence_recommendations_update',
        'system_intelligence_recommendation_events_insert'
      ]::text[])
  LOOP
    v_qual := r.qual;
    v_check := r.with_check;

    IF v_qual IS NOT NULL THEN
      v_qual := replace(v_qual, 'auth.uid()', '(select auth.uid())');
      v_qual := replace(v_qual, 'auth.role()', '(select auth.role())');
      v_qual := replace(v_qual, 'auth.jwt()', '(select auth.jwt())');
      v_qual := regexp_replace(
        v_qual,
        'current_setting\(([^()]*)\)',
        '(select current_setting(\1))',
        'g'
      );
    END IF;

    IF v_check IS NOT NULL THEN
      v_check := replace(v_check, 'auth.uid()', '(select auth.uid())');
      v_check := replace(v_check, 'auth.role()', '(select auth.role())');
      v_check := replace(v_check, 'auth.jwt()', '(select auth.jwt())');
      v_check := regexp_replace(
        v_check,
        'current_setting\(([^()]*)\)',
        '(select current_setting(\1))',
        'g'
      );
    END IF;

    -- ALTER POLICY preserves the original command, target roles and permissive mode.
    -- Add only the clauses that existed on the policy before this migration.
    v_sql := format(
      'ALTER POLICY %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );

    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;

    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
  END LOOP;
END
$optimize_rls$;
