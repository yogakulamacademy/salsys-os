-- REVIEW ONLY: minimum two-table privacy contract required for R2 identity merge.
-- DO NOT APPLY this docs/sql proposal directly. No staging/production installation
-- authorized. A privacy officer and independent DBA must approve exact DDL,
-- policy/grant/retention, rollback and a separate CLI-generated versioned migration.
-- No customer records, backfills, scheduled jobs, exports or erasure actions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $r2_privacy_preflight$
DECLARE
  v_count integer;
BEGIN
  -- Never replace or modify an existing privacy table accidentally.
  SELECT count(*)::integer INTO v_count
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('privacy_erasure_jobs','privacy_export_runs');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_TARGET_TABLE_ALREADY_EXISTS';
  END IF;

  -- Security repair and global anonymous-EXECUTE catalog acceptance must
  -- precede any privacy dependency staging installation. Do not treat a
  -- privacy table migration as a workaround for 25 exposed function ACLs.
  SELECT count(*)::integer INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_STAGE_FUNCTION_SECURITY_GATE: %',v_count;
  END IF;

  WITH required(name) AS (
    VALUES ('organizations'),('persons'),('privacy_data_subject_requests'),
           ('organization_members')
  )
  SELECT count(*)::integer INTO v_count
  FROM required e
  JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=e.name
  WHERE c.relkind IN ('r','p')
    AND c.relrowsecurity
    AND pg_catalog.pg_get_userbyid(c.relowner)='postgres'
    AND (e.name NOT IN ('persons','privacy_data_subject_requests') OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='organization_id'
        AND a.atttypid='uuid'::regtype AND a.attnotnull
        AND a.attnum>0 AND NOT a.attisdropped
    ))
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint k
      WHERE k.conrelid=c.oid AND k.contype='p'
        AND pg_catalog.pg_get_constraintdef(k.oid)='PRIMARY KEY (id)'
    )
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=c.oid AND a.attname='id'
        AND a.atttypid='uuid'::regtype AND a.attnum>0 AND NOT a.attisdropped
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_PARENT_TABLE_CONTRACT_MISMATCH: %',v_count;
  END IF;

  -- The installed identity-merge function's privacy preflight is the only
  -- authorized reason for this *minimal* schema proposal. This does not
  -- grant access to execute the merge, and does not fix other privacy workflows.
  SELECT count(*)::integer INTO v_count FROM pg_catalog.pg_proc p
    WHERE p.oid=pg_catalog.to_regprocedure('public.merge_identity_resolution_conflict_v1(uuid)')
      AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
      AND position('public.privacy_erasure_jobs' IN pg_catalog.pg_get_functiondef(p.oid))>0
      AND position('public.privacy_export_runs' IN pg_catalog.pg_get_functiondef(p.oid))>0;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_IDENTITY_MERGE_CONTRACT_MISMATCH';
  END IF;
END;
$r2_privacy_preflight$;

-- R2 staging-only paired keys required for trusted cross-tenant references.
-- These add redundant uniqueness over existing UUID primary keys; this is
-- necessary for PostgreSQL composite foreign keys to reference both fields.
-- Independent DBA must review parent-table locks, live row count and rollback.
ALTER TABLE public.persons
  ADD CONSTRAINT r2_privacy_person_org_id_key UNIQUE (organization_id,id);
ALTER TABLE public.privacy_data_subject_requests
  ADD CONSTRAINT r2_privacy_request_org_id_key UNIQUE (organization_id,id);

CREATE TABLE public.privacy_erasure_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  person_id uuid,
  status text NOT NULL DEFAULT 'planned'
    CONSTRAINT privacy_erasure_jobs_status_check
    CHECK (status IN ('planned','held','ready','completed','cancelled')),
  preserve_financial_records boolean NOT NULL DEFAULT true,
  held_reason text,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  planned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT privacy_erasure_jobs_request_id_fkey
    FOREIGN KEY (organization_id,request_id)
    REFERENCES public.privacy_data_subject_requests(organization_id,id)
    ON DELETE CASCADE,
  CONSTRAINT privacy_erasure_jobs_person_id_fkey
    FOREIGN KEY (organization_id,person_id)
    REFERENCES public.persons(organization_id,id)
    ON DELETE SET NULL (person_id),
  CONSTRAINT privacy_erasure_jobs_organization_id_request_id_key
    UNIQUE (organization_id,request_id)
);
CREATE INDEX idx_privacy_erasure_jobs_pending
  ON public.privacy_erasure_jobs (organization_id,status,planned_at)
  WHERE status IN ('planned','held','ready');

CREATE TABLE public.privacy_export_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  person_id uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  package_hash text NOT NULL,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT privacy_export_runs_request_id_fkey
    FOREIGN KEY (organization_id,request_id)
    REFERENCES public.privacy_data_subject_requests(organization_id,id)
    ON DELETE CASCADE,
  CONSTRAINT privacy_export_runs_person_id_fkey
    FOREIGN KEY (organization_id,person_id)
    REFERENCES public.persons(organization_id,id)
    ON DELETE SET NULL (person_id)
);

