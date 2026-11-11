/**
 * KB-06G retention/deletion dependency inventory, NOT a policy or authorization.
 * Historical platform knowledge tables and unapplied KB draft tables are
 * intentionally both included. No retention duration, right-to-erasure
 * interpretation, SQL write, provider call or deployment is made here.
 *
 * Adding any knowledge_* CREATE TABLE in the tracked SQL inputs must update
 * this inventory and receive independent human review, otherwise CI fails.
 */
export const KNOWLEDGE_DATA_SURFACES = Object.freeze([
  Object.freeze({
    name: 'knowledge_sources',
    kind: 'source_reference',
    scope: 'tenant',
    disposition: 'requires_independent_policy_decision',
    risk: 'URI and metadata may contain personal/source identifiers',
  }),
  Object.freeze({
    name: 'knowledge_documents',
    kind: 'derived_full_text',
    scope: 'tenant',
    disposition: 'requires_independent_policy_decision',
    risk: 'Source-derived document text and versions survive discovery-job metadata erasure',
  }),
  Object.freeze({
    name: 'knowledge_chunks',
    kind: 'derived_retrieval_text',
    scope: 'tenant',
    disposition: 'requires_independent_policy_decision',
    risk: 'Full-text search chunks and generated search_vector remain retrievable until separate erasure',
  }),
  Object.freeze({
    name: 'knowledge_approvals',
    kind: 'human_review_audit',
    scope: 'tenant',
    disposition: 'requires_independent_audit_retention_decision',
    risk: 'ON DELETE CASCADE from documents can silently delete reviewer notes and approval history',
  }),
  Object.freeze({
    name: 'knowledge_discovery_domain_verifications',
    kind: 'ownership_proof_metadata',
    scope: 'tenant',
    disposition: 'requires_independent_policy_decision',
    risk: 'Hostnames and challenge/proof timestamps are not covered by KB-06C metadata erasure',
  }),
  Object.freeze({
    name: 'knowledge_discovery_jobs',
    kind: 'discovery_job_metadata',
    scope: 'tenant',
    disposition: 'draft_exact_host_after_withdrawal_only',
    risk: 'KB-06C only proposes exact-host withdrawn-consent job deletion; not production accepted',
  }),
  Object.freeze({
    name: 'knowledge_discovery_pages',
    kind: 'discovery_page_metadata',
    scope: 'tenant',
    disposition: 'draft_exact_host_after_withdrawal_only',
    risk: 'KB-06C only proposes scoped page metadata deletion, not source quotes/derived documents',
  }),
  Object.freeze({
    name: 'knowledge_discovery_site_consents',
    kind: 'consent_state',
    scope: 'tenant',
    disposition: 'requires_independent_audit_retention_decision',
    risk: 'Grant/withdrawal state must not disappear before lawful audit and re-consent restrictions are decided',
  }),
  Object.freeze({
    name: 'knowledge_discovery_consent_control',
    kind: 'global_consent_control',
    scope: 'global',
    disposition: 'requires_independent_global_policy_decision',
    risk: 'Global policy approval switch is not a tenant erasure target',
  }),
  Object.freeze({
    name: 'knowledge_discovery_consent_audit',
    kind: 'consent_audit',
    scope: 'tenant',
    disposition: 'requires_independent_audit_retention_decision',
    risk: 'Append-only grant/withdrawal history is not covered by KB-06C and FK cascades on consent delete',
  }),
  Object.freeze({
    name: 'knowledge_discovery_metadata_erasure_audit',
    kind: 'erasure_audit',
    scope: 'tenant',
    disposition: 'requires_independent_audit_retention_decision',
    risk: 'Audit is append-only and has RESTRICT FK to consent state; erasure must preserve reconciliation',
  }),
  Object.freeze({
    name: 'knowledge_discovery_policy_documents',
    kind: 'global_immutable_policy_text',
    scope: 'global',
    disposition: 'requires_independent_global_policy_decision',
    risk: 'Immutable operator text requires independent version/retention review; not tenant quote erasure',
  }),
]);

/** All external data surfaces require real architecture and provider review.
 * These labels are *risk categories*, not confirmed deployed integrations.
 */
