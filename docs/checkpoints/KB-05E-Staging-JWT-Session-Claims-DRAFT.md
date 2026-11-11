# KB-05E — Staging JWT Session Claim Consistency Gate (DRAFT)

**Date:** 2026-11-06  
**Parent:** KB-05D Draft PR #574, stacked on earlier unmerged KB drafts.  
**Branch:** `feature/kb05e-verified-staging-jwt-session-claims`

## Purpose

KB-05D verifies two test accounts by calling the **real staging Supabase Auth** `/auth/v1/user` endpoint after password login. That endpoint is the authoritative token/session validity check. KB-05E adds a *local consistency check on the same already-validated access token* before any knowledge-data read begins.

**JWT parsing in KB-05E does not cryptographically verify a signature.** It may be used **only after** the real project's Auth endpoint validates the same exact bearer token. It does not prove a matching tenant binding in the database.

## Implementation

New pure `scripts/verify-kb-staging-jwt-claims.mjs` exports `inspectValidatedStagingJwtClaims`. It rejects tokens that do not meet every requirement:

- Well-formed, bounded 3-part JWT with supported signing algorithm header (not `none`), and JSON object claims.
- Exact `sub` matching the configured and Auth-confirmed test account user ID.
- Exact `iss` matching `https://<protected-staging-project-ref>.supabase.co/auth/v1`.
- Role and audience include `authenticated`; not `anon` or `service_role`.
- A syntactically valid, nonempty UUID `session_id` claim—no legacy singleton-membership fallback and no proxy role shortcut.
- Safe issued/expiry times and optional `nbf`; at least 90 seconds validity remaining, with bounded clock skew.
- **Different** session IDs for test users A and B.

The existing KB-05D runner still makes only the two explicitly permitted Auth password sign-in POST calls, then the configured Auth user GET requests and 12 GET-only knowledge-data checks. JWT inspection is local. All error messages omit credentials, tokens, access-token claims and retrieved content.

New `tests/knowledge-extraction/kb-staging-jwt-claims.test.mjs` covers wrong identity/issuer/role/audience, absent/malformed sessions, rejected unsigned algorithm, malformed token, expired and future-issued tokens. Existing mocked KB-05D tests now return realistic synthetic JWT strings and reject duplicate sessions, without any real network call.

## Trust boundaries and acceptance limits

- The **real Supabase Auth service** must validate the same bearer token first. Do not use a locally decoded payload as independent authentication.
- JWT `session_id` existence is **not proof of a `tenant_session_bindings` row**, active membership, active organization, consent, or website ownership. KB-05C's exact tenant-binding test remains a *disposable PostgreSQL candidate* only.
- A successful manually approved KB-05D/05E staging run will verify only the listed two-user, 12-read checks and these token claim consistencies, not all KB-04E 16 independent staging scenarios.
- No live staging was provisioned or accessed to develop this checkpoint. The separate manual `workflow_dispatch` must remain disabled until a dedicated, owner-approved project and protected GitHub environment exist.

## Non-actions

No app route or production migration changes; no modification to Auth policies, knowledge tables, grants, RLS, consent, crawler, model provider, storage, customer data, or automatic publishing. No main merge or deployment.

## Engineering validation

The exact-head stacked CI `validate` job must pass the extended source tests, TypeScript, build and browser regressions. The existing isolated PostgreSQL `financial-database` suite must also pass. Only then mark this **engineering checkpoint** validated—never a production release.
