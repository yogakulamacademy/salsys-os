# KB-07E full-stack current-main integration rehearsal V10 — DRAFT / NOT A RELEASE

**Date:** 2026-11-07. This is a GitHub-only engineering integration check; **no** hosted data, migration, staging Auth, provider call, AI response, source crawl, consent grant, deployment, or release authorization.

## Frozen source contract

- Exact `main` parent (no writes to main): `78464869c3be3306c654b07460dbae41f87e359b`.
- KB-07E draft stacked feature head: `bedcb8db379039efac34ed6bbacd64d65ee532d2`.
- Full KB-07E tree: `23d1fb42da1289e02adbc201503e80920b7ee836`.
- Four later `main` R2 comparator blobs retained EXACTLY:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md` at `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs` at `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs` at `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs` at `371e85213fe38e77202ebff165acbfb1f8441564`

## Added KB-07E capability

A **manual, offline** local evidence file SHA-256 preflight using the established KB-04E 16-scenario catalog. Does not send raw evidence anywhere or establish witnessed test provenance. Rejects tampered/missing/symlinked/oversized evidence and forbidden Production/Recovery project refs, but *matching hashes are only integrity checks*. CLI never prints tenant IDs, full paths or evidence bytes. Correct hashes, even for all 16, **never** enable `canDeploy`, `canMerge`, `canCrawl` or otherwise confer release readiness.

Independent real staging verification remains **0/16**, and there is no approved isolated staging project, protected GitHub reviewer configuration, approved retention duration or privacy/legal consent notice. GitHub registration-only stub PR #602 and all knowledge PRs remain draft. Owner has not approved staging project recurring billing.

## Rehearsal verification

Full exact-head CI + CodeQL to be recorded only after completed, including KB-07E source/CLI regression, KB-07D actual disposable PostgreSQL TRUNCATE guard, KB-07C audit FK guard, prior strict Auth/consent regressions, TypeScript, Next.js build and CRM/Knowledge Builder/refund Playwright tests. This does not change any real KB-04E acceptance count.

**DRAFT / DO NOT MERGE**.
