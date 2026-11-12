# DM-LINK-04 — Human Follow-up Candidate (offline, no writes)

**Date:** 2026-11-12  
**Status:** Implemented and locally unit-tested on isolated feature branch. NOT merged, staged, deployed, activated or independently reviewed.  
**Branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Roadmap:** [#696](https://github.com/yogakulamacademy/salsys-os/issues/696); release gates under [#518](https://github.com/yogakulamacademy/salsys-os/issues/518) and #531.

## Source read-only audit

Existing `lib/followups-data.ts` recognizes `human_review` in its `FollowUpTaskType` union and reads an authorized `get_followups_workspace` RPC. `app/follow-ups/page.tsx` renders existing task rows and staff completion/snooze actions. These are reused conceptual integration points, **not modified** by this checkpoint.

Existing `lib/journey-workspace.ts` already requires fresh CRM evidence (five-minute limit) and refuses to treat website visits as proof of intent/payment. `lib/ai/lead-context.ts` uses tenant+lead authorization for conversations/messages/tasks and notes that bounded reads are not complete lifetime evidence. Existing `app/conversations/instagram-actions.ts` can store an Instagram provider message ID after a human policy-checked send; a recorded "sent" state alone does **not** establish independent recipient delivery. `lib/tracking/runtime.ts` already has generic tracking event contracts and must not be bypassed.

**Important release context (2026-11-12):** roadmap #518 states R2 NO-GO; recovery approval is still proposed, not adopted. Staging acceptance is **0/16 on hold**, optional behavioral collection OFF, and no new paid staging or deployment is authorized.

## Committed implementation

- `lib/ai/dm-link-followup-candidate.ts` exports `buildDmLinkHumanReviewCandidate`, a pure, synchronous, no-side-effect function.
- Input must be server-produced: active tenant, authorized selected lead, exact CRM outbound message/source reference, linked opaque-link ID, permitted processing purpose, independent verified delivery, full-enough fresh inbound and task reads, opt-out and current stage, existing task check, reviewer assignment, and bounded 1–168-hour waiting policy.
- Output is an optional **proposed** existing CRM task-type `human_review` with safe generic text and deterministic internal idempotency key; no sender ID, IP, phone, price, country guess or unapproved link destination in task prose.
- Suppresses candidate if read is >5 minutes old, source is missing/partial, delivery merely accepted, customer replied, link expired or revoked, lead closed/deferred, tracking unavailable/ambiguous, visit observed, task already present, other open follow-up exists, or cross-tenant ownership is uncertain.
- `automaticSendAllowed: false` is invariant. No direct calls to Supabase, Meta, URL tracking endpoints, AI providers or scheduling tasks.

**A candidate's idempotency string is NOT an atomic uniqueness guarantee.** Any actual future task writer must take a fresh, authorized per-lead provider/suppression/read snapshot and insert via a reviewed transaction with unique constraint and race-safe duplicate detection. An empty task list from a fallback/partial RPC is NOT proven completeness. The proposed link ID must be an internal registry ID, not the raw URL bearer token.

## Verification performed this turn

A local standalone module copy was tested with installed Node.js and TypeScript:
- `NODE_PATH=$(npm root -g) node --test tests/readiness/dm-link-followup-candidate-v1.test.cjs`: **15 passed, 0 failed**.
- `tsc --noEmit --strict --target es2022 --module commonjs --moduleResolution node --lib es2022,dom lib/ai/dm-link-followup-candidate.ts`: **passed**.
- GitHub readback verified new `lib/ai/dm-link-followup-candidate.ts` and `tests/readiness/dm-link-followup-candidate-v1.test.cjs` on the isolated branch. Both are automatically picked up by the project's `tests/readiness/*.test.cjs` glob when its whole suite runs.

This is **not** full-repository CI, GitHub Actions, CodeQL, Supabase migration tests, end-to-end Meta acceptance or live user testing. The previous **46** local DM-LINK-01–03 tests were verified in the earlier checkpoint; only **15 new** standalone tests were run this turn.

## Remaining work / ordered prerequisites

1. Finish the existing **R2 recovery/security/privacy** and AI independent reviews. No new browser collector or Instagram send.
2. Get explicit lawful-purpose, first-party tracking notice/choice, retention and deletion policy approval for token-linked per-conversation country observations.
3. Audit an authorized full inbound/task read API and independent Meta delivery evidence. Where complete confirmation is impossible, show "Needs review / evidence unavailable" instead of claiming "did not click".
4. After the above, separately review and implement a protected link registry, safe first-party redirect, token revocation/expiry, trusted-edge coarse country observation, canonical replay-safe event storage and privacy review.
5. Only then propose a narrowly scoped transactional **human_review** task writer with unique idempotency, stop-on-reply and tenant/role rechecks, followed by owner-authorized signed-in staging and separate release. Automated DMs remain separately gated.

## Non-actions

No table, migration, API route, task insert, link issuance, live IP lookup, WhatsApp/Instagram provider request, tracking event, staged release, PR/merge, customer pricing rule, paid resource or model-training process was created. Existing `main`, production, consent collector OFF and staging hold remain unchanged.
