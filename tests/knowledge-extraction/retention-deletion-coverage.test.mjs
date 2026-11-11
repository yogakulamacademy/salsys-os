import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  KNOWLEDGE_DATA_SURFACES,
  EXTERNAL_RETENTION_COVERAGE,
  RETENTION_DEPENDENCY_ALERTS,
  TRACKED_KNOWLEDGE_SCHEMA_FILES,
  assessKnowledgeRetentionCoverage,
} from '../../lib/knowledge-extraction/retention-deletion-coverage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const contents = Object.fromEntries(TRACKED_KNOWLEDGE_SCHEMA_FILES.map(
  path => [path, readFileSync(resolve(root, path), 'utf8')],
));

function declaredTables(sql) {
  return [...sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.(knowledge_[a-z0-9_]+)\b/gi)]
    .map(match => match[1].toLowerCase());
}
function listSchemaTables(sources = contents) {
  return Object.entries(sources).flatMap(([source, ddl]) =>
    declaredTables(ddl).map(name => ({ source, name })));
}
const all = listSchemaTables(contents);
// Detect newly introduced knowledge_* database tables anywhere in migrations or
// draft SQL, not only files manually declared in the original catalog.
const allSqlInRepository=[
  ...readdirSync(resolve(root,'supabase/migrations'))
    .filter(name=>name.endsWith('.sql'))
    .map(name=>'supabase/migrations/'+name),
  ...readdirSync(resolve(root,'docs/sql'))
    .filter(name=>name.endsWith('.sql'))
    .map(name=>'docs/sql/'+name),
];
const discoveredAcrossRepository=listSchemaTables(Object.fromEntries(
  allSqlInRepository.map(path=>[path,readFileSync(resolve(root,path),'utf8')]),
));

test('KB-06G table inventory matches every exact knowledge CREATE TABLE across current and draft DDL', () => {
  const catalog = KNOWLEDGE_DATA_SURFACES.map(item => item.name);
  assert.equal(new Set(catalog).size, catalog.length, 'Duplicate inventory row');
  assert.equal(new Set(all.map(row => row.name)).size, all.length,
    'Duplicate CREATE TABLE across source DDL inputs');
  assert.deepEqual([...catalog].sort(), all.map(row => row.name).sort());
  assert.deepEqual(
    [...new Set(discoveredAcrossRepository.map(row=>row.name))].sort(),
    [...catalog].sort(),
    'New or omitted knowledge CREATE TABLE anywhere in migrations/docs/sql requires inventory review',
  );
  assert.equal(catalog.length, 12);
  assert.equal(KNOWLEDGE_DATA_SURFACES.filter(x =>
    x.disposition === 'draft_exact_host_after_withdrawal_only').length, 2);
  assert.ok(catalog.every(name => /^knowledge_[a-z0-9_]+$/.test(name)));
});

test('KB-06G catches future discovered table additions instead of silently ignoring new retention surfaces', () => {
  const altered = {
    ...contents,
    [TRACKED_KNOWLEDGE_SCHEMA_FILES[0]]:
      contents[TRACKED_KNOWLEDGE_SCHEMA_FILES[0]] +
      '\nCREATE TABLE public.knowledge_new_derived_data (id uuid);\n',
  };
  assert.ok(listSchemaTables(altered).some(x=>x.name==='knowledge_new_derived_data'));
  assert.notDeepEqual(listSchemaTables(altered).map(x=>x.name).sort(),
    KNOWLEDGE_DATA_SURFACES.map(x=>x.name).sort());
});

test('KB-06G confirms the high-risk source, approval and version FK behaviors from actual migration', () => {
  const sql = contents['supabase/migrations/20261016171500_organization_knowledge_v1.sql'];
  assert.match(sql,
    /constraint\s+knowledge_chunks_document_fk[\s\S]*?references\s+public\.knowledge_documents\(id,\s*organization_id\)[\s\S]*?on\s+delete\s+cascade/i);
  assert.match(sql,
    /constraint\s+knowledge_approvals_document_fk[\s\S]*?references\s+public\.knowledge_documents\(id,\s*organization_id\)[\s\S]*?on\s+delete\s+cascade/i);
  assert.match(sql,
    /constraint\s+knowledge_documents_source_fk[\s\S]*?references\s+public\.knowledge_sources\(id,\s*organization_id\)[\s\S]*?on\s+delete\s+restrict/i);
  assert.match(sql,
    /constraint\s+knowledge_documents_supersedes_fk[\s\S]*?references\s+public\.knowledge_documents\(id,\s*organization_id\)[\s\S]*?on\s+delete\s+restrict/i);
  assert.ok(RETENTION_DEPENDENCY_ALERTS.some(x=>
    x.child==='knowledge_approvals' &&
    x.risk==='historical_human_approval_audit_removed_with_parent'));
});

