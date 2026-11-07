# KB-07C full-stack current-main integration rehearsal V8 — DRAFT / NO RELEASE

**Date:** 2026-11-07. **Purpose:** integrate the full KB draft code through the **unapplied** KB-07C approval-audit FK guard and current main into one independent CI/CodeQL regression. This is not real staging acceptance or a deploy/merge instruction.

### Frozen inputs
- Exact current main parent: `78464869c3be3306c654b07460dbae41f87e359b` (unchanged, no writes to it).
- Full KB-07C draft feature tree: `433bda0d50d6cf8eb98244eb92f9d7271842fcdf` from feature head `7244bf62823f7b037dd4abc41ff4205f59f97ac1`.
- Preserve current main's 4 later R2 files with exact blob SHAs:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md` `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs` `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs` `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs` `371e85213fe38e77202ebff165acbfb1f8441564`

### Rehearsal verification
- CI: disposable PostgreSQL KB-07C real FK restriction, unchanged KB consent/session/readiness regressions, finance/CRM, TypeScript, Next.js build, knowledge and refund browser suites.
- CodeQL: JavaScript/TypeScript security analysis.
- Exact head must pass both complete checks. The branch is a reviewable overlay, not a merge decision.

### Blocking dependencies
- KB-07C SQL is **DRAFT ONLY / UNAPPLIED**. It prevents silent approval audit loss on direct document deletes, but may block legitimate content/quote erasure until independent retention/legal governance. Organization deletion cascades and backups/downstream copies remain outside scope.
- No dedicated isolated Supabase staging project connected: only Production and Recovery Rehearsal, both forbidden for KB tests/migrations. Project cost quote is awaiting explicit owner confirmation.
- GitHub environment reviewer protections unverified and registration PR #602 draft/unmerged.
- The 16 independent KB-04E staging acceptance cases remain **0/16 verified**; no real Auth or consent evidence.
- No production feature flags, customer tracking, source crawl, AI/provider call, user-data access, hosted SQL, cleanup, merge or deployment.

**DRAFT / DO NOT MERGE** despite any engineering CI success.
