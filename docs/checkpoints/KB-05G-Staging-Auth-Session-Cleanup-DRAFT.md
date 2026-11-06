# KB-05G — Staging Auth Session Cleanup on Every Exit (DRAFT)

**Date:** November 6, 2026  
**Stack:** KB-05F Draft PR #579 → KB-05G, NOT `main`.  
**Scope:** Offline code/tests for the manually authorized KB-05D read-only staging verifier. The staging workflow is **not executed** in CI or in this checkpoint.

## Problem closed by the proposed code

The KB-05D staging test signs in two real synthetic Supabase Auth accounts. Those password logins **create Auth sessions** even though knowledge-data checks are GET-only. Before KB-05G the runner returned or threw without signing those sessions out, leaving test refresh tokens active until expiry or manual cleanup.

Supabase's documented sign-out default is **global**, which would terminate other sessions for the same user. The auth service supports **local**, explicitly `POST /auth/v1/logout?scope=local`, for the current session only. See [Supabase Auth sign-out documentation](https://supabase.com/docs/guides/auth/signout) and the [GoTrue logout endpoint](https://github.com/supabase/auth/blob/master/openapi.yaml).

## Engineering change

In `scripts/verify-kb-isolated-staging-readonly.mjs`:

- Register each access token immediately after a successful password-login response, **before** checking the claimed user, the authoritative `/auth/v1/user` endpoint and JWT consistency. A later wrong-user/claim failure cannot silently leave that newly issued session out of the cleanup list.
- Always attempt to revoke **every** newly issued session token, in reverse order, on **success and every failure path**. The cleanup executes after the read/authorization assertions and does not depend on their outcome.
- Restrict all additional POSTs to the exact `/auth/v1/logout?scope=local` endpoint **with a bearer access token**. Never use global or others scope, no token-less logout, no knowledge POST/PUT/PATCH/DELETE, and no third-party host.
- Require HTTP **204 No Content** for each attempted session-local logout. If a logout fails, continue attempting the other session's cleanup and mark the entire run **failed** with `kb_staging_auth_session_cleanup_incomplete` even when the preceding 12 read-only checks passed.
- Deduplicate identical access tokens before cleanup; the verifier separately fails if the two authenticated test users report the same session ID.
- The successful summary returns only aggregate counts and flags: `localSessionRevocationsAcknowledged`, `authLogoutScope='local'`, and `accessTokensMaySurviveUntilJwtExpiry=true`. No tokens, passwords, names, customer quotations or fetched content are logged. The pre-existing `stage:'KB05D'` contract is preserved.

The offline mock covers successful cleanup, wrong-user after issued token, failed second login, failed Auth-user confirmation after token issuance, duplicate session IDs, detected cross-tenant leakage, missing positive fixtures, and **logout failures** that must invalidate an otherwise passing result.

## Important limitations

A 204 response acknowledges **local refresh-session revocation**, not instantaneous access-token invalidation. Supabase documents that access JWTs may remain usable until their encoded expiry. We do not claim that cleanup guarantees immediate denial for already-issued JWTs. A lost response to a successful server-side sign-in might also leave a session without a locally known token; the next real acceptance protocol must include short access-token TTL, independent session/audit monitoring and a manual emergency revocation procedure.

The default GitHub workflow remains **manual-only**, with exact staging commit/branch/project matching plus separately required GitHub environment approval. No protected environment settings can be independently verified using this repo connector, and no dedicated KB staging Supabase project has been authorized. Production and Recovery Rehearsal are excluded.

## Validation and release boundary

The KB-05G draft requires exact-head CI `validate` (Node source regressions, TypeScript, Next.js build, synthetic Chromium) and `financial-database` (rollback-only local PostgreSQL). CI does **not** call the real sign-in/sign-out endpoints; network responses are mocked.

Passing CI will **not** complete KB-04E's 16 real staging acceptance scenarios or authorize a production merge, website crawl, consented evidence storage, model call, knowledge approval or deployment. All KB drafts remain unmerged pending independent product, security, privacy and tenant review.
