# SalsysOS KB-01D — Synthetic End-to-End Discovery Validation

**Date:** 2026-11-06  
**Repository:** yogakulamacademy/salsys-os  
**Branch:** feature/kb01-public-website-scope  
**PR:** #538, DRAFT — no merge/deployment  
**Scope:** KB-01D controlled synthetic end-to-end validation (not an actual hosted staging scan)

## Implemented

- Extracted `lib/knowledge-discovery/run-core.ts` as the same application discovery logic invoked by the production `runner.ts` adapter. It has explicit storage and HTTP dependencies so tests can use an isolated PostgreSQL store and deterministic fake network without weakening production URL restrictions.
- Added `tests/database/knowledge-discovery-e2e.test.mjs` which executes the **exact staged KB-01B schema** in a freshly created disposable local PostgreSQL database, invokes the real job-claim and page-commit RPCs, and feeds synthetic web responses through the existing DNS/redirect validation implementation.
- The synthetic fixture includes a homepage, sitemap-only page, normal page, redirect, robots-disallowed page, HTTP 503, unsupported PDF MIME and an off-site metadata link. Expected result: 7 discovered; 4 fetched; 1 blocked; 2 failed; final status `partial`. No robots-disallowed page-body fetch; no metadata endpoint fetch; no knowledge publication.
- A second run with `max_pages=2` asserts that the exact worker/SQL pipeline cannot enqueue more than 2 pages and finishes with a terminal status that is visibly flagged as potentially capped.
- Added `tests/knowledge-ui/knowledge-discovery.spec.ts` to exercise the real Next.js discovery screen with **synthetic API responses**: start, queued state, cancel, terminal state, partial coverage inventory, mobile overflow and dependency outage. These browser tests do **not** send a production start/cancel command or exercise real route authentication.
- CI runs the SQL/E2E fixture in its disposable PostgreSQL service and includes the Playwright UI spec in the existing knowledge UI suite.

## Verified evidence

- KB-01C isolated security and worker lease tests passed on previous commits.
- The E2E fixture on the KB-01D branch passed in GitHub CI including the per-job page cap, check run `42178118143` financial-database job.
- URL/DNS/robots safety tests and typecheck passed at the latest observed CI stage.
- Latest full Next.js build, Playwright and CodeQL statuses must be checked against the *exact current branch head* before closing the checkpoint.

## Boundaries

- No production or recovery project SQL was applied.
- No actual hosted staging deployment, live customer crawl or outbound public website request was made.
- No AI extraction, FAQ generation, knowledge approval or autonomous messaging was enabled.
- Main branch and other developers' work were left unchanged; PR #538 remains draft.
- The synthetic fixture validates production logic and actual SQL, but does **not** replace a real staging deployment or actual HTTP route auth checks.

## Remaining release gates

1. Confirm all CI, CodeQL, build and browser tests on the final PR head are green.
2. Generate an official versioned migration with Supabase CLI; review in isolated DB and production migration ledger before application.
3. Run authorized staging HTTP route tests using a real staging Supabase project, verifying origin/cookie auth, admin/nonadmin and cross-tenant controls.
4. Test the actual pinned HTTPS socket adapter to a controlled public staging site (the current synthetic transport mocks outbound sockets), including robots, retries/timeouts and cancellation.
5. Add domain ownership verification, scan quotas/rate limits, abuse controls and a scheduler kill switch before general customer activation.
6. Reconcile base with newer `main` without overwriting parallel development work.
7. Separate approval before merge, production migration, schedule activation, or autonomous AI actions.

**Next:** KB-01E = staging authorization and real-network transport pilot, with explicit gated approval before any production changes.
