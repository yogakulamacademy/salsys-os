# KB-09F — Commit-side ownership proof and consent race rehearsal

**Status:** DRAFT — LOCAL POSTGRES ONLY — DO NOT MIGRATE OR DEPLOY  
**Date:** 2026-11-08  
**Parent:** [KB-09E PR #639](https://github.com/yogakulamacademy/salsys-os/pull/639), parent HEAD `00334d3a4e4ca227e153af2bac90603e4a4fbddf`.

## Confirmed risk in the existing, still-unmerged SQL draft

`public.commit_knowledge_discovery_page_v1` in KB-06A obtains the claimed
tenant/job row lock and checks tenant-matched *current consent* before writing
page metadata. It does **not** independently recheck *domain ownership proof*
at commit time. If site proof expires or is revoked after the worker fetched
a page but before committing, consent may remain active and the original
function could accept outdated evidence. KB-09E tested a separate
early-denial cancellation, but cancellation cannot undo a commit that wins
the job-row lock first.

## Scope of the new, disposable-only experiment

`docs/sql/KB-09F-commit-side-ownership-guard-REHEARSAL-DRAFT.sql` is
**not a production migration**. It refuses execution unless the database
name matches `salsys_kb09f_<18 random hex>`, the exact KB-01B/KB-06A/KB-06B
synthetic fixture exists, and real app leads/contacts are absent.

It creates one private `kb09f_fixture.commit_page_with_current_proof_v1`
function which:

1. Requires the simulated service-role JWT and exact organization, job and
   unexpired current lease-token compare-and-set.
2. Locks the job row first, derives the canonical HTTPS hostname from the
   stored seed, then locks the current tenant/hostname proof record with
   `FOR SHARE`. Unverified, missing, expired or future-dated proof blocks
   the operation **before** any page mutation.
3. Invokes the **unchanged, existing KB-06A commit function** only while
   proof remains valid and locked. That function still enforces the exact
   tenant/job/lease and current consent under its own row locks.
4. Performs a post-call expiry check and raises a transaction-rolling-back
   error if ownership proof expires during the operation.
5. Rehearses revoking direct service-role invocation of the old,
   unprotected commit RPC **only within the temporary database** to avoid
   a trivial RPC-level bypass. The test never changes live grants.

No raw content/credentials are logged or sent, no new table is added to the
actual application, and no application worker route is modified or connected
to this simulated RPC.

## Exact SQL tested in real, independent local PostgreSQL sessions

`tests/database/knowledge-commit-ownership-races.test.mjs` loads the
existing KB-01B / KB-06A / KB-06B SQL in a random auto-dropped localhost
database and exercises their real draft claim, commit and audited
consent-withdrawal functions. It checks wrong-tenant/token and
unauthorized roles, inactive/renewed/revoked domain proof, preservation
of previously unmodified page metadata after denial, valid proof+consent
allowing commit, blocking updates to proof rows, and audited
KB-06B withdrawal racing job commits in both lock orderings.

Outcomes are intentionally asymmetric:

- **Proof change or consent withdrawal wins first:** the worker must
  observe the updated proof or cancelled lease, and save no page metadata.
- **Page commit wins first:** a later proof expiry or consent withdrawal
  cannot retroactively undo an already committed page. The test asserts
  this limitation, not a claimed universal prohibition on past writes.

## Remaining security/release blockers

This is still a **privileged private wrapper** and not enforcement across
all database surfaces. The simulated service role retains direct table
privileges; bypassing the wrapper via direct DB write is outside the
prototype. Real signed Supabase JWTs, authentic domain proof, actual
browser-visible source content, clock/commit boundary behavior, all
ownership revocation pathways, reviewer independence, app retry delivery,
and the final direct-RPC migration/rotation plan have **not** been proven.

A future real integration would require independent security/DBA approval
of the SQL and RLS grants, the complete commit path and worker wiring,
lock-order/deadlock audits, and real authenticated tenant A/B and
ownership/consent-withdrawal tests. A proof can naturally expire during
a prolonged transaction; the post-call check reduces this race but does
not establish a formally bounded time-to-commit guarantee.

**No** production/recovery/staging SQL, customer crawl, AI provider,
tracking, consent grant, scheduled worker dispatch, GitHub protected
environment change, paid resource, `main` merge or deployment was made.
The owner defers new paid staging until SalsysOS generates revenue and
still requires separate explicit approval of actual costs.

[Release gate #601](https://github.com/yogakulamacademy/salsys-os/issues/601)
remains **0/16 independently witnessed real staging acceptance**, with
independent reviewer/protected environment #612, legal/retention/DBA
#613, and isolated staging/budget #614 unresolved.
