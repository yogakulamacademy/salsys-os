# KB-06G Full-Stack Mainline Integration V6 — DRAFT REHEARSAL ONLY

**Date:** 2026-11-07. **Purpose:** Confirm synthetic source/security integration for KB-01 through KB-06G against the current `main`, with no deployment or data mutation.

## Exact frozen inputs

- `main`: `78464869c3be3306c654b07460dbae41f87e359b`.
- KB-06G stacked source: `be95eeb36e87a3428a53f9e838e085eafbf06fe8`.
- Merge base before the draft KB stack: `8cfb9571e9ce31f145313c1cf99ce18117abb57d`.
- This rehearsal branch was created **from current main as the direct commit parent**. The complete KB-06G source tree was overlaid while preserving all four later R2 comparator/documentation blobs exactly:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md` — `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs` — `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs` — `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs` — `371e85213fe38e77202ebff165acbfb1f8441564`

## Technical validation expected

Run and independently verify the exact-head GitHub Actions CI database and validate jobs, including the new KB-06G knowledge table/FK inventory test, all earlier KB-06F no-network consent session regressions, TypeScript, Next.js build, CRM/Knowledge Builder/refund browser suites. Run and verify CodeQL security analysis. Record exact job URLs and final conclusion on the draft PR.

## Retention findings and release boundary

Existing knowledge document deletion cascades to **knowledge approval audit history**, which requires a separate governance decision before any destructive implementation. The two KB-06C page/job deletion targets are **unapplied draft metadata erasure only**, not approved text/quotation/chunk deletion. Approved duration is **unknown**, audit rights requirements and external backups/logs/provider retention are unverified.

No dedicated independently approved staging project, no real Auth tenant A/B acceptance, no reviewed legal notice/retention policy, and **0/16** independently verified KB-04E staging scenarios. All KB consent grant, discovery, erasure and publishing flags must remain disabled.

No production/recovery writes, Auth logins, SQL migration application, live crawl, payment/provider sends, AI generation, publish, merge or deployment. Keep **DRAFT / DO NOT MERGE** even with green synthetic CI.
