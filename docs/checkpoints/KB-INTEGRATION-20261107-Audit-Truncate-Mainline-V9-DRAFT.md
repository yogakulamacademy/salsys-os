# KB-07D full-stack current-main integration rehearsal V9 — DRAFT / NOT A RELEASE

**Date:** 2026-11-07. **Goal:** test the full KB draft engineering stack through KB-07D's audit-TRUNCATE guard on current main **without** any merge, hosted migration or real staging acceptance.

## Exact frozen inputs
- Current main parent (unchanged): `78464869c3be3306c654b07460dbae41f87e359b`.
- KB-07D draft feature head: `43f0075a1a6bd90fa600f0044c852864fb92f5d8`.
- Full KB feature tree: `7676dba0e267d6d3d7ccc454858f3bb0ebadecc8`.
- Direct main parent plus exact preservation of four later R2 comparator blobs:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md`: `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs`: `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs`: `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs`: `371e85213fe38e77202ebff165acbfb1f8441564`

## Engineering verification only
- Real **disposable local PostgreSQL** source-extracted KB-06B/06C immutable row triggers and exact KB-07D DRAFT SQL; confirm original consent DELETE is blocked by trigger, baseline audit TRUNCATE bypass, added statement-level guard blocks direct and cascading TRUNCATE.
- Preserve KB-07C approval audit RESTRICT draft test, KB-06H Auth session-binding synthetic tests, knowledge readiness, financial and CRM regressions.
- Full TypeScript, Next.js build, CRM/Knowledge Builder/refund Playwright and CodeQL at exact rehearsal head. Record PASS only once complete. No self-reported result permits rollout.

## Unchanged blockers
No approved isolated staging project (only Production and Recovery Rehearsal), no independently witnessed protected GitHub environment, no approved consent text or purpose-specific retention/deletion periods. The [registration-only stub PR #602](https://github.com/yogakulamacademy/salsys-os/pull/602) is itself draft/unmerged. KB-04E still **0/16** independently accepted. This draft cannot grant consent, change flags, crawl, use a provider, delete/publish knowledge, merge or deploy.

**DRAFT / DO NOT MERGE**, even if every synthetic CI and CodeQL job passes.
