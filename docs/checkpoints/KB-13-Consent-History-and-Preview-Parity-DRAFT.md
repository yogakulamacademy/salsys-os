# KB-13 — Source-to-Draft Eligibility and Historical Consent Guard (DRAFT)

**2026-11-08 · engineering-only · no hosting, migration, production or staging authorization**

Consolidated review: [PR #666](https://github.com/yogakulamacademy/salsys-os/pull/666). Parent release gate: [#601](https://github.com/yogakulamacademy/salsys-os/issues/601). External reviewers: [#612](https://github.com/yogakulamacademy/salsys-os/issues/612), [#613](https://github.com/yogakulamacademy/salsys-os/issues/613), [#614](https://github.com/yogakulamacademy/salsys-os/issues/614).

## Engineering gaps addressed

1. The read-only `eligibleDiscoveredPageForManualDraft` preview previously accepted any `fetched` HTTP 200 status, including non-HTML types, and compared only the seed's origin instead of the exact root URL. The disposable SQL writer already required a completed/partial job from the configured HTTPS host root and `text/html` / `application/xhtml+xml` media type. KB-13A now mirrors those requirements before presenting a manual draft.
2. The disposable consent-atomic draft SQL previously checked a **current** grant, but had no explicit rule forbidding a page whose job predates the grant. This permitted accidental reuse of pre-grant discovery metadata under a later consent. KB-13B now denies `job.created_at < consent.granted_at`, and denies `consent.revision != 1` pending a separately designed and approved regrant protocol. The signed preview mirrors both checks.
3. Negative tests cover PDF/plain text, invalid media type, non-root seed, malformed scan date, pre-grant job, and unreviewed future consent revision, in addition to earlier tenant/role isolation, revocation, proof/policy expiry and write rollback.

**Important limitation:** This is a metadata-based consent boundary, not evidence that actual website text was fetched or authorized at that instant. The discovered-page draft still accepts only manually entered unverified content and returns a review-only draft. No automatic approval, model call or publication is introduced. PostgREST RLS, true Auth sessions, legal policy, source erasure and physical transaction-COMMIT expiry require an independent release review.

## Regrant policy deliberately blocked

The current local contract supports the original consent grant (revision 1). A later product design may need true regrant after withdrawal, but it must specify fresh proof/consent audit binding, job creation after regrant, invalidation of earlier page snapshots, deletion/retention semantics, a separate signing protocol and review. Do **not** remove `revision=1` checking just to support regrant. No owner consent or legal policy has been inferred.

## Exact tests and release gates

- `tests/knowledge-discovery/discovered-page-manual-draft.test.mjs`: signed read-only preview parity and source eligibility tests (synthetic).
- `tests/database/knowledge-discovery-atomic-draft.test.mjs`: disposable-only PostgreSQL consent-atomic draft, wrong-host, job-age, consent-revision and concurrency tests.
- Local SQL `docs/sql/KB-11A-consent-atomic-discovered-draft-REHEARSAL-DRAFT.sql` is **not** an installable migration; it is forbidden on hosted databases by its test-database guard.
- CI + CodeQL results must be inspected on the **final exact commit SHA**. A green synthetic suite establishes only engineering test success.

The final external gates are unchanged: #612 independent code/database/security review and GitHub protection, #613 legal/DBA purpose/retention/erasure and COMMIT-expiry decisions, #614 post-revenue explicitly approved isolated staging scope/cost, and #601 all 16 real signed-user independently witnessed acceptance scenarios, reviewed migrations, protected merge, deployment and rollback.

**State:** STAGING ON HOLD; 0/16 real acceptance witnesses; PR DRAFT; no main merge, hosted SQL or live source traffic. Never claim 100% production release closure from this engineering checkpoint.
