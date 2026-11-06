# KB-01I — Race-Safe Website Ownership Challenges

**Date:** November 6, 2026  
**Repository:** yogakulamacademy/salsys-os  
**Branch:** feature/kb01-public-website-scope  
**Pull request:** #538 — draft, unmerged

## Why this checkpoint was needed

KB-01H had application-level `read → check cooldown → upsert` behavior for ownership-token issuance. Two parallel administrator requests could both pass the check and overwrite one another's token. Repeat `PUT /verification` calls could also initiate unrestricted robots/proof fetches against an allowlisted website. This would be unsafe for a general-purpose CRM.

## Implemented (code only; staged SQL still NOT applied)

1. **Atomic issuance:** The proposed SQL adds `issue_knowledge_discovery_domain_challenge_v1(org,hostname,user,hash)`. It uses a per-organization, per-host transaction advisory lock, then enforces the existing 5-minute issuance cooldown and the existing 30-day verified state before updating one hashed challenge. The database creates the 24-hour expiry. The API returns only the successfully issued token.
2. **Budgeted proof fetches:** `claim_knowledge_discovery_proof_check_v1(org,hostname,hash)` uses a conditional, row-locking UPDATE of `last_check_at`. Only one proof check per 30 seconds is granted for the currently issued, unexpired challenge. Rejected checks perform **no outgoing HTTP requests**.
3. **Service-only boundaries:** Both functions are `security invoker`, explicitly check service-role JWT claims, and revoke execute permissions from public/anon/authenticated. Tenant proof table RLS and SELECT restrictions remain in place.
4. **HTTP responses:** Concurrent issuance returns 429 (cooldown), already-verified website returns 409, and an immediate repeat verification check returns 429. API still requires authenticated tenant admin, approved exact hostname, HTTPS and pilot enablement.
5. **Tests:** Disposable PostgreSQL tests verify two simultaneous issuance attempts produce only one stored hash; another attempt gets `domain_challenge_cooldown`; simultaneous proof-check claims grant only one fetch; a new check is accepted after the 30-second window; stale token/unprivileged calls fail. Synthetic route tests cover challenge issuance, 422 mismatched proof, rate-limited repeat, then success after a simulated cooldown.

## Status

- No migration was applied anywhere. The SQL remains a **DRAFT** at `docs/sql/KB-01B-discovery-schema-DRAFT.sql`.
- The latest-head discovery, TypeScript and disposable PostgreSQL tests passed at the time of this checkpoint. Final Next.js build, Playwright and CodeQL must still be checked against the exact current branch head.
- No real verification token was issued, no customer website scanned, no automation enabled, no AI knowledge published, and no production/recovery DB write occurred.

## Required before production use

1. Generate the official migration with Supabase CLI in a repository checkout, check migration history and apply/rehearse **only on a separately approved staging project**.
2. Test genuine pinned HTTPS proof fetches and crawler routes with a controlled staging website and real authenticated users, including concurrent administrators and request-rate exhaustion.
3. Establish server-side monitoring for auth failures, repeated proof attempts, crawler failures, rate limits and rollback/stop paths.
4. Reconcile main branch (including other contributors' CI changes) without destructive merges.
5. Obtain explicit user approval before merge, production migration, deployment, scheduled crawling or customer-data collection.

## Next milestone

KB-01J is **isolated staging acceptance and migration rehearsal**, not another synthetic-only release claim. If a dedicated staging project is unavailable, retain draft status and begin the independent KB-02 extraction prototype without connecting it to unverified customer data.