export const EXTERNAL_RETENTION_COVERAGE = Object.freeze([
  Object.freeze({ id: 'backup_replica_pitr', status: 'unverified',
    description: 'Backups, replicas, point-in-time restore and recovery copies' }),
  Object.freeze({ id: 'server_logs_and_trace', status: 'unverified',
    description: 'Application logs, database logs, traces and error-report payloads' }),
  Object.freeze({ id: 'prompt_context_or_provider', status: 'unverified',
    description: 'AI prompt/response context, provider retention and transient request logs' }),
  Object.freeze({ id: 'cache_search_export', status: 'unverified',
    description: 'External indexes, cached content and exported files' }),
  Object.freeze({ id: 'published_downstream_output', status: 'unverified',
    description: 'Copied citations, sent replies, approved publications and downstream messages' }),
]);

/** FK behavior is factual DDL analysis, not a safe deletion instruction. */
export const RETENTION_DEPENDENCY_ALERTS = Object.freeze([
  Object.freeze({
    parent: 'knowledge_documents', child: 'knowledge_chunks',
    onDelete: 'CASCADE', risk: 'derived_content_removed_with_parent',
  }),
  Object.freeze({
    parent: 'knowledge_documents', child: 'knowledge_approvals',
    onDelete: 'CASCADE', risk: 'historical_human_approval_audit_removed_with_parent',
  }),
  Object.freeze({
    parent: 'knowledge_sources', child: 'knowledge_documents',
    onDelete: 'RESTRICT', risk: 'source_delete_blocked_while_documents_reference_source',
  }),
  Object.freeze({
    parent: 'knowledge_documents', child: 'knowledge_documents',
    onDelete: 'RESTRICT', risk: 'superseded_versions_can_block_document_deletion',
  }),
  Object.freeze({
    parent: 'knowledge_discovery_jobs', child: 'knowledge_discovery_pages',
    onDelete: 'CASCADE', risk: 'discovery_page_metadata_removed_with_job',
  }),
  Object.freeze({
    parent: 'knowledge_discovery_site_consents', child: 'knowledge_discovery_consent_audit',
    onDelete: 'CASCADE', risk: 'consent_deletion_can_remove_the_related_immutable_audit',
  }),
  Object.freeze({
    parent: 'knowledge_discovery_site_consents', child: 'knowledge_discovery_metadata_erasure_audit',
    onDelete: 'RESTRICT', risk: 'retained_erasure_audit_blocks_consent_row_deletion',
  }),
]);

export const TRACKED_KNOWLEDGE_SCHEMA_FILES = Object.freeze([
  'supabase/migrations/20261016171500_organization_knowledge_v1.sql',
  'docs/sql/KB-01B-discovery-schema-DRAFT.sql',
  'docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql',
  'docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql',
  'docs/sql/KB-06C-revoked-discovery-metadata-erasure-DRAFT.sql',
  'docs/sql/KB-06E-reviewed-policy-document-preview-DRAFT.sql',
]);

export function assessKnowledgeRetentionCoverage() {
  const metadataOnlyDraft = KNOWLEDGE_DATA_SURFACES.filter(
    row => row.disposition === 'draft_exact_host_after_withdrawal_only').length;
  const missingDecision = KNOWLEDGE_DATA_SURFACES.length - metadataOnlyDraft;
  return Object.freeze({
    state: 'blocked_pending_independent_retention_deletion_acceptance',
    trackedDatabaseSurfaces: KNOWLEDGE_DATA_SURFACES.length,
    limitedMetadataOnlyDeletionDraftSurfaces: metadataOnlyDraft,
    otherDatabaseSurfacesNeedingReview: missingDecision,
    externalRiskCategoriesUnverified: EXTERNAL_RETENTION_COVERAGE.length,
    foreignKeyDependencyRisks: RETENTION_DEPENDENCY_ALERTS.length,
    approvedRetentionDurationDays: null,
    quoteOrDerivedContentErasureImplemented: false,
    deletionAuditAndRightsPolicyIndependentlyApproved: false,
    liveStagingReconciliationVerified: false,
    externallyRetainedCopiesVerified: false,
    canScheduleDeletion: false,
    canDeleteKnowledgeOrQuotes: false,
    canGrantConsent: false,
    canCrawl: false,
    canPublish: false,
    canMerge: false,
    canDeploy: false,
  });
}