test('KB-06G confirms the discovery consent audit and erasure FK trap from exact draft SQL', () => {
  const a = contents['docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql'];
  const b = contents['docs/sql/KB-06C-revoked-discovery-metadata-erasure-DRAFT.sql'];
  const c = contents['docs/sql/KB-01B-discovery-schema-DRAFT.sql'];
  assert.match(a,
    /consent_id\s+uuid\s+not\s+null\s+references\s+public\.knowledge_discovery_site_consents\(id\)\s+on\s+delete\s+cascade/i);
  assert.match(b,
    /consent_id\s+uuid\s+not\s+null\s+references\s+public\.knowledge_discovery_site_consents\(id\)\s+on\s+delete\s+restrict/i);
  assert.match(c,
    /constraint\s+knowledge_discovery_pages_job_fk[\s\S]*?references\s+public\.knowledge_discovery_jobs\(id,\s*organization_id\)\s+on\s+delete\s+cascade/i);
  assert.equal(RETENTION_DEPENDENCY_ALERTS.length,7);
});

test('KB-06G proves draft deletion SQL only targets discovery JOB/PAGE metadata, not approved knowledge or consent', () => {
  const ddl = contents['docs/sql/KB-06C-revoked-discovery-metadata-erasure-DRAFT.sql'];
  const deletes = [...ddl.matchAll(/\bdelete\s+from\s+public\.(knowledge_[a-z0-9_]+)/gi)]
    .map(match => match[1].toLowerCase()).sort();
  assert.deepEqual(deletes, ['knowledge_discovery_jobs', 'knowledge_discovery_pages']);
  assert.match(ddl,/v_consent\.status\s*<>\s*'withdrawn'/);
  assert.match(ddl,/consent_revision/i);
  assert.match(ddl,/create\s+trigger\s+kb_discovery_metadata_erasure_audit_immutable/i);
  for(const table of ['knowledge_sources','knowledge_documents','knowledge_chunks',
    'knowledge_approvals','knowledge_discovery_site_consents',
    'knowledge_discovery_consent_audit','knowledge_discovery_policy_documents']){
    assert.ok(!deletes.includes(table), table+' is NOT deleted by KB-06C');
  }
});

test('KB-06G every external cache, backup, log and provider risk stays unverified', () => {
  assert.equal(EXTERNAL_RETENTION_COVERAGE.length,5);
  assert.equal(new Set(EXTERNAL_RETENTION_COVERAGE.map(x=>x.id)).size,5);
  assert.ok(EXTERNAL_RETENTION_COVERAGE.every(x=>x.status==='unverified'));
  const report = assessKnowledgeRetentionCoverage();
  assert.equal(report.trackedDatabaseSurfaces,12);
  assert.equal(report.limitedMetadataOnlyDeletionDraftSurfaces,2);
  assert.equal(report.otherDatabaseSurfacesNeedingReview,10);
  assert.equal(report.externalRiskCategoriesUnverified,5);
  assert.equal(report.approvedRetentionDurationDays,null);
  assert.equal(report.quoteOrDerivedContentErasureImplemented,false);
  assert.equal(report.deletionAuditAndRightsPolicyIndependentlyApproved,false);
  assert.equal(report.liveStagingReconciliationVerified,false);
  assert.equal(report.externallyRetainedCopiesVerified,false);
  assert.equal(report.state,'blocked_pending_independent_retention_deletion_acceptance');
  for(const key of ['canScheduleDeletion','canDeleteKnowledgeOrQuotes','canGrantConsent',
    'canCrawl','canPublish','canMerge','canDeploy']){
    assert.equal(report[key],false, key+' must fail closed');
  }
});

test('KB-06G output and source catalogs are frozen and deterministic, with no data or network calls', () => {
  const old=globalThis.fetch;
  let count=0;
  globalThis.fetch=()=>{count++; throw Error('unexpected provider call');};
  try{
    const a=assessKnowledgeRetentionCoverage();
    const b=assessKnowledgeRetentionCoverage();
    assert.deepEqual(a,b);
    assert.ok(Object.isFrozen(a));
    assert.ok(Object.isFrozen(KNOWLEDGE_DATA_SURFACES));
    assert.ok(KNOWLEDGE_DATA_SURFACES.every(Object.isFrozen));
    assert.ok(EXTERNAL_RETENTION_COVERAGE.every(Object.isFrozen));
    assert.equal(count,0);
    assert.throws(()=>{a.canMerge=true;},TypeError);
  }finally{globalThis.fetch=old;}
});
