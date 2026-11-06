# KB-02D — Admin Evidence Review Preview (DRAFT)

Date: 2026-11-06
Repository: yogakulamacademy/salsys-os
Branch: feature/kb02d-evidence-review-preview
Parent: feature/kb02-source-evidence-core / Draft PR #544

## Delivered

- A clearly marked synthetic HTML5 fixture is parsed into source-linked evidence. No public-site fetch or customer data.
- Owner/admin-only preview at /settings/knowledge/evidence-preview, using the existing server-side requireAdminWorkspaceAccess gate.
- Source URL, retrieved timestamp, SHA-256 snapshot, heading path, exact source quotation, source-block position and quotation hash.
- Review-planning actions: mark for later review, exclude, filter, undo and reset. Review status remains unreviewed.
- All choices are in-memory React state and are lost on navigation or reload. No approval, saving, publishing, or Co-Pilot integration.
- A link from Knowledge Settings is visible only when can_manage_organization is true. Route authorization remains independent.
- Pure review-choice helpers reject forged and unverified source identities. Publishable and canPersist are always false.
- Synthetic tests for review decisions and browser interactions, including disabled publishing, zero knowledge API writes and mobile layout.

## Consent and retention: open decisions, not invented policy

There is no approved retention or deletion policy for new website evidence, so storage stays disabled.
Release decisions still required:

1. Which organization roles may authorize extraction/storage and how consent is recorded, scoped and withdrawn.
2. Whether raw HTML is ever stored, versus only the quotations, citations and hashes.
3. How long evidence, versions, failed extraction logs and audit records are retained.
4. How erasure works on withdrawal, ownership expiration, source removal and account deletion.
5. Owner/admin review permissions, audited transitions, RLS isolation, and conflict handling.
6. Treatment of stylesheet/JavaScript hidden content, which static HTML cannot conclusively identify.
7. How AI drafts will cite evidence and ensure pricing, policies and dates cannot silently become approved.

## Explicit exclusions and release gates

No database migration, new evidence persistence, autonomous AI generation,
knowledge approval, model calls, public website crawl, deployment, merge,
customer messages, or tracking activation.

KB-02C and KB-01 remain stacked draft work. Before production: verify newest-head
CI, establish and test consent and retention, validate isolated staging,
reconcile newer main changes, and obtain explicit approval to merge/deploy.
