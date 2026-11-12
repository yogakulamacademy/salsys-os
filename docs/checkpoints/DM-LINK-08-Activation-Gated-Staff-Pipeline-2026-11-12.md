# DM-LINK-08 — Activation-gated staff pipeline and remaining closeout

**Checkpoint date:** 2026-11-12  
**Branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Status:** Offline policy code and tests only. NOT merged, deployed, or allowed to collect browser/Instagram customer data.  
**Roadmaps:** [#696](https://github.com/yogakulamacademy/salsys-os/issues/696), R2 release [#518](https://github.com/yogakulamacademy/salsys-os/issues/518), [#531](https://github.com/yogakulamacademy/salsys-os/issues/531).

## Specific unclosed gap resolved

DM-LINK-07C added a microsecond-accurate, committed-link activation guard, but DM-LINK-05/06's **staff review pipeline never called it**. A future caller could have supplied a visit observation to `projectDmLinkStaffEvidence` without first establishing that the link was active and CRM-bound when that visit occurred. It also could have described an uncommitted link as "no verified visit", creating a misleading staff task proposal.

New `lib/ai/dm-link-attribution-gate.ts` now exposes `gateDmLinkObservationHistory`: requires a **source-matched** committed registry row (tenant, lead, conversation, CRM outbound message and internal link ID), permitted purpose, unrevoked/nonexpired link, token digest match, independently verified source binding and accepted send, and actual database activation timestamp. All events in supplied history must belong to the same tenant/link and occur at/after activation. The current `now` must also remain in the permitted window. Any preactivation, expired, foreign, revoked, malformed or overlong event history denies the whole projection; it is **not** silently dropped and mistaken for no-click evidence.

`lib/ai/dm-link-review-pipeline.ts` now requires `verifiedRegistry` and invokes this gate **immediately after exact message binding** and before the send provenance check, country projection or staff task candidate. If the guard denies, the pipeline outputs `restricted`, null task/country and `automaticSendAllowed=false`.

This is a **defensive offline entry point**, not a trusted user-facing API. Future loaders must independently authenticate and verify registry row fields, purpose/consent, signed source provenance, exact digest/tenant match and immutable commit timestamps under an approved DB/privacy design. A client supplying true booleans cannot authorize tracking.

## Testing performed — exact limitations

- Added `tests/readiness/dm-link-attribution-gate-v1.test.cjs` (**12 focused tests**).
- Updated `tests/readiness/dm-link-review-pipeline-v1.test.cjs` to use the real attribution gate + real lifecycle proof, plus five suppression/negative tests (**27 pipeline tests**).
- Executed the **committed test callbacks** against committed function bodies in isolated V8 JavaScript with a narrow TypeScript-stripping/transpile shim: **12/12 activation-gate** and **27/27 pipeline** cases passed. The pipeline suite still uses a synthetic CRM binding and visit projection; its source classifier and human review policy are real.
- This is **not** native repository `npm run test:readiness`, full `tsc --noEmit`, GitHub CI/CodeQL, a real Supabase authenticated read, a Meta provider send, a first-party browser visit, signed-in 16-case staging or production E2E. No standalone GitHub Actions runs exist on this feature branch in prior checks.
- Local Git checkout failed due `github.com` DNS resolution. Native isolated tests remain a blocker, and no code reviewer has approved this feature.

## Exact remaining implementation / approval work

| Priority | Work | Operational status |
|---|---|---|
| P0 | Independent privacy/legal approval for person-linked course URL/approximate IP country, consent purpose, retention/withdrawal and erasure | Open |
| P0 | Independent security/DBA sign-off for approved schema, RLS/ACL, source identity and recovery gating | Open |
| P0 | Consolidate feature branch review and run actual repository native tests, TypeScript, CI/CodeQL | Open |
| P1 | Server-only tracked-link reservation registry with opaque HMAC token digest, atomic uniqueness, TTL, verified Meta-send-to-message transition, revocation and allowlisted destination | Not built |
| P1 | Approved first-party redirect and **purpose-gated** coarse network-country observation ledger with bot/prefetch/forward ambiguity; preactivation and missing tracking cannot imply no-click | Not built |
| P1 | Trusted tenant-scoped CRM evidence loader, complete sent→now inbound/task coverage, independent provider source verification; activation guard on real event ingestion and on staff pipeline reads | Not built |
| P1 | Atomic, idempotent human-review task insertion using existing SalsysOS Tasks & Follow-ups; live suppression recheck; no Instagram auto-send | Not built |
| P2 | Authorized isolated signed-in multi-tenant staging with consent tests, privacy/rollback cases and actual end-to-end browser/provider verification | 0/16, ON HOLD |
| P2 | Separate production merge/deploy/rollback GO and monitored acceptance | Blocked |

**Critical distinction:** offline tests demonstrate deterministic policy behavior, **not** real website clicks, customer-country detection, Meta delivery, CRM task creation, AI learning or pricing accuracy. Even a valid visitor-country signal is country of the **network serving a token-linked visit**, not the original recipient's verified residence, nationality or eligibility for a particular fee. A link could be forwarded, opened by a preview/scanner, or affected by a VPN.

## Outstanding external release hold

R2 #518/#531 remain NO-GO as checked this turn. The proposed recovery-standard revision is not fully independently accepted, the optional R2 behavioral collector stays OFF, Vercel staging CRM has no approved deployments and witnessed acceptance is 0/16 ON HOLD. The independent privacy and DBA approval chain and separate owner adoption decision remain controlling. This DM-LINK work does not lift any of those gates.

**Next justified action:** consolidate source/tests and obtain an actual no-deploy/native-CI review run, then independently review privacy/DBA registry contract. Only with separate approvals should the server registry, redirect, event ledger or task writer be created. No new API route, hosted SQL, customer data, paid staging, provider send, model training, merge or deployment was performed here.
