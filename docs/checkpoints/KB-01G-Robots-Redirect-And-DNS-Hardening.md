# KB-01G — Redirect Robots and DNS Boundary Hardening

Date: 2026-11-06
Repository: yogakulamacademy/salsys-os
Branch: feature/kb01-public-website-scope
PR: #538 (DRAFT; unmerged)

## Implemented

- The worker now checks robots policies on **every redirected HTML destination**, not just the original page. An allowed page redirecting to /private is classified as blocked, and the destination body is never fetched.
- The same redirect re-authorization guard applies to sitemap responses. HTTP(S) page or sitemap redirects without a supplied guard fail closed with `redirect_robots_required`.
- All redirected destinations are still checked for same-site scope, public DNS and pinned addresses before any fetch.
- Enforced **HTTPS seed continuity**: a caller cannot bypass the downgrade restriction by supplying an already-HTTP candidate page when the seed was HTTPS.
- Refused additional reserved/documentation IPv6 encodings, including compressed and zero-padded forms of `2001::/23`, `2001:db8::/32`, `2002::/16`, and `3fff::/16`. Valid global IPv6 fixtures remain allowed.
- Added a five-second default timeout to DNS resolution. A test with a permanently unresolved DNS promise confirms bounded failure.
- Extended deterministic network tests and the existing synthetic full-worker/PostgreSQL test:
  - 8 discovered URLs, 4 fetched, 2 blocked, 2 failed, final state `partial`.
  - Both direct /private and /redirect-private are classified as robots-blocked.
  - The private path body and off-site metadata URL are never fetched.
  - The separate 2-page cap fixture remains in place.

## Verification

- Existing KB-01F CI/CodeQL was green for prior commits, but the latest **KB-01G head** must be checked separately.
- This checkpoint's new assertions run within GitHub Actions CI:
  - `node --experimental-strip-types --test tests/knowledge-discovery/*.test.mjs`
  - `node --experimental-strip-types --test tests/database/knowledge-discovery-e2e.test.mjs` (disposable PostgreSQL)
- No claim of real HTTPS production transport acceptance. The end-to-end fixture still injects a controlled transport; the production TLS socket path needs separate staging acceptance.

## Remaining release gates

1. Verify newest-head CI, CodeQL, full build, browser and database jobs.
2. Generate the official Supabase migration with the CLI (currently the SQL is a docs-only DRAFT).
3. Provision a distinct, authorized staging environment — do not use Production or Recovery Rehearsal.
4. Exercise the real pinned HTTPS transport and authenticated Next.js routes with staging secrets/fixtures.
5. Implement verifiable website ownership for general customer use.
6. Add host-wide fairness and monitoring/alerting for repeated errors, and review total per-worker duration.
7. Reconcile main-branch changes without overwriting another developer's work.
8. Obtain explicit approval for any merge or production schema/deployment changes.

## Non-actions

No production or Recovery database changes, no staged migration application, no real customer-site scan, no scheduled automation, no AI knowledge publication and no customer messages.
