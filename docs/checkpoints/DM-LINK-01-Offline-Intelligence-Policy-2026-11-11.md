# SalsysOS DM-LINK-01 — Offline intelligence policy checkpoint

**Date:** 2026-11-11  
**Status:** Implemented in isolated feature branch, **NOT merged, deployed, reviewed or activated**  
**Feature branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Base main:** `01a83d5190b25d2b0c77f18d3b90be59fded6499`  
**Roadmap:** [#696](https://github.com/yogakulamacademy/salsys-os/issues/696) and existing R0–R14 roadmap #518.  
**Full design:** [DM link country/no-click guideline](https://github.com/yogakulamacademy/salsys-os/blob/planning/kraya-informed-sales-execution-20261111/docs/strategy/SalsysOS_Instagram_DM_Link_Country_And_No_Click_Queue_2026-11-11.md).

## Actual code added (no runtime wiring)

- `lib/ai/dm-link-intelligence.ts` — deterministic country-of-*visit* evidence classifier and proposed staff-attention decision function. Rejects mismatched tenants, revoked links, missing processing-purpose permission, bot/preview/forward ambiguity and invalid timestamps. Preserves `customerResidenceVerified=false` and `priceEligibility='undetermined'` under all result paths.
- `lib/ai/dm-link-token.ts` — CSPRNG 256-bit opaque tokens, HMAC-SHA256 server-keyed token digest and timing-safe digest comparison. No public endpoint and no persistence.
- `tests/readiness/dm-link-intelligence-v1.test.cjs` — 14 offline node:test cases covering valid token/country, negative privacy cases, proxy/referrer/preview/forward boundaries, no-click staff queue safety, idempotency task key and no automatic send.

**Tests executed in temporary standalone local copy** (not the full repository checkout):

```text
NODE_PATH=$(npm root -g) node --test tests/readiness/dm-link-intelligence-v1.test.cjs
14 passed; 0 failed

tsc --noEmit --strict --target es2022 --module commonjs \
  --moduleResolution node --skipLibCheck \
  --typeRoots <available Node @types location> \
  lib/ai/dm-link-intelligence.ts lib/ai/dm-link-token.ts
Passed in isolated local copy.
```

The repository declares TypeScript and `@types/node` in development dependencies, and its `npm run test:readiness` uses `node --test tests/readiness/*.test.cjs`, so the new test file should be included when **CI is actually run**. **No full-repository CI, CodeQL, Next build, live Meta test or signed-in acceptance was run for this branch.** The local checks are not staging or production evidence.

## Explicit limitations — next steps, not done

1. **DM-LINK-00 privacy gate (still pending):** legally reviewed processing purpose, consent/notice, retention/deletion policy, approved website/IP country derivation, trusted edge and identity binding.
2. **Provider / user-action gate (pending):** confirm which Instagram outbound actions and windows may send link to the particular already-initiated conversation. Existing Instagram-app outgoing echo is separately deferred. No new send flows.
3. **Link registry / redirect (pending):** server-only token issuance bound to authenticated tenant/lead/message and approved recipient; HMAC digest persistence and TTL; domain allowlist, safe redirect, bot/preview distinction, no token leak or cross-tenant lookup. Needs separately reviewed SQL/RLS and idempotency.
4. **Click evidence path (pending):** first-party country observation with source, event time and processing-policy receipt; no assumption that link opener is the original recipient; do not turn network visit country into residence/Indian pricing eligibility.
5. **Staff attention persistence (pending):** owner-approved wait period, CRM authorization, review policy, lead-state recheck, idempotent task insertion with race-safe transaction, safe delayed-event reconciliation, no auto-send.
6. **Human acceptance (pending):** independent code/security/privacy and DBA review, synthetic and user-witnessed cases in authorized isolated staging, rollback and owner release decision.
7. **Model training (not part of this code):** historical chat learning and a future supervised next-best-action model remain separate proposal phases, not implemented by this deterministic policy module.

## Release hold preserved

- R2 behavior collector **OFF**; 0/16 witnessed acceptance as recorded in roadmap #518 at this checkpoint.
- Existing draft AI/KB integration/reviews (PR #671/#676/#678/#679/#692/#695) unchanged.
- No product changes, test user data, real customer link generation, Meta messages, tracking, new paid staging, database SQL, AI model provider calls, new environment flags, merge or production deployment.
- Branch should remain **not ready for merge** until its separate authorizations and reviews are completed. Do not create a preview deployment merely to validate these offline functions before cost/privacy policy approval.

## Handoff

Next step is an **approved read-only integration inventory** of the existing Instagram conversation/sent-message records, universal event/consent framework and first-party website redirect handling. Decide whether a useful link click can be measured under existing lawful purpose. Only after this can the separate endpoint/database implementation be scoped. Integrate with existing systems rather than duplicate tenant identity or data stores. The user's prior request to defer staging remains controlling.
