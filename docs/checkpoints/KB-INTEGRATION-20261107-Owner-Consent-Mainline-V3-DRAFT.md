# Knowledge Builder — KB-06D complete-stack latest-main rehearsal V3 (DRAFT)

**Date:** 2026-11-07. **Status:** Integration regression only, NOT authorized to merge/deploy.

## Frozen inputs and construction

- Checked current main: `78464869c3be3306c654b07460dbae41f87e359b`.
- Latest standalone KB draft stack: `6d5464eb22604dd20d4462038edbde08bd9c8ba0` (KB-01 through KB-06D, including owner/admin consent review page).
- Original shared ancestor: `8cfb9571e9ce31f145313c1cf99ce18117abb57d`.
- Main introduced nine later commits touching only four R2 offline comparator/test/doc files. All four current main blob SHAs were explicitly overlaid into the complete KB-06D source tree, then committed on a fresh branch **whose direct parent is current main**:
  - `docs/checkpoints/R2-P2-Offline-Aggregate-Comparator-v1.md` — `9bc7c7791bf40f4cbc2afc0d4d27c65b55942b2b`
  - `scripts/r2-p2-compare-review-figures.mjs` — `ae07af1eb8c35b1db1cf7c63b9627a3a7a46d89d`
  - `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs` — `4fd44536c4817cca0b4d9530c46a44451dd186db`
  - `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs` — `371e85213fe38e77202ebff165acbfb1f8441564`

The integration branch was independently compared to main: ahead 1, behind 0 immediately after construction. Earlier KB branch PRs and historical integration PRs #582 and #589 are unchanged; no force-push or production edit.

## Required tests

GitHub Actions CI must validate the exact new head: disposable PostgreSQL KB-01B/06A/06B/06C, review-only consent route tests, TypeScript, Next.js, synthetic CRM, Knowledge Builder browser tests including KB-06D and refund regressions. CodeQL must also pass. Record exact commit and workflow IDs only after verified completion.

## Not proven / hard blocks

- The operator-approved legal consent notice, owner grant UX, policy registry approvals, actual purpose-limited live consents and approved evidence retention/deletion plans do not exist as accepted artifacts.
- No dedicated independently approved Supabase staging project, real owner/admin Auth session / tenant A-B proof, real browser-visible extraction reconciliation or 16 independent KB-04E acceptance scenarios (0/16).
- Consent read, grant and metadata erasure flags must remain OFF in Production and Recovery Rehearsal. KB SQL remains unapplied draft.
- No merges, website crawl, customer content ingestion, AI generation, knowledge publishing, payment/provider calls, production changes or deployment in this integration rehearsal.

**Integration CI is only engineering evidence, not staging/production release authorization.**
