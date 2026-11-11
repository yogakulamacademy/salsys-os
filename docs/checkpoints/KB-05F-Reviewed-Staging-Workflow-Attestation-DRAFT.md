# KB-05F — Reviewed Staging Workflow Attestation (DRAFT)

**Date:** November 6, 2026  
**Stacked on:** CI-validated KB-05E Draft PR #575, not `main`.  
**Branch:** `feature/kb05f-staging-workflow-review-gate`

## Safety gap and scope

KB-05D's manually dispatched workflow names the GitHub environment `kb-isolated-staging-acceptance`. GitHub can allow creation of an environment without required reviewers when it has not been configured. Therefore, **declaring an environment name is not proof of independent human review, branch protection or project ownership.**

KB-05F makes an **absent or misconfigured environment fail closed before any staging Auth sign-in**. It does NOT itself verify the GitHub environment's reviewer settings, independently validate project ownership, sign approvals, or grant release permissions.

## Implemented

- New pure `scripts/verify-kb-staging-workflow-attestation.mjs` checks: 
  - Environment-only owner readiness variable must exactly equal `OWNER_APPROVED_KB_TEST_ENVIRONMENT`.
  - Approved commit, actual checked-out Git SHA and GitHub-trigger SHA must be the **same exact 40-character lowercase hex commit SHA**.
  - Approved reviewed branch ref and GitHub-trigger branch ref must match exactly and have a bounded branch syntax.
  - Operator-supplied staging project reference must equal the **protected environment's** 20-character staging project reference.
  - Every successful report still states that environment protection, independent reviewer approval and project ownership are **not independently verified**; no runtime or production authorization is conferred.
- The KB-05D verifier now executes this preflight even when directly invoked or imported, *before any HTTP request*. Its validated config remains immutable and tracked by a private `WeakSet`, preventing a caller from substituting a URL.
- The manual `.github/workflows/kb-isolated-staging-readonly.yml` now fails closed unless an exact pre-reviewed commit and ref are configured via environment variables. It checks the actual `git rev-parse HEAD` after checkout, then repeats the same check in the executable staging runner.
- Additional `tests/knowledge-extraction/kb-staging-workflow-attestation.test.mjs` checks missing/forged variables, altered SHA/ref/project, immutable outcome, and direct-runner preflight bypass. Existing staging/JWT tests now use a synthetic approved-environment fixture; all normal CI remains fully offline.

## Protected GitHub environment setup — not performed

The administrator must explicitly create `kb-isolated-staging-acceptance` and configure:

1. Required reviewer(s), with self-review prevented wherever supported.
2. Restrict allowed deployment branches/tags to an independently reviewed staging branch. Do **not** assume the workflow YAML alone enforces environment protection.
3. Store **environment-scoped** variables `SALSYS_KB_STAGING_ENVIRONMENT_READY`, `SALSYS_KB_STAGING_APPROVED_COMMIT` (exact approved checkout SHA), `SALSYS_KB_STAGING_REVIEWED_REF` (exact `refs/heads/...`), plus the KB-05D project URL/ref and fixture IDs.
4. Store KB-05D anonymous API key and **test-only** account emails/passwords as environment-scoped secrets. Never use service-role/admin JWTs, production/recovery projects or actual customer documents.
5. Re-review the exact commit and re-set the approved SHA on *every* code change. Preserve the ability to revoke environment access and rotate credentials.
6. Have a separate authorized operator enter the explicit KB-05D approval phrase and project ref when manually dispatching the workflow.

**Do not run the manual workflow merely because this draft's CI is green.** GitHub reviewers, ownership, spending limits, and tenant fixtures must be independently witnessed first. The repository's regular pull-request/push CI cannot start the manual staging flow.

## Trust and release boundary

This check verifies that **supplied configuration values are consistent**. It is not a cryptographic signature of human approval, cannot inspect GitHub environment policy settings, and cannot prove that an arbitrary alternate Supabase project is truly an approved isolated staging instance.

The existing KB-04E 16-scenario real staging acceptance remains open. No website fetching, provider calls, production database access, real staging sign-ins, customer evidence storage, knowledge writes, approval actions, merge or deployment were performed for this checkpoint.

## CI acceptance

Pass the exact-head source/unit tests, TypeScript, full Next.js build, Chromium browser regression and disposable PostgreSQL suite. Do not call this checkpoint technically validated until both GitHub Actions jobs conclude successfully.
