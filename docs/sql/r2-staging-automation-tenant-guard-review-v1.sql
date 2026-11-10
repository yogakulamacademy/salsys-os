-- REVIEW-ONLY R2 staging proposal. DO NOT APPLY FROM docs/sql.
-- No migration, production or staging action is authorized by this file.
-- Requires independent DBA/security approval and a SEPARATELY REVIEWED versioned migration.
-- Prerequisite: #682 security grant repair applied and catalog gates passed on
-- the isolated stage, with anon/authenticated unable to execute this trigger RPC.
-- Uses only tenant-scoped lookups; no senders, schedulers, external calls or user data copies.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $r2_preflight$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='enforce_automation_tenant_alignment_v1'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)=''
    AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND p.prosecdef
    AND p.proconfig @> ARRAY['search_path=public, auth, pg_temp']::text[]
    AND md5(p.prosrc)='24a1a0b5237884945c67992ef4dc102e'
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_R2_AUTOMATION_GUARD_SOURCE_OR_ACL_MISMATCH';
  END IF;

  -- All seven stage tables must carry the existing enabled trigger, RLS,
  -- organization/lead columns and single-column lead FK. Never infer
  -- tenant equality merely from separate lead_id and organization_id FKs.
  WITH expected(tab) AS (
    VALUES ('automation_events'),('automation_runs'),
           ('automation_enrollments'),('automation_suppressions'),
           ('automation_scheduled_jobs'),('automation_variables'),
           ('automation_wait_states')
  )
  SELECT count(*)::int INTO v_count
  FROM expected e
  JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=e.tab
  WHERE c.relkind IN ('r','p')
    AND c.relrowsecurity
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='organization_id'
        AND a.attnum>0 AND NOT a.attisdropped)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='lead_id'
        AND a.attnum>0 AND NOT a.attisdropped)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k
      WHERE k.conrelid=c.oid AND k.contype='f'
        AND pg_catalog.pg_get_constraintdef(k.oid)
            LIKE 'FOREIGN KEY (lead_id) REFERENCES leads(id)%')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=c.oid
        AND t.tgfoid='public.enforce_automation_tenant_alignment_v1()'::regprocedure
        AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
        AND (t.tgtype & 1)=1
        AND (t.tgtype & 2)=2
        AND (t.tgtype & 4)=4
        AND (t.tgtype & 16)=16);
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'BLOCKED_R2_AUTOMATION_TRIGGER_TABLE_CONTRACT_MISMATCH: %', v_count;
  END IF;
END;
$r2_preflight$;

-- Replace only the function body. Existing triggers, ownership and function
-- EXECUTE ACLs must be preserved; no GRANTs or new background jobs.
CREATE OR REPLACE FUNCTION public.enforce_automation_tenant_alignment_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_org uuid;
  v_new jsonb := to_jsonb(new);
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN (
       'automation_events', 'automation_runs', 'automation_enrollments',
       'automation_suppressions', 'automation_scheduled_jobs',
       'automation_variables', 'automation_wait_states'
     )
     OR TG_OP NOT IN ('INSERT','UPDATE') THEN
    RAISE EXCEPTION 'Unexpected R2 automation tenant alignment trigger context';
  END IF;

  IF new.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  -- Use the same guard on every attached table. If an optional id is NULL,
  -- no relationship is asserted; non-NULL ids must belong to this tenant.
  v_lead_id := nullif(v_new->>'lead_id', '')::uuid;
  v_conversation_id := nullif(v_new->>'conversation_id', '')::uuid;
  v_message_id := nullif(v_new->>'message_id', '')::uuid;

  IF v_lead_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.leads WHERE id=v_lead_id;
    IF v_org IS NULL OR v_org <> new.organization_id THEN
      RAISE EXCEPTION 'Automation lead does not belong to organization %', new.organization_id;
    END IF;
  END IF;

  IF v_conversation_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.conversations WHERE id=v_conversation_id;
    IF v_org IS NULL OR v_org <> new.organization_id THEN
      RAISE EXCEPTION 'Automation conversation does not belong to organization %', new.organization_id;
    END IF;
  END IF;

  IF v_message_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.messages WHERE id=v_message_id;
    IF v_org IS NULL OR v_org <> new.organization_id THEN
      RAISE EXCEPTION 'Automation message does not belong to organization %', new.organization_id;
    END IF;
  END IF;

  RETURN new;
END;
$function$;

DO $r2_postflight$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::int INTO v_count
  FROM pg_catalog.pg_proc p
  WHERE p.oid='public.enforce_automation_tenant_alignment_v1()'::regprocedure
    AND p.prosecdef
    AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND p.proconfig @> ARRAY['search_path=public, auth, pg_temp']::text[]
    AND position('v_new jsonb := to_jsonb(new)' in p.prosrc)>0
    AND position('v_lead_id := nullif(v_new->>''lead_id''' in p.prosrc)>0
    AND position('IF V_LEAD_ID IS NOT NULL THEN' in upper(p.prosrc))>0
    AND position('v_conversation_id := nullif(v_new->>''conversation_id''' in p.prosrc)>0
    AND position('IF V_CONVERSATION_ID IS NOT NULL THEN' in upper(p.prosrc))>0
    AND position('v_message_id := nullif(v_new->>''message_id''' in p.prosrc)>0
    AND position('IF V_MESSAGE_ID IS NOT NULL THEN' in upper(p.prosrc))>0
    AND (length(lower(p.prosrc))
      - length(replace(lower(p.prosrc), 'v_org is null or v_org <> new.organization_id', '')))
        / length('v_org is null or v_org <> new.organization_id') >= 3
    AND position('TG_TABLE_SCHEMA' in p.prosrc)>0
    AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_R2_AUTOMATION_GUARD_POSTFLIGHT_FAILED';
  END IF;
END;
$r2_postflight$;
COMMIT;
