# KB-09H — Session-authorized job cancellation and service-only seed failure

**Status: DRAFT — DISPOSABLE LOCAL POSTGRES ONLY — DO NOT MIGRATE OR DEPLOY**  
**Date:** 2026-11-08  
**Parent:** <https://github.com/yogakulamacademy/salsys-os/pull/642>, exact parent HEAD `2c5b955784ee3afa02253a13fe58004dc1e05009`.

## Why this exists

The unmerged `app/api/knowledge/discovery/route.ts` still uses a
**privileged direct UPDATE** on `knowledge_discovery_jobs` for two
separate purposes: tenant-admin DELETE cancellation, and `seed_insert_failed`
cleanup when a newly inserted job cannot receive its initial page.
KB-09G showed that retaining unrestricted `service_role` table UPDATE
also allows privileged bypass of commit-time proof and consent safeguards.
Applying KB-09G's local permission REVOKEs without replacing these two
flows would break the existing draft API. This checkpoint proposes
separate, narrowly scoped transactional replacements, **not a live change**.

## New disposable-only SQL

`docs/sql/KB-09H-tenant-cancel-and-seed-failure-CAS-REHEARSAL-DRAFT.sql`
has a strict name/fixture guard for random `salsys_kb09f_<18 hex>`
local PostgreSQL databases that already contain synthetic
KB-01B/06A/06B/09F/09G objects. It is **not a migration**.

Both procedures live in the **private `kb09h_fixture` schema**.
They use `SECURITY DEFINER` with an empty `search_path`, exact
service/actor role checks, function-level grants, and a private audit
table with RLS enabled and no direct client grants. Neither is wired
to PostgREST, the app, or an actual Supabase project.

**Tenant-admin cancellation**

`cancel_job_for_current_admin_v1(organization_id,job_id)` invokes
the **existing KB-06B `kb_discovery_consent_actor_v1` helper** for the
caller. That helper requires a matching current user, a bound session
present in `auth.sessions`, an active tenant, and an active owner/admin
membership. The caller cannot supply an actor or session as a function
argument. The procedure locks the exact tenant/job row and can
cancel only `queued` or `running` jobs, clearing lease token/time
and recording a session-attributed audit in one transaction.
Completed/failed/cancelled/unknown jobs produce the same generic
`not_active_or_not_found` outcome. A second cancellation is a no-op.

**Service-side seed insertion failure**

`fail_unseeded_queued_job_v1(organization_id,job_id,expected_creator)`
requires the **service role**, a matching creator, a truly unclaimed
`queued` job, no existing page, no started/finished timestamp, and
zero attempts. The error code is **fixed in SQL** as
`seed_insert_failed`; arbitrary caller-supplied statuses or reasons
are not allowed. A job with an existing seed/page, lease, or terminal
status cannot be failed through this entry point. Its audit is marked
as initiated by a **service handler**, not falsely as a signed-in user.

The **audit is append-only** under a blocking UPDATE/DELETE trigger,
one terminal audit per job, and a foreign key to the exact
tenant/job. An insert failure rolls back any preceding job mutation
atomically. It contains no raw lease, website content or credential.

## Disposable PostgreSQL verification

The existing `tests/database/knowledge-commit-ownership-races.test.mjs`
now loads this exact SQL after KB-09G into an automatically created and
destroyed loopback-only database. It tests:

- Explicit function privileges (authenticated cancellation only;
  service seed-failure only; neither can INSERT into audit directly)
- Tenant/session/active-member denial, unrelated actor denial,
  revoked owner membership, forged/unbound session denial
- Running and queued job cancellation, lease clearing and exactly
  one session-attributed audit; repeated cancellation rejected
- Audit uniqueness collision that rolls back cancellation and preserves
  the current lease
- Seed failure with creator/tenant mismatch, a job that already has a
  page, and a successful unseeded queued failure with correctly
  attributed audit and no fake signed-in actor
- Independent-session transactions for cancellation winning ahead of
  a page commit, a successful page commit winning ahead of cancellation,
  and a lease claim winning ahead of seed failure

## Explicit residual gaps and rollout prerequisites

The tests use **simulated JWT/session data**, not live signed Supabase
authentication. The helper and the role grants are exercised under
local PostgreSQL identities. No real tenant was inspected.

This does **not** yet replace the API's direct `UPDATE` calls,
install any migration, close privileged proof/consent table writes,
fix the temporal proof-at-external-COMMIT gap, or introduce tenant-bound
job creation/seed page INSERT. Current job creation and page insertion
use direct privileged writes in the draft API, and the worker continues
to use the legacy draft claim/commit routines. The KB-09G REVOKEs
**MUST NOT** be applied to any live database.

A later independently reviewed integration must first establish real
session-bind semantics, audited cancellation error handling and
versioned RPC deployment; update the API without changing its user
contracts; deny direct privileged UPDATE/DELETE/TRUNCATE; verify
existing worker lease retries and real tenant A/B cross-session races;
and secure the remaining privileged INSERT/consent/proof boundaries.

No production, Recovery, staging or customer Supabase project was
queried or modified; no website crawl, tracking, model provider,
consent grant, paid service, GitHub protection change, `main`
merge or deployment occurred. The owner defers paid staging until
SalsysOS earns revenue and still requires a fresh express price
approval.

Release gate <https://github.com/yogakulamacademy/salsys-os/issues/601>
remains **OPEN/BLOCKED at 0/16 independently witnessed real staging
acceptance cases**; independent reviewer #612, privacy/DBA #613
and isolated staging/budget #614 remain unresolved.
