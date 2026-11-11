# KB-11 — Consent-atomic discovered-page draft: disposable SQL contract verification

**Status: STRICTLY DRAFT, NOT A MIGRATION, NOT RELEASED. Staging ON HOLD.**  
**Source baseline:** cumulative [KB-10 draft PR #666](https://github.com/yogakulamacademy/salsys-os/pull/666), exact previously CI-green head `a571bef68ad3cfc052951b1a9f3dc4e79a982887`.  
**Date:** 2026-11-08

## Closing the engineering gap without deploying SQL

The KB-10 application draft intentionally disables `Save as Draft` from a discovered page until a future `create_discovery_review_draft_with_current_consent_v1` function is independently approved and installed. Before KB-11, that function had only a reviewed *contract*, with no concrete SQL implementation to exercise in local tests.

KB-11 adds `docs/sql/KB-11-atomic-discovery-review-draft-REHEARSAL-DRAFT.sql` to demonstrate the contract in an **automatically destroyed, randomly named localhost PostgreSQL database**. An execution guard refuses any database that does not exactly match the existing KB-09F local fixture shape, including absence of customer `leads`/`contacts`, and refuses an existing function. **It is not under `supabase/migrations` and must never be copied, executed or adapted to hosted Production, Recovery, shared dev or staging without a separate qualified reviewer and new migration process.**

The fixture builds minimal synthetic knowledge table shells, then executes the **unmodified byte-for-byte existing source-backed V2 production function** `supabase/migrations/20261103190000_ai_knowledge_provenance_readiness_v2.sql` inside the same disposable database. These shells are for exact local function behavior testing only; they do NOT represent a verified reconstruction of the actual hosted table types, constraints, grants, indexes, policies or associated triggers.

## Narrow RPC behavior

A private SECURITY DEFINER helper and an authenticated-only SECURITY INVOKER public wrapper implement the exact proposed app RPC name and five input fields. There is **no service-role permission** for the new RPC and no direct tenant write access to the synthetic knowledge tables.

1. Require an actual `authenticated` request JWT and a **current signed auth session** resolved through existing `kb_discovery_consent_actor_v1`, matching active organization and owner/admin membership. Reject revoked/unbound sessions and cross-tenant claims.
2. Accept only organization ID, discovered page UUID and bounded validated human-typed title/category/content. **Never accept source URI/title, approval intent, tenant-derived metadata, proof or consent as caller-controlled fields.**
3. Lock the current organization's HTTPS root website configuration. Lock its source job **before** the matching source page, ownership proof, consent and policy-control row. Require terminal `completed` or `partial` job, fetched HTTP-200 page with an exact HTTPS configured hostname, valid ownership proof, current purpose-limited granted consent, audited policy SHA matching the explicitly enabled test registry and valid timestamps at the SQL check. The job-before-consent lock order matches the existing audited withdrawal RPC.
4. In the **same SQL transaction**, invoke the existing source-backed V2 function with `p_approve=false` and only source metadata read from the locked page. A failed chunk INSERT or malformed source-backed return **raises** so the source and document cannot persist partially. An authenticated caller can never request approval or an independent source URI through this new path.
5. Return `ok:true,status:'draft',organization_id,page_id,document_id,source_id` only for a fully successful call. Failed proof, stale page, revoked consent, audit/policy mismatch, session problems or wrong tenant create nothing.

## Local acceptance and race tests

`tests/database/knowledge-commit-ownership-races.test.mjs` now loads the KB-11 SQL **after** successful KB-09S synthetic evidence collection but **before** the KB-09T synthetic erasure suite. It runs the exact existing knowledge V2 creation function. Tests include:

- Newly exposed RPC's `EXECUTE` permission denied to anon and service role and allowed to authenticated with **additional per-tenant/session checks**.
- No cross-tenant page ID borrowing, wrong signed actor, forged session, unsafe/short human inputs, or direct table insert bypass.
- Forced knowledge-chunk INSERT exception rolls back the entire new draft's source, document, chunk and approval audit.
- NULL or expired ownership proof (including SQL three-valued NULL handling), and paused/unapproved policy or SHA audit mismatch, refuse a new draft.
- Synthetic policy is turned on **only by fixture DB-owner SQL** to make a positive local test possible, with synthetic version/digest. It is restored OFF afterward; **this is NOT independent privacy approval**.
- A successful signed owner/admin call persists a source linked to an **unapproved draft** and chunk with no `knowledge_approvals` row.
- Concurrent test: hold one successful signed manual draft transaction open; start signed consent withdrawal for that tenant; it cannot complete until the first transaction commits. Once withdrawal is confirmed, further draft calls fail. A previously committed draft remains present **pending the separate legal derived-data withdrawal decision**.

### What this test does **not** prove

- It is **not** a deployable migration nor real hosted schema verification. The SQL owner, role/search-path policy, grants, RLS, trigger interplay, effective least privilege and transaction claims need independent DBA/security scrutiny against real signed-user staging.
- The PostgreSQL **SQL check time** for expiring proof/consent is not necessarily physical COMMIT time if callers hold external transactions open. This known unresolved policy is **not** silently claimed fixed.
- The source document is entered manually and not attested to HTML/website content. A source URL is citation metadata, not proof of accuracy. There is no live crawler activation, AI generation, approval or publication.
- Derived document/chunk and external index/provider erasure following withdrawal is **not solved**: KB-09T covers only synthetic quote evidence deletion. Independent privacy/legal decisions must determine retention, invalidation, erasure receipts, backups/logs and possible hold states. The source-backed V2 function is itself a preexisting migration and was not altered.
- Existing non-discovery manual knowledge creation and approval paths remain unchanged. The KB-10 application guard **`KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED` remains OFF**, and the new SQL only exists in `docs/sql`. An absent production RPC correctly fails closed.

## Pre-staging release constraints

Independent [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) security review, [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) privacy/legal/DBA retention decision, [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) paid-isolated staging, and [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) release gate remain **OPEN/BLOCKED, 0/16 independently witnessed real staging scenarios**.

The owner explicitly requires **STAGING ON HOLD**. Never provision staging or substitute Production/Recovery. Paid staging also remains deferred until business revenue and a separately approved fresh price/quote. No hosted SQL, real accounts/content, test tenant, new paid infrastructure, GitHub branch protection changes, protected merge or deployment is authorized.

**Before any release:** independent reviewers must author a real versioned migration based on current actual target schema and test it in an owner-approved dedicated isolated environment; review row locks, policy controls, audit, source status and physical COMMIT policy; witness exact tenant/session/revocation and source fidelity; and separately approve a protected merge/deploy/rollback plan. Green local tests close only the **synthetic engineering rehearsal**, not this gate.
