-- R2 seven-table automation tenant guard (READ-ONLY catalog audit).
-- No tenant/customer rows; does not invoke the trigger or perform mutations.
WITH expected(tab) AS (
  VALUES ('automation_events'),('automation_runs'),
    ('automation_enrollments'),('automation_suppressions'),
    ('automation_scheduled_jobs'),('automation_variables'),
    ('automation_wait_states')
),
tables AS (
  SELECT e.tab,c.oid,
    coalesce(c.relrowsecurity,false) AS rls_enabled,
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='organization_id'
        AND a.attnum>0 AND NOT a.attisdropped) AS org_column,
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='lead_id'
        AND a.attnum>0 AND NOT a.attisdropped) AS lead_column,
    EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=c.oid
        AND t.tgfoid=pg_catalog.to_regprocedure('public.enforce_automation_tenant_alignment_v1()')
        AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
        AND (t.tgtype & 1)=1
        AND (t.tgtype & 2)=2
        AND (t.tgtype & 4)=4
        AND (t.tgtype & 16)=16) AS trigger_attached
  FROM expected e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
    AND c.relname=e.tab AND c.relkind IN ('r','p')
),
function_details AS (
  SELECT p.oid,
    p.prosecdef,
    pg_catalog.pg_get_userbyid(p.proowner)='postgres' AS correct_owner,
    p.proconfig @> ARRAY['search_path=public, auth, pg_temp']::text[] AS correct_path,
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_allowed,
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_allowed,
    pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AS service_allowed,
    position('v_new jsonb := to_jsonb(new)' in p.prosrc)>0 AS generic_row,
    position('v_lead_id := nullif(v_new->>''lead_id''' in p.prosrc)>0 AS lead_extraction,
    position('IF V_LEAD_ID IS NOT NULL THEN' in upper(p.prosrc))>0 AS lead_coverage,
    position('v_conversation_id := nullif(v_new->>''conversation_id''' in p.prosrc)>0 AS conversation_extraction,
    position('IF V_CONVERSATION_ID IS NOT NULL THEN' in upper(p.prosrc))>0 AS conversation_coverage,
    position('v_message_id := nullif(v_new->>''message_id''' in p.prosrc)>0 AS message_extraction,
    position('IF V_MESSAGE_ID IS NOT NULL THEN' in upper(p.prosrc))>0 AS message_coverage,
    (length(lower(p.prosrc))-length(replace(lower(p.prosrc), 'v_org is null or v_org <> new.organization_id', '')))
       / length('v_org is null or v_org <> new.organization_id') >= 3 AS three_tenant_mismatch_guards
  FROM pg_catalog.pg_proc p
  WHERE p.oid=pg_catalog.to_regprocedure('public.enforce_automation_tenant_alignment_v1()')
),
summary AS (
  SELECT count(*)::integer AS expected_tables,
    count(*) FILTER (WHERE oid IS NOT NULL)::integer AS present_tables,
    count(*) FILTER (WHERE rls_enabled AND org_column AND lead_column)::integer AS structural_tables,
    count(*) FILTER (WHERE trigger_attached)::integer AS attached_triggers
  FROM tables
)
SELECT jsonb_build_object(
  'status',
    CASE WHEN s.expected_tables=7 AND s.present_tables=7
       AND s.structural_tables=7 AND s.attached_triggers=7
       AND EXISTS (SELECT 1 FROM function_details f
         WHERE f.prosecdef AND f.correct_owner AND f.correct_path
           AND NOT f.anon_allowed AND NOT f.authenticated_allowed AND f.service_allowed
           AND f.generic_row AND f.lead_extraction AND f.lead_coverage
           AND f.conversation_extraction AND f.conversation_coverage
           AND f.message_extraction AND f.message_coverage AND f.three_tenant_mismatch_guards)
      THEN 'AUTOMATION_TENANT_GUARD_METADATA_PASS_NOT_E2E'
      ELSE 'AUTOMATION_TENANT_GUARD_REVIEW_REQUIRED' END,
  'expected_tables',s.expected_tables,
  'present_tables',s.present_tables,
  'structurally_valid_tables',s.structural_tables,
  'attached_triggers',s.attached_triggers,
  'function_metadata_and_acl_valid',
    EXISTS (SELECT 1 FROM function_details f
      WHERE f.prosecdef AND f.correct_owner AND f.correct_path
        AND NOT f.anon_allowed AND NOT f.authenticated_allowed AND f.service_allowed),
  'generic_lead_conversation_message_guards_present',
    EXISTS (SELECT 1 FROM function_details f
      WHERE f.generic_row AND f.lead_extraction AND f.lead_coverage
        AND f.conversation_extraction AND f.conversation_coverage
        AND f.message_extraction AND f.message_coverage AND f.three_tenant_mismatch_guards),
  'two_tenant_negative_test_witnessed',false,
  'staging_migration_approved',false,
  'release_authorized',false
) AS r2_automation_guard_gate
FROM summary s;
