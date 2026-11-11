# DM-LINK-03 — Instagram message → link evidence → staff preview (offline integration contract)

**Date:** 2026-11-11  
**Scope:** Completed *offline-only* bounded association and staff projection contract; **no production/staging integration or feature activation**.  
**Branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Roadmap:** [#696](https://github.com/yogakulamacademy/salsys-os/issues/696) and [#518](https://github.com/yogakulamacademy/salsys-os/issues/518), with R2/AI hold controlling.

## Source-code reuse audit (read-only)

Verified from current GitHub `main`:
- `app/conversations/instagram-actions.ts` does authorized `can_work_lead`, tenant/lead-filtered Instagram `conversations`, protected provider-send-policy evaluation, Meta Send API, and stores `messages.external_message_id` when provider sends succeed. The send routine handles an outbound echo arriving before its own provider response. This code was **not changed**.
- `app/api/instagram/webhook/route.ts` processes scoped sender/account/message IDs, filters outbound echo and read receipts, and preserves a separate disabled-processing observation path. This code was **not changed**.
- `lib/integrations/instagram-profile-sync.ts` uses `instagram_user_id` in linked metadata. Current provider profile lookup contains only supported name/username, **not verified customer country**.
- `lib/ai/lead-context.ts` reads the selected tenant/lead and bounded `conversations`/`messages`/`tasks` under a fresh `can_work_lead` and organization membership gate; staff-only vs customer-draft separation already exists. No modifications.
- `docs/JOURNEY-EVIDENCE-CHECKPOINT.md` distinguishes bounded observed website data from customer identity, payment and consent. Its purpose-level consent remains **unknown** in production view and recommendations based on behavioral visits remain restricted.
- `lib/automation/instagram-operations.ts` and `app/conversations/instagram-actions.ts` already apply channel-specific send/stop checks. Do not create a second scheduler/provider send path.

**Important integration limit:** Some existing Instagram conversations may lack explicit `metadata.instagram_user_id` and rely on a fallback in the message composer. DM-LINK-03 deliberately **rejects** those ambiguous/older records until independent verified account/recipient linkage; do not auto-backfill by name. Likewise missing Meta message IDs must be reviewed, not assumed.

## Actual code committed on isolated feature branch

- `lib/ai/dm-link-crm-evidence.ts`
  - `bindDmLinkToCrmMessage`: pure association of proposed server-side link registry record to authorized `organization_id`, `lead_id`, exact Instagram `conversations.id`, `messages.id`, `external_account_id`, `instagram_user_id`, `messages.external_message_id` and link issue/send/expiry timeline. Missing, denied, cross-org, misbound or revoked inputs fail closed.
  - `projectDmLinkStaffEvidence`: pure staff-facing allowlisted projection that reuses the DM-LINK-02 coverage classifier and DM-LINK-01 human attention evaluator. Exposes link-visit status, *approximate observed network country*, source message reference, bounded visit count, and proposed staff attention reason. It strips recipient/account/token IDs and all raw chat body/metadata; preserves `countryOfResidenceVerified=false`, `pricingEligibility='undetermined'`, `canAutoSend=false`.
  - The `link` input is an **intended future server-only registry schema**, not an existing deployed Supabase table. All inputs must originate from an independently verified authorized, tenant-filtered server loader; client-supplied `staffCanWorkLead`, purpose permission or provider send state are not security authority.
- `tests/readiness/dm-link-crm-evidence-v1.test.cjs`: 15 tests for exact associations, revoked/mismatched links, missing provider MID, old/foreign tenant/lead, request/record policy, safely redacted staff preview, ambiguous/no click, forbidden auto-sends and country-vs-pricing independence.

## Executed verification

Executed in local temporary checkout using source-matching copies:
- `NODE_PATH=$(npm root -g) node --test tests/readiness/dm-link-*.test.cjs` — **44 tests passed, 0 failed** (existing DM-LINK-01/02 + new DM-LINK-03).
- `tsc --noEmit --strict --target es2022 --module commonjs --moduleResolution node --lib es2022,dom --skipLibCheck lib/ai/dm-link-crm-evidence.ts lib/ai/dm-link-coverage.ts lib/ai/dm-link-intelligence.ts` — **passed**.
- New source/test contents were saved in GitHub and read-back compared by file size and key text. GitHub branch comparison shows only additive files. **Do not describe these synthetic tests as a real user/Meta flow.**

Not run: repo-wide `npm run test:readiness`, full Next build, GitHub Actions/CodeQL, database migration, Vercel test, Meta provider live messaging, real visitor click, signed-in tenant A/B acceptance, independent reviewer approval, production rollback.

## Next integration contract — blocked until approvals

**A. Authorize first:** owner-defined privacy purpose and lawful per-conversation link attribution; retention/erasure; R2 consent acceptance; messaging channel permissions; DBA/security review of tenant-safe storage. R2 collector OFF and no paid staging are standing constraints.

**B. Proposed minimum server-side registry (not created):** organization_id; lead_id; conversation_id; CRM outbound message id; exact provider account/user/message ID; opaque random token **digest only** (HMAC); approved destination reference; issue/expiry/revoked timestamps; policy version/consent evidence. Add uniqueness for tenant + outgoing message/intent and safe deterministic redirect destination; never disclose raw identifier/token from public APIs. Do not reuse a generic browser session ID as customer identity.

**C. Proposed event adapter (not created):** first-party course link `/go/<opaque>` → approved single-host redirect and purpose-aware coarse trusted-edge country (where permitted) → distinguish preview/prefetch/forward from a likely browser observation → restrict link association by server registry, tenant and permission → append canonical observed event with replay idempotency and correction/deletion support. An open is not proof original IG recipient personally clicked, nor a residence/price tier.

**D. Proposed follow-up task adapter (not created):** under actual session/lead/role authorization and fresh provider reply/suppression/task state, derive `staff_review_due` from link coverage; use one database transaction/unique key for idempotency; staff task and appropriate channel window warning only. No automatic DM. Observed visits, expired links, unavailable consent/coverage, opt-outs, replies, manual takeover and already-enrolled stage suppress no-click claims.

**E. Rollout gates:** independent review and versioned migrations in a properly isolated permitted environment, actual signed-user tenant boundary tests, crawler/forward/VPN replay scenarios, checkout quote separation, and explicit owner deployment authorization. Preserve current 0/16 staging hold until expressly released.

## Completion boundary

**Complete now:** Offline association + staff evidence model and synthetic tests committed to isolated feature branch.  
**Incomplete:** Actual Supabase link record, redirect, country lookup, live website analytics, task insertion, Instagram sends, autonomous AI model, pricing selection, consent approval, independent review, staging, production deployment.  
**No merge/PR needed or authorized at this checkpoint.** This doc records what to resume next after review gates.
