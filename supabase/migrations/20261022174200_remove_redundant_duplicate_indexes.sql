-- Remove duplicate standalone indexes reported by Supabase performance advisor.
-- Constraint-backed indexes are never dropped by this migration.

DO $cleanup$
DECLARE
  v_index text;
  v_candidates text[] := ARRAY[
    'public.idx_lead_stage_history_lead_changed_at',
    'public.idx_leads_current_stage',
    'public.idx_messages_lead_created_at',
    'public.organization_members_org_idx',
    'public.organization_members_user_idx',
    'public.organization_members_org_user_unique',
    'public.organizations_slug_unique',
    'public.web_sessions_lead_id_idx1',
    'public.uq_whatsapp_crm_message_links_org_message'
  ];
  v_oid oid;
BEGIN
  FOREACH v_index IN ARRAY v_candidates LOOP
    v_oid := to_regclass(v_index);

    IF v_oid IS NULL THEN
      CONTINUE;
    END IF;

    -- Never drop an index owned by a PK/UNIQUE/EXCLUDE constraint.
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      WHERE c.conindid = v_oid
    ) THEN
      RAISE NOTICE 'Skipping constraint-backed index %', v_index;
      CONTINUE;
    END IF;

    EXECUTE format('DROP INDEX IF EXISTS %s', v_index);
  END LOOP;
END
$cleanup$;
