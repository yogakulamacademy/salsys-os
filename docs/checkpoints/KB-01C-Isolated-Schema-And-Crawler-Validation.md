# KB-01C — Isolated schema and crawler-safety validation

**Date:** 2026-11-06  
**Repo:** yogakulamacademy/salsys-os  
**Work branch:** feature/kb01-public-website-scope  
**PR:** #538 (DRAFT; no merge)

## Changes in this checkpoint

1. Added synthetic local Postgres foundation fixture and tests under tests/database/knowledge-discovery.*.
2. Exact KB-01B proposed SQL is executed inside a newly created disposable PostgreSQL database; the database is forcibly dropped after the suite, including on failure.
3. Added a service-role-only `commit_knowledge_discovery_page_v1` function to the proposed SQL. It obtains a row lock, checks the active job and exact lease token, changes the page, inserts bounded new links and updates counters/next scheduling state in one transaction.
4. The runner now calls the atomic RPC rather than reading job status and writing pages in separate requests.
5. Added deterministic public HTTP transport tests for re-resolved redirects, rejected off-site/metadata redirects, mixed public/private DNS rejection, and unsupported MIME.
6. Bounded each remote fetch with a **total wall-clock timeout** to block slow-drip connections.
7. Unit/integration tests are wired into existing pull-request CI. No runner schedule or production SQL was configured.

## Verified execution

GitHub Actions CI job `financial-database` for run **42173308350**: the newly added **Verify KB-01C discovery schema and leases in disposable PostgreSQL** step completed **successfully**. This covered:
- Exact draft SQL parsing/execution in disposable PostgreSQL
- Tenant RLS: A cannot read B, unaffiliated user reads none
- Authenticated role cannot directly insert/update jobs or pages
- Unauthorized workers cannot execute the claim RPC
- Active-job uniqueness and composite tenant foreign keys
- Two independent worker sessions claiming different jobs
- Expired lease replacement rejects stale tokens
- Atomic page commit updates page counts and queues bounded links
- Cancellation racing a late worker rejects the result without touching its page
- Exhausted lease attempts terminally fail

At the time this checkpoint was authored, full `validate` build and CodeQL were still in progress on the latest commit. Do not imply they passed until checked.

## Deliberate limitations and blockers

- **No production migration**. Proposed schema lives in `docs/sql/KB-01B-discovery-schema-DRAFT.sql`, not a generated deployable migration.
- No actual authorized public website scan has run from SalsysOS.
- No website ownership proof, public SaaS quotas, repeated sitemap recursion, PDF ingestion, JavaScript rendering or multilingual extraction.
- Only discovery metadata; no customer business knowledge was generated, approved or published.
- Do not ship without testing the real worker + database + network together on an isolated/staged target.
- Domain/scope rules and robots matching must be validated against more adversarial fixtures.
- The existing production source-backed knowledge creation V2 RPC discrepancy remains open separately.
- Main branch has advanced beyond the feature branch base; synchronize only after conflict review and separate approval.

## Next gated checkpoint

KB-01D: controlled end-to-end test-site scan + negative route-authorization cases + job operator UX on staging. Validate scheduled worker credentials, exact page outcomes, robots and HTTP failure handling, body limits, cancellation/unknown retries, performance and cost quotas before requesting merge/deploy.
