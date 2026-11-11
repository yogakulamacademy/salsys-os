# KB-09G — Privileged direct-write bypass and proof-expiry transaction boundary

**Status:** DRAFT — DISPOSABLE POSTGRES ONLY — DO NOT APPLY OR DEPLOY  
**Date:** 2026-11-08  
**Parent:** [KB-09F PR #640](https://github.com/yogakulamacademy/salsys-os/pull/640), exact HEAD `e4cfcce8c4d0a81a4ff0193038b20b1ff54818d4`.

## Findings: the KB-09F RPC alone is not an enforceable boundary

In still-unmerged KB-01B, `service_role` receives `GRANT ALL` on
`public.knowledge_discovery_pages` and `public.knowledge_discovery_jobs`.
On an actual Supabase project, `service_role` bypasses RLS, so RLS
policies **cannot** prohibit direct page-status changes, fabricated counters,
bulk deletion or TRUNCATE by this privileged credential. Revoking
`EXECUTE` on the older, less-guarded page-commit RPC (as tested in KB-09F)
does **not** revoke direct table UPDATE/DELETE/TRUNCATE access.

This is a **draft-only pre-release attack-surface finding**, not evidence of
live exploitation or of leaked production data. No crawler is enabled.

### The zero-cost local reproduction

The existing `tests/database/knowledge-commit-ownership-races.test.mjs` now
creates a uniquely named synthetic `BYPASSRLS` PostgreSQL role, grants it
the exact fixture `service_role` permissions, and **simulates** the
service JWT using a local `auth.jwt()` stand-in. This temporary role is
dropped at test end, and the random localhost database is destroyed.

1. The KB-09F old RPC is denied but direct UPDATE of a `discovered` page
   to `fetched` still succeeds with **expired tenant domain proof**.
   This proves a real *privilege-shape* bypass, not actual hosted Auth.
2. The guarded, **non-migration** prototype
   `docs/sql/KB-09G-direct-write-boundary-REHEARSAL-DRAFT.sql`
   removes privileged UPDATE, DELETE, TRUNCATE and TRIGGER permissions
   from only the discovery jobs/pages tables **in this random local DB**.
   Narrow insert triggers reject direct forged completed jobs/pages while
   allowing the existing seed/queued insert shape. The trigger functions
   live in a private `kb09g_fixture` schema.
3. The synthetic BYPASSRLS role can no longer UPDATE or TRUNCATE the
   protected tables or insert a forged `fetched` page/`completed` job.
   An explicitly acknowledged commit through the existing KB-09F
   ownership-checking `SECURITY DEFINER` wrapper still succeeds under
   those narrower grants.
4. **Residual bypass:** `INSERT` into `discovered` pages and `queued`
   jobs is still directly allowed so that the *draft* API's enqueue and
   seed paths are not mistaken for already-migrated RPC workflows.
   The privileged service role also still has direct write access to
   ownership/consent tables. Future work must move those operations to
   independently authorized, tenant-scoped procedures and revisit the
   original grants. These tests do **not** establish a complete
   end-to-end privilege closure.

## Commit-time proof expiry remains an unresolved temporal boundary

The KB-09F wrapper verifies proof under a row lock and rechecks
`verified_until` **when the function finishes**. That does *not* make
the proof valid at the transaction's eventual external `COMMIT` if
a privileged caller keeps the transaction open past expiry.

A negative fixture test explicitly runs the guarded commit while proof
is still valid, holds the transaction until the proof has expired, and
then commits the page update. The test records that this is **permitted
by the current prototype**, not an acceptance success or a fixed race.

An independent security/DBA decision is required for the intended
policy. Possible approaches include bounded minimum proof lifetime,
strict worker RPC transaction duration, expiry-aware conditional writes,
and evidence timestamps coupled to a reviewed renewal/revocation model.
None is approved or enforced by KB-09G. Row locks serialize other
transactions that modify the proof record; they do not pause wall time.

## Integration blockers and required next actions

- **Do not apply the KB-09G REVOKEs to a live project.** The existing
  `app/api/knowledge/discovery/route.ts` uses service-client direct
  `UPDATE knowledge_discovery_jobs` for owner cancellations and seed
  insertion failures. The REVOKEs would break those working draft calls
  unless they were first replaced with a versioned, session-aware,
  tenant-and-job-scoped RPC plus independent privilege/retry review.
- The existing worker obtains a broad admin client which retains table
  access beyond its needed claim/commit RPCs. A future solution should
  minimize credentials and use signed actor/session checks for human
  cancellation. Neither the worker nor API is changed in this PR.
- The test's synthetic `BYPASSRLS` role/JWT is not a signed Supabase
  session; it demonstrates PostgreSQL table privileges under a
  well-understood test environment only.
- Triggers could be disabled or bypassed by true table owners/superusers;
  trigger insert checks do not stop forged consent/proof changes by
  broadly privileged service clients. All such administrative bypasses
  must be independently reviewed.
- Current account/legal decisions still govern all real site ownership,
  consent, retention, deletion, third-party content and audit semantics.

**No** customer data, new paid project, hosted Supabase SQL, production or
recovery database, real crawl, live AI provider, environment/branch
protection changes, `main` merge or deployment were involved. The
owner defers paid staging until revenue and requires a separate express
price approval even then.

[Release gate #601](https://github.com/yogakulamacademy/salsys-os/issues/601)
remains **OPEN/BLOCKED with 0/16 independent real staging witnesses**.
[#612](https://github.com/yogakulamacademy/salsys-os/issues/612)
independent reviewer/protected environment, [#613](https://github.com/yogakulamacademy/salsys-os/issues/613)
legal/DBA retention/consent, and [#614](https://github.com/yogakulamacademy/salsys-os/issues/614)
isolated staging/budget are all unresolved. This is an engineering
rehearsal, not a release recommendation.
