-- SELECT-ONLY R2 identity-merge privacy dependency audit.
-- Counts catalog metadata only; never reads subjects, requests, jobs or exports.
-- Structural production parity is NOT a privacy policy or E2E PASS.
WITH expected(name) AS (
 VALUES ('privacy_erasure_jobs'),('privacy_export_runs')
), parent(name) AS (
 VALUES ('organizations'),('persons'),('privacy_data_subject_requests'),
        ('organization_members')
), relations AS (
 SELECT e.name,c.oid,c.relrowsecurity AS rls,
  pg_catalog.pg_get_userbyid(c.relowner) AS owner,
  CASE WHEN c.oid IS NULL THEN false
    ELSE pg_catalog.has_table_privilege('anon',c.oid,'SELECT') END AS anon_can_select,
  CASE WHEN c.oid IS NULL THEN false
    ELSE pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') END AS auth_can_select,
  CASE WHEN c.oid IS NULL THEN false
    ELSE pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT') END AS auth_can_insert,
  CASE WHEN c.oid IS NULL THEN false
    ELSE pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE') END AS auth_can_update,
  CASE WHEN c.oid IS NULL THEN false
    ELSE pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE') END AS auth_can_delete,
  CASE WHEN c.oid IS NULL THEN false
    ELSE pg_catalog.has_table_privilege('service_role',c.oid,'SELECT') END AS service_can_select
 FROM expected e
 LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
   AND c.relname=e.name AND c.relkind='r'
), details AS (
 SELECT r.*,
 EXISTS (SELECT 1 FROM pg_catalog.pg_policy pol
   WHERE pol.polrelid=r.oid AND pol.polcmd='r'
     AND pol.polname=r.name||'_member_read'
     AND pg_catalog.pg_get_expr(pol.polqual,pol.polrelid) LIKE '%organization_members%'
     AND pg_catalog.pg_get_expr(pol.polqual,pol.polrelid) LIKE '%auth.uid()%') AS member_read_policy
 FROM relations r
), structural AS (
 SELECT count(*)::int AS expected_tables,
 count(*) FILTER (WHERE oid IS NOT NULL)::int AS present_tables,
 count(*) FILTER (WHERE rls AND owner='postgres')::int AS rls_postgres_owned,
 count(*) FILTER (WHERE member_read_policy)::int AS member_read_policies,
 count(*) FILTER (WHERE NOT anon_can_select AND auth_can_select
   AND NOT auth_can_insert AND NOT auth_can_update AND NOT auth_can_delete
   AND service_can_select)::int AS strict_role_tables
 FROM details
), parent_status AS (
 SELECT count(*) FILTER (WHERE c.oid IS NOT NULL AND c.relrowsecurity
     AND pg_catalog.pg_get_userbyid(c.relowner)='postgres'
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint con
       WHERE con.conrelid=c.oid AND con.contype='p'
         AND pg_catalog.pg_get_constraintdef(con.oid)='PRIMARY KEY (id)'))::int AS valid_parents
 FROM parent e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=e.name
), expected_constraints(tab,cname) AS (
 VALUES
 ('privacy_erasure_jobs','privacy_erasure_jobs_pkey'),
 ('privacy_erasure_jobs','privacy_erasure_jobs_organization_id_fkey'),
 ('privacy_erasure_jobs','privacy_erasure_jobs_request_id_fkey'),
 ('privacy_erasure_jobs','privacy_erasure_jobs_person_id_fkey'),
 ('privacy_erasure_jobs','privacy_erasure_jobs_status_check'),
 ('privacy_erasure_jobs','privacy_erasure_jobs_organization_id_request_id_key'),
 ('privacy_export_runs','privacy_export_runs_pkey'),
 ('privacy_export_runs','privacy_export_runs_organization_id_fkey'),
 ('privacy_export_runs','privacy_export_runs_request_id_fkey'),
 ('privacy_export_runs','privacy_export_runs_person_id_fkey')
), constraint_status AS (
 SELECT count(*) FILTER (WHERE k.oid IS NOT NULL AND k.convalidated)::int AS verified_constraints
 FROM expected_constraints e
 LEFT JOIN details d ON d.name=e.tab
 LEFT JOIN pg_catalog.pg_constraint k ON k.conrelid=d.oid AND k.conname=e.cname
), tenant_fk_integrity AS (
 -- Four expected tenant-paired links: each child table's request and person.
 -- Separate organization_id, request_id and person_id FKs DO NOT prove
 -- same-organization references. Never infer tenant safety from RLS alone.
 SELECT count(*)::int AS composite_guards
 FROM pg_catalog.pg_constraint k
 JOIN pg_catalog.pg_class child ON child.oid=k.conrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=child.relnamespace
 JOIN pg_catalog.pg_class parent ON parent.oid=k.confrelid
 CROSS JOIN LATERAL (
   SELECT
    ARRAY(SELECT a.attname::text
          FROM unnest(k.conkey) WITH ORDINALITY AS p(attnum,ord)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid=k.conrelid AND a.attnum=p.attnum
          ORDER BY p.ord) AS child_keys,
    ARRAY(SELECT a.attname::text
          FROM unnest(k.confkey) WITH ORDINALITY AS p(attnum,ord)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid=k.confrelid AND a.attnum=p.attnum
          ORDER BY p.ord) AS parent_keys
 ) cols
 WHERE n.nspname='public'
   AND child.relname IN ('privacy_erasure_jobs','privacy_export_runs')
   AND k.contype='f'
   AND (
     (parent.relname='persons' AND
       ((cols.child_keys=ARRAY['organization_id','person_id'] AND cols.parent_keys=ARRAY['organization_id','id'])
        OR (cols.child_keys=ARRAY['person_id','organization_id'] AND cols.parent_keys=ARRAY['id','organization_id'])))
     OR
     (parent.relname='privacy_data_subject_requests' AND
       ((cols.child_keys=ARRAY['organization_id','request_id'] AND cols.parent_keys=ARRAY['organization_id','id'])
        OR (cols.child_keys=ARRAY['request_id','organization_id'] AND cols.parent_keys=ARRAY['id','organization_id'])))
   )
), merge_function AS (
 SELECT count(*)::int AS present
 FROM pg_catalog.pg_proc p
 WHERE p.oid=pg_catalog.to_regprocedure('public.merge_identity_resolution_conflict_v1(uuid)')
   AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND position('public.privacy_erasure_jobs' IN pg_catalog.pg_get_functiondef(p.oid))>0
   AND position('public.privacy_export_runs' IN pg_catalog.pg_get_functiondef(p.oid))>0
)
SELECT jsonb_build_object(
 'status',CASE
  WHEN s.present_tables=2 AND s.rls_postgres_owned=2 AND s.member_read_policies=2
   AND s.strict_role_tables=2 AND p.valid_parents=4
   AND c.verified_constraints=10 AND f.present=1
   AND t.composite_guards=4
   AND to_regclass('public.idx_privacy_erasure_jobs_pending') IS NOT NULL
  THEN 'PRIVACY_IDENTITY_MERGE_METADATA_READY_NOT_E2E'
  ELSE 'PRIVACY_IDENTITY_MERGE_SCHEMA_OR_ROLE_REVIEW_REQUIRED' END,
 'present_tables',s.present_tables,
 'required_tables',s.expected_tables,
 'rls_postgres_owned_tables',s.rls_postgres_owned,
 'member_read_policies',s.member_read_policies,
 'strict_acl_tables',s.strict_role_tables,
 'required_parent_contracts',p.valid_parents,
 'expected_parent_contracts',4,
 'validated_constraints',c.verified_constraints,
 'expected_constraints',10,
 'identity_merge_privacy_preflight_function_present',f.present=1,
 'partial_index_present',to_regclass('public.idx_privacy_erasure_jobs_pending') IS NOT NULL,
 'tenant_paired_composite_fks',t.composite_guards,
 'expected_tenant_paired_fks',4,
 'tenant_reference_review_required',t.composite_guards<>4,
 'note','A reviewed equivalent trigger/other guard requires a separately revised audit; separate ID FKs alone do not enforce same-tenant references',
 'privacy_legal_approval',false,
 'signed_two_tenant_acceptance',false,
 'retention_executor_enabled',false,
 'migration_approved',false,
 'release_authorized',false
) AS r2_privacy_identity_schema_gate
FROM structural s CROSS JOIN parent_status p CROSS JOIN constraint_status c
CROSS JOIN merge_function f CROSS JOIN tenant_fk_integrity t;
