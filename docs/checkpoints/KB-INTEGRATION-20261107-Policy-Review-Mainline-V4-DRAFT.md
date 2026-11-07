# KB-06E full-stack current-main integration rehearsal V4 — DRAFT

**Date:** 2026-11-07. **Status:** engineering regression only, not an acceptance/merge/deployment authorization.

## Exact frozen inputs and file preservation

- Current main: `78464869c3be3306c654b07460dbae41f87e359b`.
- Full Knowledge Builder draft stack through KB-06E: `6c5b54e2ab2c2d62e0ba6b4db07a49b7b577f3c7` (including the KB-06E immutable policy text, guarded RPC, API, read-only UI and tests).
- Common ancestor: `8cfb9571e9ce31f145313c1cf99ce18117abb57d`.
- The nine newer mainline commits modify only four R2 comparator/test/documentation files. The branch was constructed **from main as direct commit parent**, then the complete KB-06E tree was overlaid with the exact main blob versions:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md`: `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs`: `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs`: `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs`: `371e85213fe38e77202ebff165acbfb1f8441564`
- Initial GitHub compare: ahead one / behind zero against main; adding this documentation produces a second ahead commit. No old draft PR or mainline changes were rewritten.

## Technical validation (requires exact-head GitHub check)

Run CI `financial-database` (exact KB-01B/06A/06B/06C/06E SQL and security tests in local disposable PostgreSQL) and `validate` (no-network policy route tests, TypeScript, Next.js, CRM/Knowledge Builder/refund browser suites), plus CodeQL. Record job conclusions and the exact tested SHA on the draft PR only when successful.

## Absolutely not release acceptance

Matching a policy document's hash and current registry row is **NOT** independent proof of legal notice approval or valid customer consent. The draft contains **no actual operator-approved policy text**; grants remain OFF. No retention duration or comprehensive derived-evidence deletion has been approved, and there is no verified dedicated staging Supabase project. All **16 KB-04E independent real staging scenarios remain unverified**. The connected Production and Recovery Rehearsal projects are NOT staging.

No DB migration, consent registration/grant, website fetch, customer record read/write, AI/provider call, knowledge approval/publishing, deployment or merge is authorized or performed. Keep PR **DRAFT / DO NOT MERGE** regardless of CI.
