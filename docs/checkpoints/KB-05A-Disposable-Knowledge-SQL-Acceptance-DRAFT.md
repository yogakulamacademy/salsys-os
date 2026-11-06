# KB-05A — Executable Organization Knowledge SQL Acceptance (DRAFT)

**Date:** 2026-11-06  
**Branch:** `feature/kb05a-disposable-knowledge-db-acceptance`  
**Stacked on:** KB-04E Draft PR #569, not main.

## Why this checkpoint exists

KB-04E identified 16 real staging acceptance scenarios, none independently evidenced. The repository already contained `scripts/build-knowledge-readiness-sandbox.mjs` and `tests/database/knowledge-readiness.fixture.sql`, an **exact-source, rollback-only fixture** covering the **existing** Organization Knowledge lifecycle. However, that fixture was not directly executed as its own knowledge acceptance test in the stacked KB CI flow.

This checkpoint makes the existing fixture an executable regression in a dedicated disposable PostgreSQL database. It is practical database verification, not another synthetic advisory policy packet.

## Implementation

`tests/database/knowledge-lifecycle-isolation.test.mjs`:

1. Requires `SALSYS_ALLOW_LOCAL_DB_TESTS=1` and a PostgreSQL URL whose host is literal `localhost` or `127.0.0.1`, database is `/postgres`, and username is `postgres`. Rejects remote and application database URLs.
2. Creates a random *new* database. Checks that application tables are absent.
3. Bootstraps only disposable local roles and `tests/database/local-auth-bootstrap.sql` synthetic JWT accessors.
4. Invokes the existing source builder, which extracts the exact checked-in authorization helpers and knowledge migrations and inserts the original 27-assertion fixture.
5. Executes the fixture with one database connection under `BEGIN` / `ROLLBACK`.
6. Confirms the existing test suite passes, then queries for absent organization/knowledge/provenance/approval tables to verify cleanup.
7. Drops only the database created in this test and deletes the temporary generated SQL file. No hosted Supabase connection or source website is needed.

### Verified behaviors in original fixture

- Owner/admin scoped creation, source-backed creation, approval, idempotent approval, archival.
- Only approved, currently valid documents with active sources appear in search.
- Invalid source URL schemes and invalid effective-date windows fail.
- Unauthorized cross-tenant create (including source-backed create) fails.
- Tenant B cannot read Tenant A knowledge through direct RLS or retrieval RPC.
- Employee cannot create or approve; anonymous cannot execute lifecycle/retrieval.
- The verification transaction is rolled back.

The CI financial-database job already runs `npm run test:financial:db` with `tests/database/*.test.mjs`. The new test is included automatically, using a disposable PostgreSQL service; no pipeline secrets need to be introduced.

## Required technical validation

The exact-head GitHub Actions `financial-database` and `validate` jobs must both pass. Report CI failure truthfully and repair any fixture/role issues without weakening tenant isolation or altering the production authorization model.

## Boundaries and open gates

This local fixture uses synthetic authorization claims, *not validated Supabase Auth identities*. It does not reproduce hosted RLS grants, consent withdrawal, evidence quote retention, data deletion/audit reconciliation, real browser provenance or provider grounding. Even passing this test does not validate the 16 real staging scenarios.

No new knowledge table, migration, production RPC, API, server action, scheduler or permission is created. All prior KB PRs remain draft and unmerged. **No live crawling, model calls, customer data writes, knowledge publication or deployment.**
