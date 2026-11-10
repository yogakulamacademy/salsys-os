const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const proposal = fs.readFileSync(path.resolve(__dirname,
  '../../docs/sql/r2-staging-identity-merge-privacy-table-review-v1.sql'), 'utf8');
const audit = fs.readFileSync(path.resolve(__dirname,
  '../../docs/sql/r2-identity-merge-privacy-schema-catalog-audit-v1.sql'), 'utf8');

const tables = ['privacy_erasure_jobs', 'privacy_export_runs'];
const parents = ['organizations', 'persons', 'privacy_data_subject_requests',
  'organization_members'];

test('review-only privacy schema proposal is transactional and fail-closed', () => {
  assert.match(proposal, /REVIEW ONLY/);
  assert.match(proposal, /DO NOT APPLY this docs\/sql proposal directly/);
  assert.match(proposal, /^BEGIN;$/m);
  assert.match(proposal, /^COMMIT;$/m);
  assert.match(proposal, /^SET LOCAL lock_timeout = '5s';$/m);
  assert.match(proposal, /^SET LOCAL statement_timeout = '30s';$/m);
  assert.match(proposal, /BLOCKED_R2_PRIVACY_TARGET_TABLE_ALREADY_EXISTS/);
  assert.match(proposal, /BLOCKED_R2_PRIVACY_STAGE_FUNCTION_SECURITY_GATE/);
  assert.match(proposal, /BLOCKED_R2_PRIVACY_PARENT_TABLE_CONTRACT_MISMATCH/);
  assert.match(proposal, /BLOCKED_R2_PRIVACY_IDENTITY_MERGE_CONTRACT_MISMATCH/);
  assert.match(proposal, /BLOCKED_R2_PRIVACY_TABLE_RLS_ACL_POSTFLIGHT_FAILED/);
  assert.match(proposal, /BLOCKED_R2_PRIVACY_TABLE_CONSTRAINT_POSTFLIGHT_FAILED/);
  assert.match(proposal, /BLOCKED_R2_PRIVACY_PARTIAL_INDEX_MISSING/);
  assert.equal((proposal.match(/^CREATE TABLE public\./gm)||[]).length, 2);
  assert.equal((proposal.match(/^CREATE POLICY /gm)||[]).length, 2);
  assert.doesNotMatch(proposal, /^\s*(?:DELETE FROM|INSERT INTO|UPDATE public\.|TRUNCATE|DROP TABLE)\b/im);
  assert.doesNotMatch(proposal, /(?:pg_net|http_post|supabase\.co|https?:\/\/|create extension|cron\.schedule)/i);
});

test('exact two-table schema preserves production structural safety contracts', () => {
  for (const table of tables) {
    assert.ok(proposal.includes('CREATE TABLE public.'+table+' ('), table+' creation');
    assert.ok(proposal.includes('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY;'));
    assert.ok(proposal.includes('CREATE POLICY '+table+'_member_read'));
    assert.ok(proposal.includes('ON public.'+table+' FOR SELECT TO authenticated'));
    assert.ok(audit.includes("'"+table+"'"));
    assert.ok(proposal.includes(table+'_pkey') ||
      proposal.includes('id uuid PRIMARY KEY DEFAULT gen_random_uuid()'));
  }
  for (const table of parents) assert.ok(proposal.includes("'"+table+"'"));
  assert.match(proposal, /status IN \('planned','held','ready','completed','cancelled'\)/);
  assert.match(proposal, /preserve_financial_records boolean NOT NULL DEFAULT true/);
  assert.match(proposal, /CONSTRAINT privacy_erasure_jobs_organization_id_request_id_key/);
  assert.match(proposal, /CREATE INDEX idx_privacy_erasure_jobs_pending/);
  assert.match(proposal, /package_hash text NOT NULL/);
  assert.match(proposal, /REFERENCES public\.persons\(id\) ON DELETE SET NULL/);
  assert.match(proposal, /REFERENCES public\.privacy_data_subject_requests\(id\) ON DELETE CASCADE/);
  assert.match(proposal, /m\.user_id=\(SELECT auth\.uid\(\)\) AND m\.active/);
});

test('anonymous and browser writes are denied by explicit least-privilege ACL policy', () => {
  assert.match(proposal, /REVOKE ALL ON TABLE public\.privacy_erasure_jobs,public\.privacy_export_runs\s+FROM PUBLIC,anon,authenticated;/);
  assert.match(proposal, /GRANT SELECT ON TABLE public\.privacy_erasure_jobs,public\.privacy_export_runs\s+TO authenticated;/);
  assert.match(proposal, /GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE\s+public\.privacy_erasure_jobs,public\.privacy_export_runs TO service_role;/);
  assert.match(proposal, /NOT pg_catalog\.has_table_privilege\('anon',c\.oid,'SELECT'\)/);
  for (const privilege of ['INSERT','UPDATE','DELETE']) {
    assert.ok(proposal.includes("NOT pg_catalog.has_table_privilege('authenticated',c.oid,'"+privilege+"')"));
  }
  assert.doesNotMatch(proposal, /(?:CREATE POLICY .* FOR (?:INSERT|UPDATE|DELETE)|GRANT ALL ON TABLE)/i);
});

test('privacy schema audit is read-only and does not confer false acceptance', () => {
  assert.match(audit, /PRIVACY_IDENTITY_MERGE_SCHEMA_OR_ROLE_REVIEW_REQUIRED/);
  assert.match(audit, /PRIVACY_IDENTITY_MERGE_METADATA_READY_NOT_E2E/);
  assert.match(audit, /s\.present_tables=2/);
  assert.match(audit, /s\.strict_role_tables=2/);
  assert.match(audit, /c\.verified_constraints=10/);
  assert.match(audit, /p\.valid_parents=4/);
  assert.match(audit, /'privacy_legal_approval',false/);
  assert.match(audit, /'signed_two_tenant_acceptance',false/);
  assert.match(audit, /'retention_executor_enabled',false/);
  assert.match(audit, /'migration_approved',false/);
  assert.match(audit, /'release_authorized',false/);
  assert.doesNotMatch(audit, /^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|DO|EXECUTE)\b/im);
});


test('tenant-paired privacy references remain a fail-closed independent acceptance gate', () => {
  const dossier = fs.readFileSync(path.resolve(__dirname,
    '../../docs/checkpoints/R2-2026-11-10-Privacy-Identity-Merge-Schema-Review-v1.md'), 'utf8');
  assert.match(audit, /tenant_fk_integrity AS/);
  assert.match(audit, /AND t\.composite_guards=4/);
  assert.match(audit, /'tenant_paired_composite_fks',t\.composite_guards/);
  assert.match(audit, /'expected_tenant_paired_fks',4/);
  assert.match(audit, /'tenant_reference_review_required',t\.composite_guards<>4/);
  assert.match(dossier, /Additional tenant-reference integrity gate/);
  assert.match(dossier, /current proposal will fail this additional gate/);
  assert.match(dossier, /mismatched \`request_id\` and mismatched \`person_id\`/);
  assert.match(dossier, /No customer rows were inspected/);
});
