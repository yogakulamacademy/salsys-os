-- R2 PR #685 — WhatsApp template draft migration catalog parity (SELECT ONLY)
-- Target (only when individually authorized by the operator): staging project
-- ndxpjqkthuzxlmbenxti. Never run in production as a recovery/change operation.
-- No customer rows, data values, SQL modifications, or migration-history writes.
--
-- Interpretation: 15 catalog assertions must be true. This verifies intended
-- current STRUCTURE, NOT SQL byte equality, individual historical execution,
-- physical-backup restore, or migration-ledger correction.
WITH t AS (SELECT to_regclass('public.whatsapp_template_drafts') AS oid),
 c AS (
   SELECT pg_get_constraintdef(oid) AS definition
   FROM pg_constraint
   WHERE conrelid=(SELECT oid FROM t) AND conname='whatsapp_template_drafts_name_check'
 ),
 fn AS (
   SELECT p.oid, p.prosecdef, p.proconfig, p.prosrc
   FROM pg_proc p
   WHERE p.oid=to_regprocedure('public.validate_whatsapp_template_draft_tenant_v1()')
 ),
 tab AS (SELECT relrowsecurity FROM pg_class WHERE oid=(SELECT oid FROM t))
SELECT
  (SELECT count(*) FROM pg_attribute
    WHERE attrelid=(SELECT oid FROM t) AND attnum>0 AND NOT attisdropped)=17
    AS expected_columns_17,
  (SELECT relrowsecurity FROM tab)=true
    AS rls_enabled,
  EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=(SELECT oid FROM t)
     AND p.polname='deny_client_whatsapp_template_drafts'
     AND pg_get_expr(p.polqual,p.polrelid)='false'
     AND pg_get_expr(p.polwithcheck,p.polrelid)='false')
    AS deny_client_policy,
  EXISTS (SELECT 1 FROM c
     WHERE definition ILIKE '%length(template_name) >= 1%'
       AND definition ILIKE '%length(template_name) <= 512%'
       AND definition LIKE '%^[a-z0-9_]+$%')
    AS corrected_name_rule,
  EXISTS (SELECT 1 FROM pg_trigger g
    WHERE g.tgrelid=(SELECT oid FROM t)
      AND g.tgname='whatsapp_template_drafts_tenant_guard'
      AND NOT g.tgisinternal
      AND pg_get_triggerdef(g.oid) LIKE '%BEFORE INSERT OR UPDATE%')
    AS tenant_guard_trigger,
  EXISTS (SELECT 1 FROM fn WHERE prosecdef
    AND proconfig @> ARRAY['search_path=""']::text[]
    AND prosrc ILIKE '%new.whatsapp_account_id%'
    AND prosrc ILIKE '%new.organization_id%'
    AND prosrc ILIKE '%new.updated_at := now()%')
    AS guard_function_body_and_settings,
  EXISTS (SELECT 1 FROM fn
    WHERE NOT has_function_privilege('anon', oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
      AND has_function_privilege('service_role',oid,'EXECUTE'))
    AS service_only_guard,
  NOT has_table_privilege('anon',(SELECT oid FROM t),'SELECT')
    AND NOT has_table_privilege('authenticated',(SELECT oid FROM t),'SELECT')
    AND has_table_privilege('service_role',(SELECT oid FROM t),'SELECT')
    AS table_select_acl,
  EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='whatsapp_template_drafts'
      AND indexname='whatsapp_template_drafts_org_state_idx'
      AND indexdef LIKE '%(organization_id, whatsapp_account_id, status, updated_at DESC)%')
    AS expected_org_state_index,
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid=(SELECT oid FROM t) AND conname='whatsapp_template_drafts_unique_name')
    AS unique_template_name,
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid=(SELECT oid FROM t) AND conname='whatsapp_template_drafts_category_check')
    AS category_check,
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid=(SELECT oid FROM t) AND conname='whatsapp_template_drafts_status_check')
    AS status_check,
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid=(SELECT oid FROM t) AND conname='whatsapp_template_drafts_payload_object')
    AS payload_type_check,
  EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a
    ON a.attrelid=d.adrelid AND a.attnum=d.adnum
    WHERE d.adrelid=(SELECT oid FROM t) AND a.attname='payload'
      AND pg_get_expr(d.adbin,d.adrelid)='''{}''::jsonb')
    AS payload_default,
  EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a
    ON a.attrelid=d.adrelid AND a.attnum=d.adnum
    WHERE d.adrelid=(SELECT oid FROM t) AND a.attname='status'
      AND pg_get_expr(d.adbin,d.adrelid)='''draft''::text')
    AS status_default;