-- Preserve tenant-only visibility. There is deliberately NO browser-user
-- INSERT, UPDATE or DELETE policy and NO job/scheduler/erasure executor here.
ALTER TABLE public.privacy_erasure_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_export_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_erasure_jobs_member_read
  ON public.privacy_erasure_jobs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=privacy_erasure_jobs.organization_id
      AND m.user_id=(SELECT auth.uid()) AND m.active
  ));

CREATE POLICY privacy_export_runs_member_read
  ON public.privacy_export_runs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=privacy_export_runs.organization_id
      AND m.user_id=(SELECT auth.uid()) AND m.active
  ));

-- Privacy-safe narrower role ACLs than the broad catalog-level grants that
-- exist in Production; this is an intentional policy review decision for DBA.
REVOKE ALL ON TABLE public.privacy_erasure_jobs,public.privacy_export_runs
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.privacy_erasure_jobs,public.privacy_export_runs
  TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  public.privacy_erasure_jobs,public.privacy_export_runs TO service_role;

DO $r2_privacy_postflight$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('privacy_erasure_jobs','privacy_export_runs')
    AND c.relkind='r' AND c.relrowsecurity
    AND pg_catalog.pg_get_userbyid(c.relowner)='postgres'
    AND NOT pg_catalog.has_table_privilege('anon',c.oid,'SELECT')
    AND NOT pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT')
    AND NOT pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE')
    AND NOT pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE')
    AND pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT')
    AND pg_catalog.has_table_privilege('service_role',c.oid,'SELECT')
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid=c.oid AND p.polcmd='r'
        AND p.polname=c.relname||'_member_read'
        AND p.polroles @> ARRAY['authenticated'::regrole::oid]
        AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)
            LIKE '%organization_members%'
        AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)
            LIKE '%auth.uid()%'
    );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_TABLE_RLS_ACL_POSTFLIGHT_FAILED: %',v_count;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM pg_catalog.pg_constraint k
  JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND (
      (c.relname='privacy_erasure_jobs' AND k.conname IN (
       'privacy_erasure_jobs_pkey','privacy_erasure_jobs_organization_id_fkey',
       'privacy_erasure_jobs_request_id_fkey','privacy_erasure_jobs_person_id_fkey',
       'privacy_erasure_jobs_status_check',
       'privacy_erasure_jobs_organization_id_request_id_key'))
      OR
      (c.relname='privacy_export_runs' AND k.conname IN (
       'privacy_export_runs_pkey','privacy_export_runs_organization_id_fkey',
       'privacy_export_runs_request_id_fkey','privacy_export_runs_person_id_fkey'))
    );
  IF v_count <> 10 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_TABLE_CONSTRAINT_POSTFLIGHT_FAILED: %',v_count;
  END IF;

  -- Parent composite keys and all four same-tenant child FKs must be present
  -- before this DDL can COMMIT, not merely have their names declared.
  SELECT count(*)::integer INTO v_count
  FROM pg_catalog.pg_constraint k
  JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND k.contype='u'
    AND (
      (c.relname='persons' AND k.conname='r2_privacy_person_org_id_key') OR
      (c.relname='privacy_data_subject_requests' AND k.conname='r2_privacy_request_org_id_key')
    )
    AND pg_catalog.pg_get_constraintdef(k.oid)='UNIQUE (organization_id, id)';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_COMPOSITE_PARENT_KEYS: %',v_count;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM pg_catalog.pg_constraint k
  JOIN pg_catalog.pg_class child ON child.oid=k.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=child.relnamespace
  JOIN pg_catalog.pg_class parent ON parent.oid=k.confrelid
  WHERE n.nspname='public' AND k.contype='f' AND k.convalidated
    AND child.relname IN ('privacy_erasure_jobs','privacy_export_runs')
    AND (
      (parent.relname='persons' AND
       pg_catalog.pg_get_constraintdef(k.oid) LIKE
        'FOREIGN KEY (organization_id, person_id) REFERENCES persons(organization_id, id) ON DELETE SET NULL (person_id)%')
      OR
      (parent.relname='privacy_data_subject_requests' AND
       pg_catalog.pg_get_constraintdef(k.oid) LIKE
        'FOREIGN KEY (organization_id, request_id) REFERENCES privacy_data_subject_requests(organization_id, id) ON DELETE CASCADE%')
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_SAME_TENANT_FOREIGN_KEYS: %',v_count;
  END IF;

  IF to_regclass('public.idx_privacy_erasure_jobs_pending') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_R2_PRIVACY_PARTIAL_INDEX_MISSING';
  END IF;
END;
$r2_privacy_postflight$;
COMMIT;
