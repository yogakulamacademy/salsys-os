# KB-06A — Exact Tenant Discovery Consent and In-Flight Withdrawal Contract (DRAFT)

**Date:** November 6, 2026  
**Parent:** Current-mainline integration rehearsal Draft PR #582 (validated on commit `3305e4a16e3d6c144abfca079167d349fef621ac`).  
**Scope:** One missing real execution boundary, **not a live pilot**.

## Why this exists

Website/domain ownership, an exact-host pilot allowlist and an active tenant's explicit consent are separate requirements. Before KB-06A, the site discovery API and worker checked the first two but did not independently require an active purpose-specific consent record at scan creation, lease claim, before network operations, and immediately before database commits. That left queued and in-flight jobs potentially able to continue after withdrawal.

## Changes

- `docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql` is a **follow-on, unapplied SQL draft** for the previously unapplied KB-01B schema. It creates `knowledge_discovery_site_consents` with exact `organization_id`, `hostname`, purpose `website_discovery_review_only`, policy version, grantor, grant/expiry, status and withdrawal timestamp. RLS permits only the organization's authenticated admins to read the record; **no authenticated or anonymous write grants**. Only the service role can write, and no owner-consent issuance API has been added.
- The SQL replaces the **same existing** `claim_knowledge_discovery_job_v1()` and `commit_knowledge_discovery_page_v1(...)` signatures to check active tenant/host consent. Jobs without active consent are cancelled and old leases invalidated; the commit checks consent again, holding a row share lock to serialize with concurrent revocation before any new page state, links or counters can be written.
- `lib/knowledge-discovery/site-consent.ts` is a pure, fail-closed evaluator. Both the admin POST scan endpoint and worker refuse absent, revoked, expired, wrong-tenant or wrong-purpose consent. The GET workspace remains able to display historical job status but reports `discoveryEnabled=false` without consent.
- `lib/knowledge-discovery/consent-fetch.ts` wraps the existing restricted, pinned public transport and rechecks consent before a new robots/page/sitemap fetch and before redirect authorization. The production discovery adapter uses this wrapper. The existing SSRF, redirect, robots, DNS, domain ownership, quota and pilot-off checks remain in place.
- `tests/database/knowledge-discovery-consent.test.mjs` executes the **original KB-01B SQL plus the new KB-06A SQL** against a new random loopback-only PostgreSQL database, verifying cross-tenant denial, consent-bound claim, page commit refusal after withdrawal and tenant RLS. Existing discovery, finance and KB database tests continue to run in CI.
- `tests/knowledge-discovery/site-consent.test.mjs` and `consent-fetch.test.mjs` validate denied consent, exact host/purpose scope, revocation before network, and denial at redirect-time. All network work is simulated.

## Approval and deployment boundary

This draft does **not** specify, implement or assume a legally sufficient owner-consent mechanism. A production-ready consent grant/withdraw process must independently verify the signed-in owner/admin, active tenant binding, purpose, expiry, policy acknowledgement, and tamper-resistant audit. The service-role-only write access here is a **closed staging foundation**, not permission to auto-grant consent.

This draft SQL is **not** a Supabase migration; it must not be applied to Production or Recovery Rehearsal. Any future dedicated staging application requires a reviewed migration created through the supported Supabase CLI, an authorized staging project, migrations verified against the hosted database, and an independently witnessed withdrawal/retention/deletion rehearsal. Existing historical consent/quote retention requirements and the KB-04E 16 independent staging scenarios remain open.

### Known limits

A withdrawal can prevent *subsequent* outbound requests and commits, but cannot undo a network request that began before withdrawal. Short-running fetches must also have enforced timeouts. Revocation-aware authorization is checked before every separate fetch/redirect boundary; only a real isolated staging concurrency test can establish the race behavior with the actual hosted HTTP/DB scheduler.

This discovery consent purpose **does not** cover storing extracted quotations, retaining raw HTML, AI-provider use, reviewer approval or knowledge publishing. Those require separate explicit consent, retention/deletion/audit and human-review acceptance gates.

**No production SQL, consent state, website collection, AI call, customer evidence, knowledge action, merge, or deployment was changed.** The discovery pilot remains default OFF.

## Engineering validation

The exact-head stacked draft CI must pass `financial-database` (including the new disposable SQL test) and `validate` (source/security tests, typecheck, full Next.js build and all synthetic browser regressions). Passing CI is **not** permission to run a live crawl or to count any KB-04E real staging scenario complete.
