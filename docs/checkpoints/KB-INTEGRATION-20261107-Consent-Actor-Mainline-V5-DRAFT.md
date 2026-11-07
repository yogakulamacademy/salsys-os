# KB-06F current-main integration rehearsal V5 (DRAFT / DO NOT MERGE)

**Date:** 2026-11-07. **Scope:** source/CI compatibility only; no environment, SQL or live Auth activity.

## Frozen inputs and exact source preservation

- Verified `main` SHA: `78464869c3be3306c654b07460dbae41f87e359b`.
- KB-06F latest stacked draft SHA: `52ca30d00c70dddcab0789f4ab10b65dbdd409e4`.
- Common ancestor: `8cfb9571e9ce31f145313c1cf99ce18117abb57d`.
- Since the shared ancestor, main changed only four R2 files. This branch uses main as the **actual parent** and overlays the entire KB-06F source tree with the exact four main blobs:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md`: `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs`: `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs`: `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs`: `371e85213fe38e77202ebff165acbfb1f8441564`

## Checkpoints

Run exact-head CI, disposable PostgreSQL, no-network staging actor regression, TypeScript, Next.js, synthetic CRM/Knowledge Builder/refund browsers, CodeQL. Preserve the original KB branches and historical integration PRs unmodified. Green synthetic CI is not a real staged Supabase Auth result.

## Blockers and non-actions

The *optional* KB-06F manual consent session check was NOT dispatched; a dedicated approved isolated staging project was NOT discovered. Its test requires genuinely bound owner/admin Auth sessions and may legitimately fail when that preparation is absent.

No real consent, policy approval, retention duration, quota change, live crawl, provider/AI call, customer data, publication, schema migration, production/recovery changes, merge or deployment. All 16 KB-04E independent acceptance observations remain unverified. Keep **DRAFT / DO NOT MERGE** even if all CI and security checks pass.
