# KB-06C — Revoked Discovery Metadata Erasure (DRAFT)

**Date:** November 6, 2026  
**Parent:** KB-06B draft PR #586; this checkpoint is stacked, **not based on main**.  
**Release:** OFF; unapplied SQL; no production/recovery or customer testing.

## Exact scope

A missing protection remains after KB-06B: withdrawing discovery consent stops new work but does not remove the historical **discovery job/page metadata** (URLs, page titles, HTTP statuses and discovered links). This checkpoint adds one **explicit, after-withdrawal erasure** mechanism for these records only. No raw HTML or source quotations are stored in the KB-01B discovery tables.

**This is not evidence/quotation retention policy, account erasure, or complete GDPR deletion.** Evidence, AI proposals, approvals, audit retention, backups, tenant removal and lawful retention decisions are separate unapproved requirements. **No retention days or automatic scheduler are invented.**

## Proposed database behavior

- `docs/sql/KB-06C-revoked-discovery-metadata-erasure-DRAFT.sql` depends on the **unapplied** KB-01B, KB-06A and KB-06B drafts. It is not in the live migration directory.
- New narrowly exposed `erase_knowledge_discovery_metadata_v1(organization, exact_hostname, expected_revision)` invokes KB-06B's strict live `auth.sessions` + `tenant_session_bindings` owner/admin check. No client-supplied actor/session is accepted.
- Acquires matching discovery job locks before the consent lock, matching page-commit/withdrawal ordering. Denies requests while any matching job is queued/running. Checks that consent was explicitly **withdrawn**, the revision still matches and the immutable withdrawal audit exists.
- Deletes only `knowledge_discovery_pages` and `knowledge_discovery_jobs` for that tenant and exact HTTPS hostname in one transaction. Other organizations and hosts are untouched. The withdrawn consent and grant/withdrawal audits remain unchanged, so erasure cannot enable silent re-consent.
- Adds `knowledge_discovery_metadata_erasure_audit`: actor, live session, tenant, host, consent revision, counts, timestamp. Append-only trigger, strict session-bound read RLS, unique erasure per consent revision and no direct authenticated writes. No page URLs, raw content, provider secrets or message bodies in the audit.
- Replays and stale revisions return a denial. SQL errors roll back the entire deletion and audit insertion.

## Proposed API

`POST /api/knowledge/discovery/erasure` is **disabled unless**
`KNOWLEDGE_DISCOVERY_METADATA_ERASURE_ENABLED=true` is explicitly configured.
It requires same-origin request, bounded JSON, canonical exact host, withdrawn revision, server-validated signed-in owner/admin, and a caller-authenticated RPC. No service-role writes or arbitrary tenant identifiers. The API does not expose the archive/retention policy as an adjustable slider.

This flag must **not** be enabled in Production or Recovery Rehearsal. A dedicated staging environment and independent authorization are required before applying draft SQL or invoking any deletion.

## Verification and limitations

- An amended `tests/database/knowledge-discovery-consent-lifecycle.test.mjs` applies **exactly** KB-01B → 06A → 06B → 06C SQL on a disposable, local-only PostgreSQL fixture. It exercises denied unbound/cross-tenant/employee/anonymous access; before-withdrawal refusal; stale revision; scoped deletion; tenant B survival; immutable erasure audit; replay refusal; and revoked-session denial.
- `tests/knowledge-discovery/metadata-erasure-route.test.mjs` uses no-network mocked HTTP/Auth for default-off, origin, exact host, RBAC, proper RPC scope and denial.
- CI must pass both isolated PostgreSQL and application validation **on the exact head commit** before engineering validation is claimed.

Remaining before any real acceptance: independently approved policy and user-facing consent presentation; dedicated protected staging project with two real synthetic tenants; real Auth/RLS/erasure reconciliation; quotation/evidence retention and derived-data erasure design; rollback and all **16** KB-04E scenarios.

**Never infer that deleting discovery metadata deletes future quote/evidence tables.** No real user content is accessed, crawled, published or erased by this draft.
