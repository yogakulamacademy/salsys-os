# KB-04E — Isolated Staging Acceptance Ledger (DRAFT)

**Date:** 2026-11-06  
**Branch:** `feature/kb04e-isolated-acceptance-ledger`  
**Parent:** KB-04D Draft PR #567, stacked on KB-04C Draft PR #565, KB-04B Draft PR #563 and unmerged earlier KB proposals.

## Scope of this checkpoint

This checkpoint **does not complete real-world acceptance**. It supplies a fail-closed, deterministic **inventory of required staging scenarios** with a read-only summary in the existing admin-only synthetic evidence preview. It accepts only *self-reported, external test-result claims* and treats **all** of them as unverified. The system never autonomously establishes tenant ownership, consent, legal retention, deletion performance, provider truth, or deployment authority.

New pure function: `assessStagingAcceptanceLedger`, in `lib/knowledge-extraction/staging-acceptance-ledger.ts`.

Its input requires an organization, a strict UTC evaluation time, optional non-authorizing KB-02E / KB-04B / KB-04D diagnostics, and a bounded list of optional staging evidence **claim pointers only**. Claims have scenario ID, tenant ID, isolated-run ID, strict UTC test time, SHA-256 external evidence digest, claimed observed outcome, reporter ID and the literal `evidenceOrigin='self_reported_isolated_staging'`.

The engine rejects unknown or duplicated scenario IDs, mismatched tenants, malformed/expired/future dates, unrecognized outcomes, invalid opaque evidence digests, invalid reporter identity **format**, and any forged upstream write/publish permissions. It cannot authenticate the reporter or independently inspect the external evidence at this stage.

## Required acceptance scenarios (16)

| Group | Required independent staging observation |
| --- | --- |
| Ownership / consent | Expired or revoked ownership denies new reads |
| Ownership / consent | Missing or wrong-purpose consent denies evidence and monitoring |
| Ownership / consent | Withdrawn consent prevents queued and further in-flight work |
| Tenant isolation | Tenant A cannot read tenant B evidence or knowledge |
| Tenant isolation | Tenant A cannot write tenant B evidence or approvals |
| Retention / audit | Approved retention expiry erases quotes and derived data |
| Retention / audit | Withdrawal and deletion have independently reconciled audit records |
| Approval / versions | Non-admin or unauthenticated claims cannot approve |
| Approval / versions | Stale document versions cannot overwrite later approved versions |
| Approval / versions | Any eventual human approval uses the existing audited actions |
| Network / operations | DNS/SSRF, redirects, robots and off-host requests fail closed |
| Network / operations | Rate limits, concurrency and global emergency stop work |
| Source / semantics | Browser-visible content reconciles with source quotations |
| Source / semantics | Real-model unsupported answers fail source grounding |
| Source / semantics | Changed and historical citations reconcile or remain held |
| Operational release | Isolated staging, monitoring and rollback are witnessed |

## Proposed isolated-staging execution procedure — NOT RUN

1. Arrange a dedicated **disposable** staging deployment/database, separate secrets, tenant A/B test actors and an explicit test-only domain. Confirm that current KB work does **not** have an execution path: no real source crawl or knowledge write endpoint has been enabled.
2. Obtain owner-approved, purpose-specific and time-limited staging test consent and domain proof before any test requiring real website access. Use an owned test fixture site; do not crawl unrelated domains.
3. Test the negative controls first: absent/expired consent, cross-tenant RLS, owner expiry, redirects and forbidden IP ranges, robots denial, global kill switch, quota exhaustion, unauthorized user and stale document version. Record expected denial and independently review server and database audit.
4. Only after security/consent readiness, rehearse retention expiration and withdrawal-triggered deletion over **synthetic staging data**, including original quotation, citation, derived proposal, queued job and audit trail. Check no residual user-visible data or prompt context.
5. Independently reconcile full browser-rendered visibility vs the extracted quote; test model refusals and unsupported/sensitive/conflicting claims on a purpose-built fixture. Do not use customer information with real LLMs without separate approval.
6. Trace provenance and version coverage into the existing knowledge approval workflow; verify that no alternate or automatic approval path can bypass owner/admin review.
7. Rehearse rollback and repeat RLS/consent tests after rollback. Keep production off until the evidence is signed off by authorized security, data-governance and product owners.
8. Store **independent external** evidence and its digest in an authorized separate review system, **not** in this synthetic ledger. The ledger records only references; no evidence content, bearer token or personal data.

## Engineering validation

- Source: `tests/knowledge-extraction/staging-acceptance-ledger.test.mjs` verifies no-clause evidence, all 16 self-reported claims, contradictory results, duplicates, tenant crossing, stale/invalid date formats, forged upstream permissions, deterministic/no-mutation behavior.
- Browser: `tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts` ensures the 16-row acceptance inventory is visible after expanding, release remains blocked, the original Publish button is disabled and no knowledge request is issued.
- CI must pass source tests, `npm run typecheck`, full Next.js build, synthetic Playwright, and isolated PostgreSQL before this *engineering* draft is considered technically validated. Exact-head CI status must be checked independently.

## Hard-coded non-authorization

**Even if every one of 16 self-reported scenarios says it passed**, the report must still return:

```
status = blocked_pending_independent_staging_acceptance
parentProvenanceIndependentlyVerified = false
externalStagingResultsIndependentlyVerified = false
tenantIsolationIndependentlyVerified = false
consentWithdrawalIndependentlyVerified = false
retentionAndDeletionIndependentlyVerified = false
releaseApprovalIndependentlyVerified = false
canCrawl = false
canStoreEvidence = false
canCallAIProvider = false
canCreateKnowledge = false
canApproveKnowledge = false
canPublish = false
canMerge = false
canDeploy = false
```

A future, separately reviewed **authenticated and independently evidenced execution gate** would be necessary before any staging or production behavior is authorized. The ledger is not its substitute.

## Current result and non-actions

**Current evidence inventory: 0 independently validated out of 16 required scenarios**. No claimed staging evidence was supplied or verified. No PR targets main, and nothing was merged or deployed. No live crawling, AI-provider execution, retention deletion, database modification, knowledge approval or publication occurred in this checkpoint.
