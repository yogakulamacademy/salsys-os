# DM-LINK-07 — Two-phase link registration and consolidation review

**Date:** 2026-11-12  
**Branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Milestone:** DM-LINK-01 through DM-LINK-07 offline foundations consolidated for **independent review**, NOT approved for staging, database migration or live tracking.  
**Roadmap:** [#696](https://github.com/yogakulamacademy/salsys-os/issues/696), R2 [#518](https://github.com/yogakulamacademy/salsys-os/issues/518) and [#531](https://github.com/yogakulamacademy/salsys-os/issues/531).

## User-required outcomes (do not reinterpret)

1. The CRM can prepare an eligible unique course link for an Instagram lead, so a click can eventually provide an **approximate country of that website visit** without requiring a form. An HTTP request/forwarded link/crawler does not establish who clicked or where they live; never infer nationality or price eligibility from the visit.
2. Leads without a verified link visit may enter a **human staff review queue**, with truthful delivery uncertainty and suppression after reply, opt-out, existing task, manual handling, closure or tracking restriction. No automatic prohibited DM.
3. Use the existing scoped CRM `leads`/`conversations`/`messages`/`tasks`, provider MID and Customer Journey events. Do not introduce a parallel customer graph or a second message scheduler.
4. Preserve R2 behavioral collector OFF, 0/16 staged witnessed acceptance on hold, and separate human privacy, recovery/DBA and security release decisions.

## Material lifecycle gap closed in offline code

The public URL must be present in the Instagram DM **before** Meta returns its provider message ID. The previous association contract required that provider ID, so safe delivery requires **two stages**:

**Stage A — prepare/reserve (future, not implemented):** Privileged server checks tenant, lead, conversation, channel window, consent purpose, approved destination and send eligibility; creates a cryptographically random opaque URL token and writes **only its HMAC digest** with a unique internal registry ID, exact Instagram account/recipient and stable dispatch-attempt ID; stores `state='reserved'`, expiry and row version. Token remains private to the approved outgoing DM construction flow.

**Stage B — finalize (offline transition policy now implemented):** After the existing authorized Send API and existing message log return, reconcile the exact CRM outbound message and Meta MID to the same attempt, tenant, conversation, account and recipient; independently verify provider acceptance provenance. A compare-and-swap update at the expected row version may activate the record. Unknown send outcomes (including timeouts) stay reserved/held: **never automatically resend**; definitive failures are retired, and accepted-but-unbound outcomes require manual review.

**Stage C — website request (future, NOT implemented):** A token pointing at a *reserved/unbound/expired/revoked* registry row may only receive a separately approved **privacy-safe course-page redirect**; it must **not** create a per-lead click/country observation. Only a genuinely committed `active` row, correct bearer-token digest, correct tenant, authorized purpose and trusted visitor-event gates can support token-linked observation. Redirect behavior must not allow an open redirect, raw visitor IP persistence, raw token leakage into third-party referrers, or artificial crawler hits counted as humans.

**Stage D — staff follow-up (future, NOT implemented):** A fresh tenant-scoped read of exact message send evidence, available click history, task set, lead state, replies and suppressions feeds DM-LINK-01–06's staff-only recommendation. The future task write needs a transactional unique key; a deterministic string returned from a pure function does not provide race-safe idempotency.

## Implementation committed now

- `lib/ai/dm-link-registry-lifecycle.ts`: pure `planDmLinkReservationTransition` (`hold`/`activate`/`retire`/`manual_review`) and `evaluateDmLinkCommittedAttribution` that fails closed for any unbound/uncommitted/revoked/expired/cross-org token state.
- `tests/readiness/dm-link-registry-lifecycle-v1.test.cjs`: 28 constructed `node:test` cases (18 transition scenarios and 10 attribution scenarios) using the existing TypeScript test helper conventions.
- No SQL, permissions, RLS, server routes, consent SDK, Instagram API calls, website analytics, scheduler, UI, model calls or customer data were added.

**Testing honesty:** The exact new function bodies were executed as JavaScript after removing TypeScript annotations in a self-contained in-memory runner: **28/28 assertions passed**. The new `node:test` file was **committed but not executed using the real repository test runner**. GitHub read-back verified both new source and test file paths and exact lengths (7,539 and 5,499 characters). The repo declares `node --test tests/readiness/*.test.cjs` and TypeScript 5.9.x. GitHub currently returns **zero Actions runs for this feature branch**. Local Git checkout is unavailable because DNS/network access to github.com failed in the execution container. No full TS typecheck, CI, CodeQL, integrated test, two-tenant staging acceptance or independent review can be claimed.

## Read-only integration audit and review-contract requirements

Repository evidence inspected:
- `app/conversations/instagram-actions.ts` policy-checks a human response then sends and logs an outbound CRM row and Meta `external_message_id`. Provider accepted is not recipient delivered.
- `app/api/instagram/webhook/route.ts` signs/ingests Instagram events; outbound echo and conversation watermark paths have separate safety gates, and a watermark is not a per-message delivery.
- `supabase/migrations/001_initial_crm.sql` contains the original `messages.external_message_id`, `sent_at`, `delivered_at` and `tasks.task_type='human_review'` types; later tenant and RLS additions are not independently verified against current deployed DB in this checkpoint.
- `lib/ai/dm-link-instagram-send-evidence.ts` classifies reviewed manual sends and signed outbound echoes as **accepted but delivery-unconfirmed**; source metadata alone is **not** cryptographic proof. An independently authenticated server adapter must establish lineage.

Proposed minimum **DBA review contract** (do not create until approvals):
- Private registry: tenant/lead/conversation/account/recipient/attempt scope, internal ID, `token_digest`, approved destination, reserved/active/retired state, version, issue/expiry/revoke timestamps; a nullable CRM message/provider MID during reservation; **uniqueness of tenant+attempt and final tenant+provider MID after reconciliation**.
- Private event ledger: tenant+internal link+opaque canonical event key, event time, coarse network-country provenance and bot/forward ambiguity, permitted purpose/version, expiry/deletion marker. No customer IP, profile citizenship, name or unverified residence in link event facts. Be explicit about collection consent and retention.
- Database transitions: lock exact reservation row + validate tenant, message and provider source, session/role and purpose **inside the transaction**, apply conditional version+state update, enforce uniqueness and record append-only audit. Do not call a public `SECURITY DEFINER` RPC or grant anonymous read/write without a distinct independent security approval.
- Public /go redirect: fail closed for token derivation; allowlisted HTTPS destination only, privacy-safe safe fallback for unbound/unknown/revoked/expired tokens, rate limits, referrer/log leakage prevention, no cross-tenant existence oracle. The first-party redirect and browser-confirmed visit distinction requires human-approved consent policy.
- Existing `tasks`: idempotency belongs in a reviewed unique DB constraint and fresh transaction, not duplicated in application-only memoization. Task represents **human attention**, never consent to outbound messaging.

## Review gates still unresolved

1. **Privacy/legal:** explicit user notice and permitted purpose for per-conversation link attribution, coarse IP country derivation, retention, withdrawal and deletion; R2 collector remains OFF.
2. **DBA/security:** verified current schema/tenancy, private registry/event ACL, final source-message lineage, idempotency and atomic stop-on-reply; no migrations or hosted changes approved.
3. **Meta/provider:** real send window/opt-out/acceptance evidence and rate conditions; do not infer delivery from `sent` or Instagram conversation watermark.
4. **Integration QA:** full repo readiness/TypeScript/CodeQL, token scanners/forwards, race/replay and invalid-host scenarios, signed-in tenant A/B, 16 staged R2 cases and recovery; current staging ON HOLD.
5. **Separate owner sign-off:** only after independent recovery + security/privacy reviews and released staging hold. No PR, merge, deploy or production changes from this checkpoint.

## Engineering status and next action

This milestone makes the **reservation-to-verified-message timing contract reviewable** while the official R2 release remains **NO-GO**. The next useful step is an independent review of these source contracts and evidence, plus a fully isolated CI/test run after the current approval boundary. **Do not build a live redirect, country capture, token-linked person tracking or task writer yet.**

**No automatic outreach or approved rate change; no customer data moved.**
