# KB-INTEGRATION-V2 — Entire Knowledge Builder Draft Stack vs 2026-11-06 Main (REHEARSAL ONLY)

**Status:** Draft, not a deployment, migration, merge or authorization.

## Frozen integration inputs

- Latest checked main commit: `78464869c3be3306c654b07460dbae41f87e359b`.
- KB stack head: `ed118d8c6dd156f4cd4dd087981b271ebb4eff92` (includes original Knowledge Builder, KB-06A, KB-06B and KB-06C).
- Common ancestor: `8cfb9571e9ce31f145313c1cf99ce18117abb57d`.
- Old integration rehearsal PR #582 only validated earlier KB drafts, before the KB-06A/B/C additions.
- The mainline commits since the common ancestor changed **exactly four R2 comparator/readiness files**, as independently checked through GitHub comparison:
  1. `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md`
  2. `scripts/r2-p2-compare-review-figures.mjs`
  3. `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs`
  4. `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs`.

## Rehearsal construction and preservation

This branch was created at the latest checked **main commit**, then an integration-only commit used the KB-06C complete source tree with the *exact four newer mainline blob SHA versions overlaid*; parent was the real main commit. The resulting branch was confirmed by GitHub comparison as **ahead 1 / behind 0 against main** with the complete Knowledge Builder changes visible. Nothing was committed onto main. All older draft PR branches are unchanged; older PR #582 is kept as a historical rehearsal rather than force-updated.

## Acceptance boundary

CI, TypeScript, Next.js, disposable PostgreSQL, synthetic browser suites and security scans may establish **engineering compatibility only** at the exact tested SHA; failures need diagnosis before any technical pass claim. Real staging approval, actual consent UX, policy/version review, retention, metadata erasure/recovery, Auth sessions, tenant A/B RLS and all 16 KB-04E independent staging observations are not proven by synthetic tests.

No Supabase Production or Recovery Rehearsal SQL or configuration; no provider calls, crawl, user/customer data access, evidence storage, AI publication, merge, or deployment. Consent grant and metadata erasure remain disabled by default. Keep this PR **DRAFT / DO NOT MERGE** even if all engineering CI is green.

## Follow-up

When engineering CI passes, record the **exact integration HEAD**, relevant workflow runs and changed-main check on the draft PR. Do not call this a production release or mark any real staging scenario complete.
