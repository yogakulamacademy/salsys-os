# KB-11A — Discovered-page draft, consent-atomic local SQL review candidate

**2026-11-08 | DRAFT ONLY | STAGING ON HOLD | NO HOSTED MIGRATION | NO MERGE**

This follows the cumulative KB-10 draft [PR #666](https://github.com/yogakulamacademy/salsys-os/pull/666), which must remain **DRAFT / DO NOT MERGE**. The `KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED` runtime switch remains OFF by default. No hosted project, Auth account, customer evidence, crawler, model, consent activation, charge, merge or deployment is authorized.

## Scope of the candidate

- `docs/sql/KB-11A-consent-atomic-discovered-draft-REHEARSAL-DRAFT.sql` is guarded by a random disposable **localhost-only synthetic database name and fixture prerequisites**, not placed in `supabase/migrations`. It implements the proposed `public.create_discovery_review_draft_with_current_consent_v1(uuid,uuid,text,text,text)` **only** in local CI.
- A SECURITY DEFINER, authenticated-only function checks a live, revocable tenant-admin Auth session via the earlier `kb_discovery_consent_actor_v1`; never permits a service-role EXECUTE path; accepts no client-provided source URL, source name, proof, consent, actor or approval flag.
- The stored configured website, completed/partial discovery job, fetched HTTP-200 HTML page, exact tenant/host, current domain proof, reviewed policy registry, grant audit digest and current purpose-specific consent are read in the **same database call**.
- Job is locked before the consent row, preserving the audited withdrawal lock order. Consent is locked through the insert of source + draft document + chunk, so withdrawal cannot commit ahead of the draft while this function holds the consent lock. All three writes roll back on error; no approval/audit approval row is created.
- Source metadata identifies the stored page, job and current consent revision; the human-typed content explicitly remains **UNVERIFIED** and **DRAFT**. It is not fetched website evidence, an AI-produced claim, an approval, or publication.

## Local regression surface

The new `tests/database/knowledge-discovery-atomic-draft.test.mjs` uses its own randomly created, forcibly auto-dropped, localhost-only PostgreSQL database with synthetic organizations, two sessions/tenants and the earlier discovery/consent SQL. It tests: authenticated grants versus anonymous/service denial; unauthorized role, cross-tenant and mismatched-session failures; exact page/job/URL/status/HTTP-type checks; input validation; policy digest mismatch; expired proof; prior consent withdrawal; no approval insertion; rollback when a chunk insert raises an exception; and no post-denial source/document/chunk leakage.

**These are synthetic engineering regressions, not any of the 16 witnessed staging acceptance cases.** Exact-head full CI and CodeQL must be checked separately. Do not interpret a previously green run as verification of this new code.

## Required independent review / unresolved design decisions

1. **DBA:** Re-author this into a versioned, dependency-ordered migration only after inspecting the actual target schema, real function owner, default `EXECUTE`, Data API exposure, source/document/chunk constraints, RLS, bypass roles, GRANT/REVOKE order, session bindings and transaction timeouts. Do **not** copy the disposable guard or fixture directly to hosted SQL. Signed approval of exact SHA is required.
2. **Security:** Confirm read-lock order across all job/proof/consent/website mutations; inspect deadlocks under real workloads. This only guarantees ordered SQL operations under row locks, **not validity at physical COMMIT when a transaction is held past a proof/consent expiry**. Decide an explicit expiry guarantee before release, then rehearse it. Verify SSRF, proof-token, trust boundary, and priv-write restrictions separately.
3. **Privacy/legal:** Decide whether the policy `grants_enabled` switch must block **new draft writes** as well as new grants. Approve the lawful purpose, citation/data retention start/period, human-entered text classification, source URL/page/consent linkage, offboarding, audit and the erasure behavior for drafts, sources, chunks and all copies after withdrawal. **This candidate deliberately DOES NOT delete prior drafts on withdrawal.** Do not invent durations or legal signoffs.
4. **Product:** Define whether multiple independently reviewed manual drafts for the same source page are permitted or need an idempotent page/document version contract. Define handling of website edits, sources no longer visible, and post-onboarding refresh history without automatic approval. Real rendered-browser provenance and automatic drafts are **not production-enabled**.
5. **Independent owner/reviewer:** Keep release issue #601 BLOCKED and #612/#613/#614 open. Require named independent security/privacy/DBA approvals and explicit budget approval for future isolated staging. No merging/repointing `main` or co-opting Production/Recovery as staging.

## Rollback policy (review only)

On any failure: keep discovery pilot and atomic-draft feature flag OFF, disable new collection/claims, preserve audited withdrawals and existing manual knowledge. Do **not** restore service-role direct DML or generic `create_source_backed_knowledge_document_v2` fallback. Do **not** DROP CASCADE or delete source data without separately approved retention/deletion design. A later compatible schema can remain in place inert while release is held.

**Current release ledger: 0/16 real independent staged witnesses. STAGING ON HOLD. Production unauthorized.**
