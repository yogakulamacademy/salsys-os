# KB-05C — Strict Website Monitoring Session Candidate (DRAFT)

**Date:** November 6, 2026  
**Branch:** `feature/kb05c-strict-monitoring-session-candidate`  
**Parent:** KB-05B Draft PR #572, stacked on KB-05A #570 and the earlier unmerged KB drafts.

## Motivation

KB-05B passed its adversarial cross-tenant RLS matrix and identified an important limitation of the **existing** authorization function: `current_tenant_organization_id()` may fall back to the user's sole active membership when a presented `session_id` is unmatched. This is intentional legacy compatibility and is **not evidence that a singleton-member actor has a strictly bound session**.

Future sensitive website monitoring and evidence-collection functions should never infer user authority only from this fallback. No live monitoring endpoint currently exists under the KB implementation.

## Technical work

New `tests/database/knowledge-monitoring-strict-session-candidate.fixture.sql` defines a **temporary, SQL-only** `pg_temp.kb05c_strict_monitoring_session_candidate(org_uuid)` function within the already isolated KB-05B rollback fixture. This is a proposed policy test, **not a production function**.

The candidate requires all of the following in the same database request context:
- Claimed `authenticated` role, nonnull user and syntactically valid UUID `session_id`.
- Exact `tenant_session_bindings` match across session ID, user ID and requested organization.
- Active organization and active membership.
- Owner or admin membership; a regular member/employee cannot authorize website monitoring.
- No role-based shortcut for `service_role`, no singleton-membership fallback and no automatic approval/publish authority.

The expanded KB-05B runner injects this SQL only into the rollback-only SQL. It refuses a missing/ambiguous target, candidate-controlled `BEGIN`/`COMMIT`/`ROLLBACK`, or production function replacements. The exact original production knowledge migrations and all original 27 rollback checks still execute.

### Synthetic database test cases

1. Matching tenant A owner session passes the *candidate predicate only*; tenant B rejected.
2. Mismatched session ID, absent session ID, malformed UUID and unknown session ID all denied even when legacy singleton fallback would have allowed own-tenant reads.
3. Matching owner B passes B only; owner B's extra employee membership in A grants no monitoring authority in A.
4. Employee A denied; changing its synthetic test-only membership to admin permits its valid bound session; restoring employee revokes permission.
5. Anonymous and service-role user claims denied for the end-user permission predicate.
6. Removing a session binding denies; restoring it restores eligibility.
7. Revoking membership or marking the organization inactive denies; restoration works.
8. The existing KB-05A/05B SQL/RLS tests continue to pass and application tables/functions disappear on transaction rollback.

## Crucial non-authorization boundaries

This test uses **synthetic `request.jwt.claims` values** in a disposable local PostgreSQL database. PostgreSQL cannot independently verify their signatures here; in a real Supabase request, the platform must verify the access token and active session. A future implementation should independently assess actual Supabase Auth `session_id` / `auth.sessions`, authorization freshness, administrative role, active tenant binding, consent, ownership expiry, robots and SSRF protections, retention/deletion, audit, rollback, and error handling. A test-only SQL predicate is **not** a complete security control.

**No production SQL migration, RLS policy, function grant, server action, Next.js route or crawler/executor is created or modified.** The existing manual knowledge lifecycle and global tenant session fallback are unchanged. No readiness report becomes a release token and no customer data is used.

## Open decision and acceptance

Product/security owners must decide how strict tenant binding should work for legacy single-organization sessions and whether migration or opt-in enforcement is required. Do not change the global compatibility path casually; it may affect existing users.

KB-04E's 16 real-world acceptance scenarios remain independently unverified without a dedicated approved staging environment. KB-05C adds **local test evidence only** and stays draft until authorized staging has signed security and consent acceptance.

CI acceptance: exact-head `financial-database` and `validate` jobs must both pass. Record failures truthfully, do not weaken permissions to reach green.
