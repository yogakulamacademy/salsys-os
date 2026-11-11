# KB-02E — Tenant Consent and Evidence Retention Readiness (DRAFT)

Date: 2026-11-06
Repository: yogakulamacademy/salsys-os
Feature branch: feature/kb02e-evidence-lifecycle-contract
Parent: KB-02D Draft PR #547, itself stacked on KB-02A–C PR #544 and KB-01 PR #538

## Objective

Prepare a fail-closed **requirements assessment**, not a storage implementation.
No person or system has approved actual customer-content retention periods,
deletion rules, consent scope, or production ingestion activation.

## Implemented

- Pure, no-side-effect readiness assessor at
  `lib/knowledge-extraction/evidence-lifecycle-readiness.ts`.
- Nine explicit gates: authenticated owner/admin access, tenant binding,
  exact HTTPS verified source, live domain ownership, explicit extraction
  consent, approved source-quotation retention, tested withdrawal/deletion,
  tested audit trail, and dedicated staging/RLS acceptance.
- Consent records must be scoped to the same organization and exact host,
  expressly grant `website_evidence_review`, identify an issuing user,
  carry a recorded version, and be unexpired. Pending/denied/withdrawn and
  expired consent fail closed.
- Retention records must be explicitly approved with a defined positive
  integer number of quote-retention days. No retention duration is invented.
  Raw HTML remains forbidden by this checkpoint even if future customers
  request it; broader storage requires separate evaluation.
- A fully satisfied **synthetic** input can only reach
  `eligible_for_review_only`: `canStoreEvidence`,
  `canStoreRawHtml`, and `canPublishKnowledge` are **always false**.
  The function does **not** issue permissions, persist values, or replace
  database transaction checks.
- Existing admin-only synthetic evidence preview now displays a collapsed,
  read-only list of nine requirements. It explicitly says no live tenant
  policy has been loaded. Publishing remains disabled.
- Tests verify missing configuration, cross-tenant cases, revoked/expired
  consent, lookalike/wrong-host or HTTP URLs, missing retention, absent
  deletion/audit rehearsals, and false-positive permission prevention.
- A Playwright fixture tests the displayed prerequisite list and the
  disabled publish control.

## Consent / retention decisions still needed

1. Formal authorization and consent capture/withdrawal rules.
2. Whether content other than citations/quotes may be retained.
3. Exact quote-retention duration, retention scheduler, and version limits.
4. User/account/tenant erasure, source correction and audit retention.
5. Scope, access controls, tenant-bound RLS, audit transitions and roles.
6. Browser computed-visibility/accuracy policy for source evidence.
7. Staging-only migration/rollback plan and live authenticated acceptance.

These are **approval questions**, not assumed defaults. None of the new
code enables a write or applies a migration.

## Acceptance and remaining work

- Check latest-head CI, TypeScript, Next.js build, Playwright and database
  tests before calling KB-02E validated.
- A future genuine server-side ingestion route must independently validate
  authenticated tenant role, consent, source, retention, and ownership in
  an atomic tenant-bound database transaction. **Do not use these diagnostic
  values as an authorization token.**
- KB-01 dedicated staging and public HTTPS test site are still missing.
- No merge, production migration, deployment, real customer crawl, evidence
  storage, AI generation, knowledge approval, or customer messages.
