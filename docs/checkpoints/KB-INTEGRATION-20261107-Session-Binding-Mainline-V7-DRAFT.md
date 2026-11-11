# KB-06H full Knowledge Builder current-main integration V7 — DRAFT / NO RELEASE

**Date:** 2026-11-07. **Purpose:** engineering regression of the full KB-01…KB-06H draft code, not real staging acceptance or authorization to deploy.

## Exact frozen inputs and preservation
- Current main parent: `78464869c3be3306c654b07460dbae41f87e359b`.
- KB-06H draft feature head: `c27a68a421db4ba8f7021c035ee076201a3dbe12`.
- Common ancestor before this feature stack: `8cfb9571e9ce31f145313c1cf99ce18117abb57d`.
- Full feature tree composed atop main as **direct parent**, restoring exact main blob versions of the four newer R2 comparator files:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md` — `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs` — `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs` — `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs` — `371e85213fe38e77202ebff165acbfb1f8441564`

## Validate on exact head
- Disposable local PostgreSQL, all synthetic KB consent/erasure/review tests, new KB-06H pre-bind and post-logout security tests.
- TypeScript, Next.js build, shared CRM/Knowledge Builder/refund browser regression suites.
- CodeQL JS/TypeScript scan.
- Require exact run SHAs and complete successful conclusions, then record in draft PR without claiming production acceptance.

## Hard release blockers
The separate KB-06H manual test runner **would create TWO test tenant-session binding rows** if an operator independently approved it in a dedicated project. This integration rehearsal does **not** dispatch the workflow or issue Auth tokens. Only Production and Recovery Rehearsal are currently visible, both denied as staging. No staging environment reviewer confirmation, no real tenant A/B Auth evidence, no approved owner consent/policy text, no approved quote/derived retention and erasure, and **0/16 independently verified KB-04E staging scenarios**.

No project provisioning, SQL application, user logins, customer data access, crawling, AI/provider calls, knowledge publishing, PR merge or deployment. All feature flags default OFF. **DRAFT / DO NOT MERGE** despite green synthetic CI.
