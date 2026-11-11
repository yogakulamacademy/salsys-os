# KB-05B — Exact Knowledge RLS Negative-Path Matrix (DRAFT)

**Date:** 2026-11-06  
**Branch:** `feature/kb05b-knowledge-tenant-rls-negative-matrix`  
**Parent:** KB-05A Draft PR #570, stacked on unmerged KB-04E #569 and earlier KB drafts.

## Scope

Extend KB-05A's already passing disposable PostgreSQL knowledge authorization test with more **negative security scenarios using the exact existing knowledge migrations and RLS policies**. No change to any production table, policy, RPC, application route or the existing original 27-assertion fixture.

The test `tests/database/knowledge-rls-negative-matrix.test.mjs` generates the canonical rollback-only SQL using the *existing* `scripts/build-knowledge-readiness-sandbox.mjs`, then inserts the separately versioned `knowledge-rls-negative-matrix.fixture.sql` into four exact test positions. It fails on missing/ambiguous anchors so upstream migration or test drift cannot silently skip safeguards.

## Added adversarial cases

- Positive proof that tenant A has sources, chunks, approval history and an approved document before any isolation claims.
- **Legacy singleton-member behavior documented:** owner A with only tenant A membership can still read their own A rows even while presenting a mismatched B session ID, because the current authorization helper falls back to the sole active membership. This does **not** grant access to tenant B, but it also does **not** prove strict binding for singleton members.
- **Stronger multi-membership scenario:** after synthetic test-only setup grants both A and B memberships to the two owners, mismatched session/user identities must deny direct knowledge reads and security-definer search of the wrong active tenant.
- Owner B cannot read tenant A sources, chunks or approval records.
- Owner B cannot call tenant A's privileged approval/archive RPCs.
- Owner B cannot insert tenant A sources, chunks or approval records by direct Data API-compatible table access.
- Owner B's direct tenant A document/source update and document deletion affect zero rows.
- Positive proof that owner B can create and retrieve **their own** approved document.
- Multi-tenant owner B with a mismatched tenant A session cannot read tenant B knowledge.
- Tenant A employee can read own tenant but cannot see tenant B's approved document, approve via RPC, insert own tenant sources or modify own tenant documents.
- Anonymous role has no direct knowledge table reads. Authenticated role lacks UPDATE/DELETE on append-only knowledge approval history.
- Verify attempted cross-tenant edits did not change tenant A content or authorized tenant B's new document.
- The original 27 assertions must still succeed and all application objects must disappear after rollback.

Tests use only invented tenants, identifiers, documents and claims on a new random local PostgreSQL database; the runner rejects remote hosts and non-`/postgres` admin databases and drops only its own created database.

## Validation

CI uses the pre-existing disposable PostgreSQL service and the `test:financial:db` wildcard, plus source/unit tests, TypeScript, full build and synthetic Chromium. **The exact-head result must be independently checked; do not infer a pass from an earlier draft.**

A failed assertion is a potential authorization regression that should be investigated, **not** weakened just to reach green CI. The first exact-head run failed on the singleton-membership compatibility fallback, exposing the distinction between membership-based access and strict session-bound access; the revised matrix tests both transparently. This fallback needs an explicit product/security decision before claiming strict session binding for single-tenant accounts.

## Safety / remaining acceptance

These checks exercise real committed Postgres RLS definitions and SQL functions, but `auth.uid()` and `auth.jwt()` use **synthetic local compatibility claims**, not signed Supabase Auth identities. They do not verify the hosting project's current applied migration state, active real sessions, RLS policy administration, consent withdrawal, source quotation retention/deletion, data-subject requests, external browser/provider behavior, or audited operator runbooks.

KB-04E's 16 real staging scenarios **remain unverified** until explicitly approved and witnessed against an independent dedicated staging environment. No automatic publishing, live website access, model call, database persistence, production merge or deployment is added.
