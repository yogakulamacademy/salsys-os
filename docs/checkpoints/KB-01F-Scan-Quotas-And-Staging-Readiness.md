# KB-01F — Discovery Scan Quotas and Staging Readiness

Date: 2026-11-06
Repository: yogakulamacademy/salsys-os
Branch: feature/kb01-public-website-scope
PR: #538 (draft; unmerged)

## Incremental implementation

- Added **database-enforced per-organization scan limits** to the staged
  `docs/sql/KB-01B-discovery-schema-DRAFT.sql`:
  - One active discovery job per organization (existing unique index).
  - Three new scan jobs per rolling 24-hour period.
  - Fifteen-minute cooldown since the most recent scan job.
  - Advisory transaction lock serializes concurrent insertion attempts for
    each organization; API/worker code cannot skip the SQL guard.
- The admin API responds `409` for duplicate active scans and `429` for
  the two rate-limit conditions without inserting a seed page.
- Extended disposable PostgreSQL tests to verify cooldown, 24-hour quota and
  concurrent same-organization INSERTs. Adapted synthetic two-scan E2E to
  simulate elapsed cooldown using disposable fixture timestamps only.
- Added synthetic scheduled-worker handler tests: disabled pilot, missing or
  wrong bearer credential, emergency pause, removed domain approval, allowed
  single tick, and idle/no-job case.
- All prior job-leasing, tenant RLS, crawl caps, robots, redirect and synthetic
  website tests remain part of CI.

## Staging prerequisite — DO NOT deploy to Production or Recovery Rehearsal

At last audit, only the following Supabase projects were connected:
SalsysOS Production and SalsysOS Recovery Rehearsal.
Neither is a dedicated staging tenant and neither has been modified for KB-01.

A new, isolated staging project and separate credentials are needed before
performing full HTTP route-to-PostgREST and real-network testing.
The versioned Supabase migration must be **generated with the Supabase CLI**
in the project checkout and reviewed. The current SQL remains an explicit
unapplied DRAFT. The local task environment lacks the Supabase CLI, so no
official migration was generated or invented here.

## Staging acceptance matrix

| Test | Expected outcome |
| --- | --- |
| Disabled pilot / missing allowlist | No scan can be started |
| Invalid bearer / paused worker | No job is claimed |
| Employee or other organization's admin | No scan start, read or cancel |
| Same-site admin action | Start scoped only to bound organization |
| Duplicate concurrent start | One active job; second rejected |
| Completed recent scan | HTTP 429 until 15-minute cooldown |
| Three scans in rolling 24 hours | Fourth rejected with HTTP 429 |
| Owner-approved staging website | Scan can discover public pages |
| Offsite or private IP redirect | Rejected before connection |
| Malformed, blocked or oversized page | Accurate failed/blocked record |
| Cancel while worker fetches | No stale page mutation |
| Stale/retried lease | Only valid lease may commit |
| Max-page cap / robots / sitemap | No unbounded crawl; truthful partial report |
| Paused pilot mid-run | No new claims; in-flight fetch capped by timeout |
| No approved knowledge | Nothing is published, no AI reply |
| Production and Recovery projects | Zero KB-01 schema or data writes |

## Pre-merge gates

1. Verify **latest-head** GitHub CI, CodeQL, TypeScript, Next build and browser results.
2. Reconcile newer `main` commits without losing the other developer's
   `.github/workflows/ci.yml` changes.
3. Provision authorized isolated staging with separate secrets, credentials,
   logs, verified hostname and no customer data.
4. Generate the official migration with the installed Supabase CLI (inspect
   `supabase --help` and `supabase migration new --help` first), then replay
   and roll back inside staging and run security advisors.
5. Run end-to-end HTTP and genuine pinned TLS tests on a controlled public
   staging website; capture evidence for errors and leak controls.
6. Add proof of website ownership before supporting arbitrary customer domains.
7. Review scheduler interval, quotas, logging and pause control.
8. Obtain explicit merge and production migration/deployment approval.

## Operational caveats

- The emergency pause stops new jobs and claims but does not instantly
  terminate an HTTP request already in flight. The transport has an 8-second
  total request deadline, and the atomic DB commit checks lease validity.
- Daily quota counts all start attempts that successfully created jobs,
  including cancelled/failed jobs; it does not count rejected requests.
- No hosted staging crawl, migration application, production deployment,
  AI extraction, autonomous reply, or messaging side effect occurred.
