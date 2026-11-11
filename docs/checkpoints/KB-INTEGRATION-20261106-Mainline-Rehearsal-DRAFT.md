# Knowledge Builder — Current Mainline Integration Rehearsal (DRAFT)

**Date:** 2026-11-06. **This is an unmerged, non-production integration rehearsal.**

## Exact integration inputs
- Current `main` commit: `8cfb9571e9ce31f145313c1cf99ce18117abb57d`.
- Validated KB-05G tip: `29100bd521af9ab5d1c00f25c782819a451ba759` (GitHub Actions run #42250504094 passed `validate` and `financial-database`).
- Common ancestor: `0955bf239ce86886d656c3c9e6a91237cf449a30`.
- From that ancestor, main changed 50 files, KB changed 108 files; the **only path changed in both histories** was `.github/workflows/ci.yml`.

## Integration construction
Start with the **main commit's complete Git tree**, preserving every unrelated live-main modification. Apply the 107 **non-overlapping KB changed blobs** from the validated KB tip. The one common file, `.github/workflows/ci.yml`, is based on the current main version (including its pinned ubuntu-24.04 runner and browser setup fix) with only the KB source unit and isolated SQL discovery regression test steps carried forward. Remove obsolete PR/push trigger allowlists for the old stacked branch names; retain **main-only** triggers so ordinary CI checks the integration draft PR targeting main. This branch intentionally has **only the main commit as its parent**: it is a testable proposal, not an implicit merge of any draft into production.

## CI / acceptance
The integrated tree must pass the exact-head two-job GitHub Actions CI including source tests, TypeScript, full Next.js build, synthetic browser checks and isolated PostgreSQL. Treat any failure as integration evidence requiring a fix; do not automatically merge or activate KB. A passing run does not prove the KB-04E 16 real staging scenarios, independently authenticated consent/retention/RLS, or a production release.

## Operational restrictions
No code from this rehearsal may crawl customer websites, store evidence, call a real model, approve knowledge, or deploy to production. KB-05D's manual Auth workflow remains separate and disabled until a dedicated authorized test project and actual GitHub reviewer protections are configured. **No source or database change is applied to main.**
